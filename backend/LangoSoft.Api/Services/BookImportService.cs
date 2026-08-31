using LangoSoft.Api.Data;
using LangoSoft.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace LangoSoft.Api.Services;

public class BookImportService(AppDbContext db, IHttpClientFactory httpClientFactory, ILogger<BookImportService> logger)
{
    private record BookConfig(
        string Title, string Author, string Url, string? ChapterPattern,
        RegexOptions ChapterRegexOptions = RegexOptions.IgnoreCase | RegexOptions.Multiline,
        bool GroupByAct = false,
        bool StripHtml = false,
        string Language = "en",
        string GroupByActPattern = @"^ACT [IVX]+",
        bool IsPoetry = false,
        string? CompanionUrl = null,
        string? CompanionChapterPattern = null);

    private static readonly BookConfig[] BookCatalog =
    [
        new("The Picture of Dorian Gray", "Oscar Wilde",
            "https://www.gutenberg.org/files/174/174-0.txt",
            @"(?:THE PREFACE|CHAPTER [IVXLC]+\.?)"),

        // Case-sensitive + Multiline: TOC uses mixed-case "Scene", body uses all-caps "SCENE"
        // so no false matches from the inline table of contents.
        // Acts (^ACT) match col-0 only; the TOC has " ACT II" with a leading space.
        new("Hamlet", "William Shakespeare",
            "https://www.gutenberg.org/files/1524/1524-0.txt",
            @"^ACT [IVX]+|^ ?SCENE [IVX]+",
            RegexOptions.Multiline,
            GroupByAct: true),

        new("Julius Caesar", "William Shakespeare",
            "https://www.gutenberg.org/files/1522/1522-0.txt",
            @"^ACT [IVX]+|^ ?SCENE [IVX]+",
            RegexOptions.Multiline,
            GroupByAct: true),

        new("Politics and the English Language", "George Orwell",
            "https://www.orwell.ru/library/essays/politics/english/e_polit",
            null, StripHtml: true),

        // Italian original — file uses "  Inferno • Canto I" style headers
        new("La Divina Commedia", "Dante Alighieri",
            "https://www.gutenberg.org/files/1012/1012-0.txt",
            @"^\s+(?:Inferno|Purgatorio|Paradiso)\s+[•·]\s+Canto\s+[IVXLCDM]+",
            RegexOptions.Multiline | RegexOptions.IgnoreCase,
            Language: "it",
            IsPoetry: true,
            CompanionUrl: "https://www.gutenberg.org/files/1004/1004-0.txt",
            CompanionChapterPattern: @"^(?:Inferno|Purgatorio|Paradiso): Canto [IVXLCDM]+"),
    ];

    public async Task ImportAllBooksAsync()
    {
        foreach (var config in BookCatalog)
        {
            var existing = config.CompanionUrl != null
                ? await db.Books
                    .Include(b => b.Chapters).ThenInclude(c => c.Paragraphs)
                    .FirstOrDefaultAsync(b => b.Title == config.Title)
                : await db.Books.FirstOrDefaultAsync(b => b.Title == config.Title);

            if (existing != null)
            {
                // Back-fill companion text for books imported before this feature existed
                if (config.CompanionUrl != null)
                {
                    var needsPairing = !await db.Paragraphs
                        .AnyAsync(p => p.Chapter.BookId == existing.Id && p.LongfellowText != null);
                    if (needsPairing)
                        await PairCompanionTextAsync(existing, config.CompanionUrl,
                            config.CompanionChapterPattern, RegexOptions.Multiline | RegexOptions.IgnoreCase);
                }
                continue;
            }

            await ImportBookAsync(config);
        }
    }

    private async Task ImportBookAsync(BookConfig config)
    {
        logger.LogInformation("Downloading {Title}...", config.Title);

        var client = httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(15);
        string text;
        try
        {
            text = await client.GetStringAsync(config.Url);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to download {Title}. Skipping.", config.Title);
            return;
        }

        if (config.StripHtml)
            text = Regex.Replace(text, "<[^>]+>", " ");
        var content = ExtractMainContent(text);
        // For GroupByAct books (plays), skip the empty-section filter so that ACT headers
        // survive long enough for CombineActAndSceneTitles to read them, then we filter below.
        var sections = SplitIntoSections(content, config.ChapterPattern, config.Title,
            config.ChapterRegexOptions, filterEmpty: !config.GroupByAct);
        if (config.GroupByAct)
        {
            sections = CombineActAndSceneTitles(sections, config.GroupByActPattern);
            sections = sections.Where(s => SplitParagraphs(s.Body).Count > 0).ToList();
            if (sections.Count == 0) sections.Add((config.Title, content));
        }

        // Build the full object graph in memory before touching the DB —
        // this way a failed download never leaves a half-imported book visible.
        var book = new Book { Title = config.Title, Author = config.Author, Language = config.Language };
        int chapterNum = 0;
        foreach (var (title, body) in sections)
        {
            var chapter = new Chapter
            {
                Number = chapterNum++,
                Title = title.Trim()
            };
            var rawParagraphs = SplitParagraphs(body, config.IsPoetry);
            chapter.Paragraphs = rawParagraphs
                .Select((text2, idx) => new Paragraph { Index = idx, Text = text2 })
                .ToList();
            book.Chapters.Add(chapter);
            logger.LogInformation("  Ch {Num}: {Title} ({Count} paras)", chapter.Number, chapter.Title, rawParagraphs.Count);
        }

        db.Books.Add(book);
        await db.SaveChangesAsync();

        if (config.CompanionUrl != null)
            await PairCompanionTextAsync(book, config.CompanionUrl, config.CompanionChapterPattern,
                RegexOptions.Multiline | RegexOptions.IgnoreCase);

        logger.LogInformation("Done: {Title} — {Count} chapters.", config.Title, chapterNum);
    }

    private async Task PairCompanionTextAsync(Book book, string companionUrl, string? companionPattern, RegexOptions regexOptions)
    {
        logger.LogInformation("Fetching companion text for {Title}...", book.Title);
        var client = httpClientFactory.CreateClient();
        string companionText;
        try { companionText = await client.GetStringAsync(companionUrl); }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to fetch companion text for {Title}. Skipping.", book.Title);
            return;
        }

        var content = ExtractMainContent(companionText);
        var sections = SplitIntoSections(content, companionPattern, "", regexOptions, filterEmpty: true);

        var orderedChapters = book.Chapters.OrderBy(c => c.Number).ToList();
        int paired = 0;
        for (int ci = 0; ci < Math.Min(orderedChapters.Count, sections.Count); ci++)
        {
            var chapter = orderedChapters[ci];
            var (_, body) = sections[ci];
            var companionParas = SplitParagraphs(body, preserveLines: true);

            var orderedParas = chapter.Paragraphs.OrderBy(p => p.Index).ToList();
            for (int pi = 0; pi < Math.Min(orderedParas.Count, companionParas.Count); pi++)
            {
                orderedParas[pi].LongfellowText = companionParas[pi];
                paired++;
            }
        }

        await db.SaveChangesAsync();
        logger.LogInformation("Companion text: paired {Count} stanzas for {Title}.", paired, book.Title);
    }

    // Prefix scene titles with their containing act: "ACT I · SCENE II".
    // Act-only sections (empty body between ACT and first SCENE) are dropped.
    internal static List<(string Title, string Body)> CombineActAndSceneTitles(
        List<(string Title, string Body)> sections,
        string actPattern = @"^ACT [IVX]+")
    {
        var actRegex = new Regex(actPattern, RegexOptions.IgnoreCase);
        string currentAct = "";
        var result = new List<(string Title, string Body)>();
        foreach (var (title, body) in sections)
        {
            var t = title.Trim();
            if (actRegex.IsMatch(t))
            {
                currentAct = t;
                // Act header has no body (SCENE follows immediately) — keep it so
                // the paragraph filter in SplitIntoSections can remove it later.
                result.Add((t, body));
            }
            else
            {
                result.Add((string.IsNullOrEmpty(currentAct) ? t : $"{currentAct} · {t}", body));
            }
        }
        return result;
    }

    private static string ExtractMainContent(string text)
    {
        var startMarker = "*** START OF THE PROJECT GUTENBERG EBOOK";
        var endMarker = "*** END OF THE PROJECT GUTENBERG EBOOK";
        var start = text.IndexOf(startMarker, StringComparison.OrdinalIgnoreCase);
        var end = text.IndexOf(endMarker, StringComparison.OrdinalIgnoreCase);
        if (start >= 0)
            start = text.IndexOf('\n', start) + 1;
        else
            start = 0;
        if (end < 0) end = text.Length;

        // Strip Gutenberg encoding appendix that appears before the end marker
        // (e.g. "TAVOLA DEI CARATTERI SPECIALI" in the Dante Italian text)
        var tavola = text.IndexOf("TAVOLA DEI CARATTERI SPECIALI", start, StringComparison.OrdinalIgnoreCase);
        if (tavola >= 0 && tavola < end)
        {
            // Walk back to the preceding blank line / separator row
            var cutAt = text.LastIndexOf("\n\n", tavola);
            if (cutAt >= start) end = cutAt;
        }

        return text[start..end];
    }

    internal static List<(string Title, string Body)> SplitIntoSections(
        string content, string? chapterPattern, string fallbackTitle = "",
        RegexOptions regexOptions = RegexOptions.IgnoreCase | RegexOptions.Multiline,
        bool filterEmpty = true)
    {
        if (string.IsNullOrWhiteSpace(chapterPattern))
        {
            var paras = SplitParagraphs(content);
            return paras.Count > 0 ? [(fallbackTitle, content)] : [];
        }

        var sections = new List<(string Title, string Body)>();
        var regex = new Regex(chapterPattern, regexOptions);
        var matches = regex.Matches(content);

        for (int i = 0; i < matches.Count; i++)
        {
            var match = matches[i];
            var title = match.Value.Trim();
            var bodyStart = match.Index + match.Length;
            var bodyEnd = i + 1 < matches.Count ? matches[i + 1].Index : content.Length;
            var body = content[bodyStart..bodyEnd];
            sections.Add((title, body));
        }

        if (filterEmpty)
            sections = sections.Where(s => SplitParagraphs(s.Body).Count > 0).ToList();

        if (sections.Count == 0)
            sections.Add((fallbackTitle, content));

        return sections;
    }

    internal static List<string> SplitParagraphs(string body, bool preserveLines = false)
    {
        return body
            .Split(["\r\n\r\n", "\n\n"], StringSplitOptions.RemoveEmptyEntries)
            .Select(p => preserveLines
                ? p.Replace("\r\n", "\n").Trim()
                : p.Replace("\r\n", " ").Replace("\n", " ").Trim())
            .Where(p => p.Length > 10 && !p.StartsWith("***"))
            .ToList();
    }

    internal static string ExtractMainContentPublic(string text) => ExtractMainContent(text);
}
