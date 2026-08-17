using LangoSoft.Api.Data;
using LangoSoft.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace LangoSoft.Api.Services;

public class BookImportService(AppDbContext db, IHttpClientFactory httpClientFactory, ILogger<BookImportService> logger)
{
    private record BookConfig(string Title, string Author, string Url, string? ChapterPattern);

    private static readonly BookConfig[] BookCatalog =
    [
        new("The Picture of Dorian Gray", "Oscar Wilde",
            "https://www.gutenberg.org/files/174/174-0.txt",
            @"(?:THE PREFACE|CHAPTER [IVXLC]+\.?)"),
        new("Hamlet", "William Shakespeare",
            "https://www.gutenberg.org/files/1524/1524-0.txt",
            @"ACT [IVX]+\."),
        new("Julius Caesar", "William Shakespeare",
            "https://www.gutenberg.org/files/1522/1522-0.txt",
            @"ACT [IVX]+\."),
        new("Politics and the English Language", "George Orwell",
            "https://gutenberg.net.au/ebooks03/0300011.txt",
            null),
    ];

    public async Task ImportAllBooksAsync()
    {
        foreach (var config in BookCatalog)
        {
            if (await db.Books.AnyAsync(b => b.Title == config.Title))
                continue;
            await ImportBookAsync(config);
        }
    }

    private async Task ImportBookAsync(BookConfig config)
    {
        logger.LogInformation("Downloading {Title}...", config.Title);

        var client = httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(60);
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

        var content = ExtractMainContent(text);
        var sections = SplitIntoSections(content, config.ChapterPattern, config.Title);

        // Build the full object graph in memory before touching the DB —
        // this way a failed download never leaves a half-imported book visible.
        var book = new Book { Title = config.Title, Author = config.Author };
        int chapterNum = 0;
        foreach (var (title, body) in sections)
        {
            var chapter = new Chapter
            {
                Number = chapterNum++,
                Title = title.Trim()
            };
            var rawParagraphs = SplitParagraphs(body);
            chapter.Paragraphs = rawParagraphs
                .Select((text2, idx) => new Paragraph { Index = idx, Text = text2 })
                .ToList();
            book.Chapters.Add(chapter);
            logger.LogInformation("  Ch {Num}: {Title} ({Count} paras)", chapter.Number, chapter.Title, rawParagraphs.Count);
        }

        db.Books.Add(book);
        await db.SaveChangesAsync();
        logger.LogInformation("Done: {Title} — {Count} chapters.", config.Title, chapterNum);
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
        return text[start..end];
    }

    internal static List<(string Title, string Body)> SplitIntoSections(
        string content, string? chapterPattern, string fallbackTitle = "")
    {
        if (string.IsNullOrWhiteSpace(chapterPattern))
        {
            var paras = SplitParagraphs(content);
            return paras.Count > 0 ? [(fallbackTitle, content)] : [];
        }

        var sections = new List<(string Title, string Body)>();
        var regex = new Regex(chapterPattern, RegexOptions.IgnoreCase);
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

        sections = sections.Where(s => SplitParagraphs(s.Body).Count > 0).ToList();

        if (sections.Count == 0)
            sections.Add((fallbackTitle, content));

        return sections;
    }

    internal static List<string> SplitParagraphs(string body)
    {
        return body
            .Split(["\r\n\r\n", "\n\n"], StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Replace("\r\n", " ").Replace("\n", " ").Trim())
            .Where(p => p.Length > 10 && !p.StartsWith("***"))
            .ToList();
    }

    internal static string ExtractMainContentPublic(string text) => ExtractMainContent(text);
}
