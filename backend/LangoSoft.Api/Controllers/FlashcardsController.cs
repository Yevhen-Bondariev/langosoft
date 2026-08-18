using LangoSoft.Api.Data;
using LangoSoft.Api.DTOs;
using LangoSoft.Api.Models;
using LangoSoft.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LangoSoft.Api.Controllers;

[ApiController]
[Route("api/flashcards")]
public class FlashcardsController(AppDbContext db, SpacedRepetitionService srs) : ControllerBase
{
    private static FlashcardDto ToDto(Flashcard f) =>
        new(f.Id, f.Word, f.Context, f.Translation, f.Synonym,
            f.BookId, f.ChapterNumber, f.ParagraphIndex,
            f.Interval, f.EaseFactor, f.Repetitions, f.NextReview, f.AddedAt,
            f.CategoryId, f.Category?.Name, f.Category?.Color);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<FlashcardDto>>> GetAll()
    {
        var cards = await db.Flashcards
            .Include(f => f.Category)
            .OrderByDescending(f => f.AddedAt)
            .ToListAsync();
        return Ok(cards.Select(ToDto));
    }

    [HttpGet("due")]
    public async Task<ActionResult<IEnumerable<FlashcardDto>>> GetDue()
    {
        var cards = await db.Flashcards
            .Include(f => f.Category)
            .Where(f => f.NextReview <= DateTime.UtcNow)
            .OrderBy(f => f.NextReview)
            .ToListAsync();
        return Ok(cards.Select(ToDto));
    }

    [HttpGet("stats")]
    public async Task<ActionResult<IEnumerable<ChapterStatDto>>> GetStats()
    {
        var grouped = await db.Flashcards
            .GroupBy(f => new { f.BookId, f.ChapterNumber })
            .Select(g => new { g.Key.BookId, g.Key.ChapterNumber, Count = g.Count() })
            .ToListAsync();

        if (grouped.Count == 0) return Ok(Array.Empty<ChapterStatDto>());

        var bookIds = grouped.Select(g => g.BookId).Distinct().ToList();
        var books = await db.Books.Where(b => bookIds.Contains(b.Id)).ToListAsync();
        var chapterTitles = await db.Chapters
            .Where(c => bookIds.Contains(c.BookId))
            .Select(c => new { c.BookId, c.Number, c.Title })
            .ToListAsync();

        var bookMap = books.ToDictionary(b => b.Id, b => b.Title);
        var chapMap = chapterTitles.ToDictionary(c => (c.BookId, c.Number), c => c.Title);

        var result = grouped
            .Select(g => new ChapterStatDto(
                g.BookId,
                bookMap.TryGetValue(g.BookId, out var bt) ? bt : "Unknown",
                g.ChapterNumber,
                chapMap.TryGetValue((g.BookId, g.ChapterNumber), out var ct) ? ct : $"Chapter {g.ChapterNumber}",
                g.Count))
            .OrderBy(r => r.BookId).ThenBy(r => r.ChapterNumber);

        return Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<FlashcardDto>> Create(CreateFlashcardDto dto)
    {
        var existing = await db.Flashcards
            .Include(f => f.Category)
            .FirstOrDefaultAsync(f => f.Word.ToLower() == dto.Word.ToLower());
        if (existing != null)
        {
            // Update category if a new one is specified
            if (dto.CategoryId.HasValue && existing.CategoryId != dto.CategoryId)
            {
                existing.CategoryId = dto.CategoryId;
                await db.SaveChangesAsync();
                await db.Entry(existing).Reference(f => f.Category).LoadAsync();
            }
            return Ok(ToDto(existing));
        }

        var card = new Flashcard
        {
            Word = dto.Word.Trim(),
            Context = dto.Context,
            Translation = dto.Translation ?? "",
            Synonym = dto.Synonym ?? "",
            BookId = dto.BookId,
            ChapterNumber = dto.ChapterNumber,
            ParagraphIndex = dto.ParagraphIndex,
            CategoryId = dto.CategoryId,
        };
        db.Flashcards.Add(card);
        await db.SaveChangesAsync();
        if (card.CategoryId.HasValue)
            await db.Entry(card).Reference(f => f.Category).LoadAsync();
        return CreatedAtAction(nameof(GetAll), ToDto(card));
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<FlashcardDto>> Update(int id, UpdateFlashcardDto dto)
    {
        var card = await db.Flashcards.Include(f => f.Category).FirstOrDefaultAsync(f => f.Id == id);
        if (card == null) return NotFound();
        if (dto.Translation != null) card.Translation = dto.Translation;
        if (dto.Synonym != null) card.Synonym = dto.Synonym;
        if (dto.CategoryId != null) card.CategoryId = dto.CategoryId == 0 ? null : dto.CategoryId;
        await db.SaveChangesAsync();
        if (card.CategoryId.HasValue)
            await db.Entry(card).Reference(f => f.Category).LoadAsync();
        return Ok(ToDto(card));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var card = await db.Flashcards.FindAsync(id);
        if (card == null) return NotFound();
        db.Flashcards.Remove(card);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id}/review")]
    public async Task<ActionResult<FlashcardDto>> Review(int id, ReviewDto dto)
    {
        var card = await db.Flashcards.Include(f => f.Category).FirstOrDefaultAsync(f => f.Id == id);
        if (card == null) return NotFound();
        srs.ProcessReview(card, dto.Correct);
        await db.SaveChangesAsync();
        return Ok(ToDto(card));
    }
}
