using System.Diagnostics;
using System.Net.Http.Json;

namespace LangoSoft.Api.Tests;

/// <summary>
/// Integration tests that hit the running backend at http://localhost:5000.
/// These tests verify the full pipeline: import → database → API response.
/// Run the backend first with: dotnet run (in backend/LangoSoft.Api)
/// </summary>
public class ApiIntegrationTests : IDisposable
{
    private readonly HttpClient _client;
    private const string BaseUrl = "http://localhost:5000";

    public ApiIntegrationTests()
    {
        _client = new HttpClient { BaseAddress = new Uri(BaseUrl), Timeout = TimeSpan.FromSeconds(10) };
    }

    public void Dispose() => _client.Dispose();

    [Fact]
    public async Task Books_ReturnsAtLeastOneBook()
    {
        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");

        Assert.NotNull(books);
        Assert.NotEmpty(books);
    }

    [Fact]
    public async Task Books_FirstBookIsDorianGray()
    {
        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");

        Assert.NotNull(books);
        var book = books[0];
        Assert.Contains("Dorian Gray", book.Title, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Wilde", book.Author, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Books_ChapterCountIsReasonable()
    {
        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");
        Assert.NotNull(books);
        var bookId = books[0].Id;

        var chapters = await _client.GetFromJsonAsync<List<ChapterDto>>($"/api/books/{bookId}/chapters");

        Assert.NotNull(chapters);
        // Dorian Gray has 1 preface + 20 chapters = 21 sections.
        // Allow slight variance but definitely not 42 (TOC double-count bug).
        Assert.InRange(chapters.Count, 18, 25);
    }

    [Fact]
    public async Task Books_Chapter0HasParagraphs()
    {
        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");
        Assert.NotNull(books);
        var bookId = books[0].Id;

        var paragraphs = await _client.GetFromJsonAsync<List<ParagraphDto>>(
            $"/api/books/{bookId}/chapters/0/paragraphs");

        Assert.NotNull(paragraphs);
        Assert.NotEmpty(paragraphs);
    }

    [Fact]
    public async Task Books_AllChaptersHaveParagraphs()
    {
        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");
        Assert.NotNull(books);
        var bookId = books[0].Id;

        var chapters = await _client.GetFromJsonAsync<List<ChapterDto>>($"/api/books/{bookId}/chapters");
        Assert.NotNull(chapters);

        foreach (var chapter in chapters)
        {
            var paragraphs = await _client.GetFromJsonAsync<List<ParagraphDto>>(
                $"/api/books/{bookId}/chapters/{chapter.Number}/paragraphs");

            Assert.NotNull(paragraphs);
            Assert.True(paragraphs.Count > 0,
                $"Chapter {chapter.Number} '{chapter.Title}' has no paragraphs");
        }
    }

    [Fact]
    public async Task Books_ParagraphsHaveNonEmptyText()
    {
        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");
        Assert.NotNull(books);
        var bookId = books[0].Id;

        var paragraphs = await _client.GetFromJsonAsync<List<ParagraphDto>>(
            $"/api/books/{bookId}/chapters/0/paragraphs");

        Assert.NotNull(paragraphs);
        Assert.All(paragraphs, p =>
        {
            Assert.False(string.IsNullOrWhiteSpace(p.Text),
                $"Paragraph {p.Index} in chapter 0 has empty text");
            Assert.True(p.Text.Length > 10,
                $"Paragraph {p.Index} is suspiciously short: '{p.Text}'");
        });
    }

    // ── Shakespeare: chapter list in sidebar ──────────────────────────────────

    [Theory]
    [InlineData("Hamlet")]
    [InlineData("Julius Caesar")]
    public async Task Shakespeare_HasChaptersInSidebar(string bookTitle)
    {
        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");
        Assert.NotNull(books);
        var book = books.FirstOrDefault(b => b.Title.Contains(bookTitle, StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(book);

        var chapters = await _client.GetFromJsonAsync<List<ChapterDto>>($"/api/books/{book.Id}/chapters");
        Assert.NotNull(chapters);

        // Must have multiple chapters (scenes) — a single chapter means splitting failed
        Assert.True(chapters.Count > 5,
            $"'{bookTitle}' has only {chapters.Count} chapter(s) in the sidebar — act/scene splitting likely failed");
    }

    [Theory]
    [InlineData("Hamlet")]
    [InlineData("Julius Caesar")]
    public async Task Shakespeare_ChapterTitlesContainActAndScene(string bookTitle)
    {
        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");
        var book = books!.First(b => b.Title.Contains(bookTitle, StringComparison.OrdinalIgnoreCase));
        var chapters = await _client.GetFromJsonAsync<List<ChapterDto>>($"/api/books/{book.Id}/chapters");
        Assert.NotNull(chapters);

        // Every chapter title should reference an act (e.g. "ACT I · SCENE II")
        Assert.All(chapters, ch =>
            Assert.True(ch.Title.Contains("ACT", StringComparison.OrdinalIgnoreCase),
                $"Chapter title '{ch.Title}' does not reference an act"));

        // At least one chapter per act (I–V)
        foreach (var act in new[] { "ACT I", "ACT II", "ACT III", "ACT IV", "ACT V" })
            Assert.Contains(chapters, ch => ch.Title.Contains(act, StringComparison.OrdinalIgnoreCase));
    }

    // ── Performance: load time ─────────────────────────────────────────────────

    [Theory]
    [InlineData("Hamlet")]
    [InlineData("Julius Caesar")]
    [InlineData("Dorian Gray")]
    public async Task Books_ChapterListLoadsWithin1s(string bookTitle)
    {
        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");
        var book = books!.First(b => b.Title.Contains(bookTitle, StringComparison.OrdinalIgnoreCase));

        var sw = Stopwatch.StartNew();
        var chapters = await _client.GetFromJsonAsync<List<ChapterDto>>($"/api/books/{book.Id}/chapters");
        sw.Stop();

        Assert.True(sw.ElapsedMilliseconds < 1000,
            $"'{bookTitle}' chapter list took {sw.ElapsedMilliseconds} ms (limit: 1 000 ms)");
        Assert.NotEmpty(chapters!);
    }

    [Theory]
    [InlineData("Hamlet")]
    [InlineData("Julius Caesar")]
    [InlineData("Dorian Gray")]
    public async Task Books_FirstChapterParagraphsLoadWithin1s(string bookTitle)
    {
        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");
        var book = books!.First(b => b.Title.Contains(bookTitle, StringComparison.OrdinalIgnoreCase));

        var sw = Stopwatch.StartNew();
        var paras = await _client.GetFromJsonAsync<List<ParagraphDto>>($"/api/books/{book.Id}/chapters/0/paragraphs");
        sw.Stop();

        Assert.True(sw.ElapsedMilliseconds < 1000,
            $"'{bookTitle}' chapter 0 paragraphs took {sw.ElapsedMilliseconds} ms (limit: 1 000 ms)");
        Assert.NotEmpty(paras!);
    }

    // ── Performance: chapter size ──────────────────────────────────────────────

    /// <summary>
    /// No chapter should exceed 200 paragraphs.
    /// Above that the browser renders too many DOM nodes at once, causing visible lag.
    /// Shakespeare dialogue lines are 5-10 words each (much shorter than prose), so
    /// 200 lines ≈ the DOM cost of ~50 Dorian Gray paragraphs.
    /// If this fails for a new book: split into smaller sections (e.g. by scene).
    /// </summary>
    [Theory]
    [InlineData("Hamlet")]
    [InlineData("Julius Caesar")]
    [InlineData("Dorian Gray")]
    public async Task Books_NoParagraphsExceedPerChapterLimit(string bookTitle)
    {
        const int maxParagraphsPerChapter = 200;

        var books = await _client.GetFromJsonAsync<List<BookDto>>("/api/books");
        var book = books!.First(b => b.Title.Contains(bookTitle, StringComparison.OrdinalIgnoreCase));
        var chapters = await _client.GetFromJsonAsync<List<ChapterDto>>($"/api/books/{book.Id}/chapters");

        foreach (var chapter in chapters!)
        {
            var paras = await _client.GetFromJsonAsync<List<ParagraphDto>>(
                $"/api/books/{book.Id}/chapters/{chapter.Number}/paragraphs");
            Assert.NotNull(paras);

            Assert.True(paras.Count <= maxParagraphsPerChapter,
                $"'{bookTitle}' chapter {chapter.Number} '{chapter.Title}' has {paras.Count} paragraphs " +
                $"(limit: {maxParagraphsPerChapter}). Consider splitting by sub-scene or adding pagination.");
        }
    }
}

// ── Local DTOs matching the API response shape ────────────────────────────────
record BookDto(int Id, string Title, string Author, int ChapterCount);
record ChapterDto(int Id, int BookId, int Number, string Title, int ParagraphCount);
record ParagraphDto(int Id, int ChapterId, int Index, string Text);
