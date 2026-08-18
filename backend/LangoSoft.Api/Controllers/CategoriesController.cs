using LangoSoft.Api.Data;
using LangoSoft.Api.DTOs;
using LangoSoft.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LangoSoft.Api.Controllers;

[ApiController]
[Route("api/categories")]
public class CategoriesController(AppDbContext db) : ControllerBase
{
    private static CategoryDto ToDto(FlashcardCategory c) =>
        new(c.Id, c.Name, c.IsDefault, c.Color);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CategoryDto>>> GetAll()
    {
        var cats = await db.FlashcardCategories
            .OrderByDescending(c => c.IsDefault)
            .ThenBy(c => c.Name)
            .ToListAsync();
        return Ok(cats.Select(ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<CategoryDto>> Create(CreateCategoryDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest("name is required");

        var cat = new FlashcardCategory
        {
            Name = dto.Name.Trim(),
            Color = string.IsNullOrWhiteSpace(dto.Color) ? "#6366f1" : dto.Color,
            IsDefault = false,
        };
        db.FlashcardCategories.Add(cat);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), ToDto(cat));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var cat = await db.FlashcardCategories.FindAsync(id);
        if (cat == null) return NotFound();
        if (cat.IsDefault) return BadRequest("Default categories cannot be deleted");

        // Detach from flashcards first
        await db.Flashcards
            .Where(f => f.CategoryId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(f => f.CategoryId, (int?)null));

        db.FlashcardCategories.Remove(cat);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
