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
}

// Local DTOs matching the API response shape
record BookDto(int Id, string Title, string Author, int ChapterCount);
record ChapterDto(int Id, int BookId, int Number, string Title, int ParagraphCount);
record ParagraphDto(int Id, int ChapterId, int Index, string Text);
