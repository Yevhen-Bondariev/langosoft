using LangoSoft.Api.Data;
using LangoSoft.Api.DTOs;
using LangoSoft.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LangoSoft.Api.Controllers;

[ApiController]
[Route("api/books")]
public class BooksController(AppDbContext db, BookImportService importService) : ControllerBase
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
            .Select(p => new ParagraphDto(p.Id, p.ChapterId, p.Index, p.Text))
            .ToList();

        return Ok(paragraphs);
    }

    [HttpPost("import")]
    public async Task<IActionResult> TriggerImport()
    {
        await importService.ImportAllBooksAsync();
        return Ok(new { message = "Import complete" });
    }
}
