using LangoSoft.Api.Data;
using LangoSoft.Api.DTOs;
using LangoSoft.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LangoSoft.Api.Controllers;

[ApiController]
[Route("api/progress")]
public class ProgressController(AppDbContext db) : ControllerBase
{
    [HttpGet("{bookId}")]
    public async Task<ActionResult<ProgressDto>> Get(int bookId)
    {
        var progress = await db.ReadingProgresses.FirstOrDefaultAsync(p => p.BookId == bookId);
        if (progress == null) return NotFound();
        return Ok(new ProgressDto(progress.BookId, progress.ChapterNumber, progress.ParagraphIndex, progress.WordIndex, progress.LastRead));
    }

    [HttpPut("{bookId}")]
    public async Task<ActionResult<ProgressDto>> Save(int bookId, SaveProgressDto dto)
    {
        var progress = await db.ReadingProgresses.FirstOrDefaultAsync(p => p.BookId == bookId);
        if (progress == null)
        {
            progress = new ReadingProgress { BookId = bookId };
            db.ReadingProgresses.Add(progress);
        }
        progress.ChapterNumber = dto.ChapterNumber;
        progress.ParagraphIndex = dto.ParagraphIndex;
        progress.WordIndex = dto.WordIndex;
        progress.LastRead = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new ProgressDto(progress.BookId, progress.ChapterNumber, progress.ParagraphIndex, progress.WordIndex, progress.LastRead));
    }
}
