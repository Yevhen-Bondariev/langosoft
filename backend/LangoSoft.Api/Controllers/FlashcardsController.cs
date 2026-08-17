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
            f.Interval, f.EaseFactor, f.Repetitions, f.NextReview, f.AddedAt);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<FlashcardDto>>> GetAll()
    {
        var cards = await db.Flashcards.OrderByDescending(f => f.AddedAt).ToListAsync();
        return Ok(cards.Select(ToDto));
    }

    [HttpGet("due")]
    public async Task<ActionResult<IEnumerable<FlashcardDto>>> GetDue()
    {
        var cards = await db.Flashcards
            .Where(f => f.NextReview <= DateTime.UtcNow)
            .OrderBy(f => f.NextReview)
            .ToListAsync();
        return Ok(cards.Select(ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<FlashcardDto>> Create(CreateFlashcardDto dto)
    {
        var existing = await db.Flashcards
            .FirstOrDefaultAsync(f => f.Word.ToLower() == dto.Word.ToLower());
        if (existing != null)
            return Ok(ToDto(existing));

        var card = new Flashcard
        {
            Word = dto.Word.Trim(),
            Context = dto.Context,
            Translation = dto.Translation ?? "",
            Synonym = dto.Synonym ?? "",
            BookId = dto.BookId,
            ChapterNumber = dto.ChapterNumber,
            ParagraphIndex = dto.ParagraphIndex
        };
        db.Flashcards.Add(card);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), ToDto(card));
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<FlashcardDto>> Update(int id, UpdateFlashcardDto dto)
    {
        var card = await db.Flashcards.FindAsync(id);
        if (card == null) return NotFound();
        if (dto.Translation != null) card.Translation = dto.Translation;
        if (dto.Synonym != null) card.Synonym = dto.Synonym;
        await db.SaveChangesAsync();
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
        var card = await db.Flashcards.FindAsync(id);
        if (card == null) return NotFound();
        srs.ProcessReview(card, dto.Correct);
        await db.SaveChangesAsync();
        return Ok(ToDto(card));
    }
}
