using System.Text;
using System.Text.RegularExpressions;
using LangoSoft.Api.Data;
using LangoSoft.Api.DTOs;
using LangoSoft.Api.Models;
using LangoSoft.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LangoSoft.Api.Controllers;

[ApiController]
[Route("api/books")]
public class BooksController(AppDbContext db, BookImportService importService, WordService wordService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<BookDto>>> GetBooks()
    {
        var books = await db.Books
            .Select(b => new BookDto(b.Id, b.Title, b.Author, b.Language, b.Chapters.Count))
            .ToListAsync();
        return Ok(books);
    }

    [HttpGet("{bookId}/chapters")]
    public async Task<ActionResult<IEnumerable<ChapterDto>>> GetChapters(int bookId)
    {
        var chapters = await db.Chapters
            .Where(c => c.BookId == bookId)
            .OrderBy(c => c.Number)
            .Select(c => new ChapterDto(c.Id, c.BookId, c.Number, c.Title, c.Paragraphs.Count))
            .ToListAsync();
        return Ok(chapters);
    }

    [HttpGet("{bookId}/chapters/{chapterNumber}/paragraphs")]
    public async Task<ActionResult<IEnumerable<ParagraphDto>>> GetParagraphs(int bookId, int chapterNumber)
    {
        var chapter = await db.Chapters
            .Include(c => c.Paragraphs)
            .FirstOrDefaultAsync(c => c.BookId == bookId && c.Number == chapterNumber);

        if (chapter == null) return NotFound();

        var paragraphs = chapter.Paragraphs
            .OrderBy(p => p.Index)
            .Select(p => new ParagraphDto(p.Id, p.ChapterId, p.Index, p.Text, p.LongfellowText, p.DeeplText, p.RefinedText, p.UkrainianText, p.LineTransJson))
            .ToList();

        return Ok(paragraphs);
    }

    [HttpGet("{bookId}/word-frequencies")]
    public async Task<IActionResult> GetWordFrequencies(int bookId)
    {
        var texts = await db.Paragraphs
            .Where(p => p.Chapter.BookId == bookId)
            .Select(p => p.Text)
            .ToListAsync();

        var freq = new Dictionary<string, int>();
        var wordRx = new Regex(@"\p{L}+", RegexOptions.Compiled);
        foreach (var text in texts)
            foreach (Match m in wordRx.Matches(text))
            {
                var w = StripDiacritics(m.Value.ToLowerInvariant());
                freq[w] = freq.GetValueOrDefault(w) + 1;
            }

        return Ok(freq);
    }

    private static string StripDiacritics(string text)
    {
        var normalized = text.Normalize(NormalizationForm.FormD);
        return new string(normalized.Where(c =>
            System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) !=
            System.Globalization.UnicodeCategory.NonSpacingMark).ToArray());
    }

    [HttpPost("import")]
    public async Task<IActionResult> TriggerImport()
    {
        await importService.ImportAllBooksAsync();
        return Ok(new { message = "Import complete" });
    }

    // One-time export: translates every unique word in the book via Groq (batched, rate-limited),
    // returns a flat { normalizedWord: englishTranslation } dictionary.
    // ~10 min for a full Italian text (~5 000 unique words). Run once, save to public/gloss-it.json.
    // Returns unique normalised words in a single chapter
    [HttpGet("{bookId}/chapters/{chapterNum}/words")]
    public async Task<IActionResult> GetChapterWords(int bookId, int chapterNum)
    {
        var book = await db.Books.FindAsync(bookId);
        if (book == null) return NotFound();

        var texts = await db.Paragraphs
            .Where(p => p.Chapter.BookId == bookId && p.Chapter.Number == chapterNum)
            .Select(p => p.Text)
            .ToListAsync();

        if (texts.Count == 0) return NotFound();

        var wordRx = new Regex(@"[\p{L}''\-]+", RegexOptions.Compiled);
        var stripRx = new Regex(@"^[''\-]+|[''\-]+$", RegexOptions.Compiled);
        string Norm(string w) => new Regex(@"[̀-ͯ]")
            .Replace(w.ToLowerInvariant().Normalize(NormalizationForm.FormD), "")
            .Replace("'", "").Replace("'", "").Replace("'", "");

        var origByNorm = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var text in texts)
            foreach (Match m in wordRx.Matches(text))
            {
                var raw = stripRx.Replace(m.Value, "");
                if (raw.Length < 2) continue;
                var norm = Norm(raw);
                if (!origByNorm.ContainsKey(norm))
                    origByNorm[norm] = raw.ToLowerInvariant();
            }

        return Ok(new { language = book.Language, words = origByNorm });
    }

    // Returns all unique normalised words in the book (for external batch export scripts)
    [HttpGet("{bookId}/words")]
    public async Task<IActionResult> GetWords(int bookId)
    {
        var book = await db.Books.FindAsync(bookId);
        if (book == null) return NotFound();

        var texts = await db.Paragraphs
            .Where(p => p.Chapter.BookId == bookId)
            .Select(p => p.Text)
            .ToListAsync();

        var wordRx = new Regex(@"[\p{L}''\-]+", RegexOptions.Compiled);
        var stripRx = new Regex(@"^[''\-]+|[''\-]+$", RegexOptions.Compiled);
        string Norm(string w) => new Regex(@"[̀-ͯ]")
            .Replace(w.ToLowerInvariant().Normalize(NormalizationForm.FormD), "")
            .Replace("'", "").Replace("'", "").Replace("'", "");

        var origByNorm = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var text in texts)
            foreach (Match m in wordRx.Matches(text))
            {
                var raw = stripRx.Replace(m.Value, "");
                if (raw.Length < 2) continue;
                var norm = Norm(raw);
                if (!origByNorm.ContainsKey(norm))
                    origByNorm[norm] = raw.ToLowerInvariant();
            }

        return Ok(new { language = book.Language, words = origByNorm });
    }

    // Words in reading order (first appearance). Canto 1 words come first,
    // so partial translation runs always cover the beginning of the book first.
    [HttpGet("{bookId}/words-ordered")]
    public async Task<IActionResult> GetWordsOrdered(int bookId)
    {
        var book = await db.Books.FindAsync(bookId);
        if (book == null) return NotFound();

        var texts = await db.Paragraphs
            .Where(p => p.Chapter.BookId == bookId)
            .OrderBy(p => p.Chapter.Number)
            .ThenBy(p => p.Index)
            .Select(p => p.Text)
            .ToListAsync();

        var wordRx = new Regex(@"[\p{L}''\-]+", RegexOptions.Compiled);
        var stripRx = new Regex(@"^[''\-]+|[''\-]+$", RegexOptions.Compiled);
        string Norm(string w) => new Regex(@"[̀-ͯ]")
            .Replace(w.ToLowerInvariant().Normalize(NormalizationForm.FormD), "")
            .Replace("'", "").Replace("'", "").Replace("'", "");

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var ordered = new List<object>();
        foreach (var text in texts)
            foreach (Match m in wordRx.Matches(text))
            {
                var raw = stripRx.Replace(m.Value, "");
                if (raw.Length < 2) continue;
                var norm = Norm(raw);
                if (seen.Add(norm))
                    ordered.Add(new { norm, orig = raw.ToLowerInvariant() });
            }

        return Ok(new { language = book.Language, words = ordered });
    }

    // Debug: returns word count + raw Groq response for a 5-word sample batch
    [HttpGet("{bookId}/gloss-debug")]
    public async Task<IActionResult> DebugGloss(int bookId)
    {
        var book = await db.Books.FindAsync(bookId);
        if (book == null) return NotFound();

        var texts = await db.Paragraphs
            .Where(p => p.Chapter.BookId == bookId)
            .Select(p => p.Text)
            .Take(10) // just first 10 paragraphs for speed
            .ToListAsync();

        var wordRx = new Regex(@"[\p{L}''\-]+", RegexOptions.Compiled);
        var stripRx = new Regex(@"^[''\-]+|[''\-]+$", RegexOptions.Compiled);
        string Norm(string w) => System.Text.RegularExpressions.Regex.Replace(
            w.ToLowerInvariant().Normalize(NormalizationForm.FormD), @"[̀-ͯ]", "")
            .Replace("'", "").Replace("’", "").Replace("‘", "");

        var origByNorm = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var text in texts)
            foreach (Match m in wordRx.Matches(text))
            {
                var raw2 = stripRx.Replace(m.Value, "");
                if (raw2.Length < 2) continue;
                var norm = Norm(raw2);
                if (!origByNorm.ContainsKey(norm))
                    origByNorm[norm] = raw2.ToLowerInvariant();
            }

        var sample = origByNorm.Values.Take(5).ToList();
        var langName = book.Language == "it" ? "Italian" : book.Language;
        var sampleText = string.Join(" ", sample);
        var prompt =
            $"Translate every word of this {langName} text into English. " +
            $"Output a single JSON object (no markdown, no code fences) where each key is an original word " +
            $"(lowercase, strip punctuation) and the value is its English translation (1-3 words). " +
            $"Include every word.\n\nText: {sampleText}\n\nOutput only the JSON object, nothing else.";
        var body = new
        {
            model = "groq/compound-mini", max_tokens = 512, temperature = 0,
            response_format = new { type = "json_object" },
            messages = new[] { new { role = "user", content = prompt } }
        };

        var groqRaw = await wordService.TestGroqRawAsync(body);

        return Ok(new
        {
            wordCount = origByNorm.Count,
            sampleWords = sample,
            groqRaw
        });
    }

    [HttpGet("{bookId}/gloss-export")]
    public async Task<IActionResult> ExportGloss(int bookId)
    {
        var book = await db.Books.FindAsync(bookId);
        if (book == null) return NotFound();

        var texts = await db.Paragraphs
            .Where(p => p.Chapter.BookId == bookId)
            .Select(p => p.Text)
            .ToListAsync();

        // Extract and normalise every unique word (same normalisation as the frontend normWord())
        var wordRx = new Regex(@"[\p{L}''\-]+", RegexOptions.Compiled);
        var stripRx = new Regex(@"^[''\-]+|[''\-]+$", RegexOptions.Compiled);
        string Norm(string w) => new Regex(@"[̀-ͯ]")
            .Replace(w.ToLowerInvariant().Normalize(NormalizationForm.FormD), "")
            .Replace("'", "").Replace("‘", "").Replace("’", "");

        var origByNorm = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var text in texts)
            foreach (Match m in wordRx.Matches(text))
            {
                var raw = stripRx.Replace(m.Value, "");
                if (raw.Length < 2) continue;
                var norm = Norm(raw);
                if (!origByNorm.ContainsKey(norm))
                    origByNorm[norm] = raw.ToLowerInvariant();
            }

        var langName = book.Language == "it" ? "Italian" : book.Language;
        // Feed original (un-normalised) words to Groq; store results under normalised keys
        var origWords = origByNorm.Values.ToList();
        var translated = await wordService.TranslateVocabularyAsync(origWords, langName);

        // Re-key results by normalised form so the frontend lookup works
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (origWord, eng) in translated)
            result[Norm(origWord)] = eng;

        return Ok(result);
    }
}
