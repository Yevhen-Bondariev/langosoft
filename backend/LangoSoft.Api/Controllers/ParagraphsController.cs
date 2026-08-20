using LangoSoft.Api.Data;
using LangoSoft.Api.Models;
using LangoSoft.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LangoSoft.Api.Controllers;

[ApiController]
[Route("api/paragraphs")]
public class ParagraphsController(AppDbContext db, WordService wordService) : ControllerBase
{
    public record ArchaismsResponse(string Archaisms);

    [HttpGet("{id:int}/archaisms")]
    public async Task<ActionResult<ArchaismsResponse>> GetArchaisms(int id)
    {
        var cached = await db.ParagraphArchaismCaches
            .FirstOrDefaultAsync(a => a.ParagraphId == id);

        if (cached != null)
            return Ok(new ArchaismsResponse(cached.ArchaismsJson));

        var paragraph = await db.Paragraphs
            .Include(p => p.Chapter).ThenInclude(c => c.Book)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (paragraph == null)
            return NotFound();

        var lang = paragraph.Chapter.Book.Language;

        string json;
        if (lang == "en")
            json = "{}";
        else
            json = await wordService.ArchaicGlossAsync(paragraph.Text, lang);

        var entry = new ParagraphArchaismCache { ParagraphId = id, ArchaismsJson = json };
        db.ParagraphArchaismCaches.Add(entry);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { /* race: another request already cached it */ }

        return Ok(new ArchaismsResponse(json));
    }

    public record GlossResponse(string Gloss);

    [HttpGet("{id:int}/gloss")]
    public async Task<ActionResult<GlossResponse>> GetGloss(int id, [FromQuery] string targetLanguage = "English", [FromQuery] bool cacheOnly = false)
    {
        var cached = await db.ParagraphGlossCaches
            .FirstOrDefaultAsync(g => g.ParagraphId == id && g.TargetLanguage == targetLanguage);

        // Return cached result only if it's a valid non-empty JSON object (skip failed/empty cache entries).
        if (cached != null && cached.GlossJson.TrimStart().StartsWith('{') &&
            cached.GlossJson.TrimEnd().EndsWith('}') && cached.GlossJson.Length > 2)
            return Ok(new GlossResponse(cached.GlossJson));

        if (cacheOnly)
            return Ok(new GlossResponse("{}"));

        var paragraph = await db.Paragraphs
            .Include(p => p.Chapter).ThenInclude(c => c.Book)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (paragraph == null)
            return NotFound();

        var srcLang = paragraph.Chapter.Book.Language;

        string gloss;
        if (srcLang == targetLanguage.ToLowerInvariant() || srcLang == "en")
            gloss = "{}";
        else
            gloss = await wordService.GlossAsync(paragraph.Text, targetLanguage, srcLang);

        // Only cache if we received a non-empty JSON object (don't cache rate-limit failures).
        if (gloss.TrimStart().StartsWith('{') && gloss.TrimEnd().EndsWith('}') && gloss.Length > 2)
        {
            var entry = new ParagraphGlossCache { ParagraphId = id, TargetLanguage = targetLanguage, GlossJson = gloss };
            db.ParagraphGlossCaches.Add(entry);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { /* race condition: another request already cached it */ }
        }

        return Ok(new GlossResponse(gloss));
    }

    [HttpPatch("{id:int}/deepl")]
    public async Task<IActionResult> SetDeeplText(int id, [FromBody] string text)
    {
        var para = await db.Paragraphs.FindAsync(id);
        if (para == null) return NotFound();
        para.DeeplText = text;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPatch("{id:int}/refined")]
    public async Task<IActionResult> SetRefinedText(int id, [FromBody] string text)
    {
        var para = await db.Paragraphs.FindAsync(id);
        if (para == null) return NotFound();
        para.RefinedText = text;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}/refined")]
    public async Task<IActionResult> ClearRefinedText(int id)
    {
        var para = await db.Paragraphs.FindAsync(id);
        if (para == null) return NotFound();
        para.RefinedText = null;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPatch("{id:int}/ukrainian")]
    public async Task<IActionResult> SetUkrainianText(int id, [FromBody] string text)
    {
        var para = await db.Paragraphs.FindAsync(id);
        if (para == null) return NotFound();
        para.UkrainianText = text;
        await db.SaveChangesAsync();
        return NoContent();
    }

    public record SeedGlossRequest(string GlossJson, string TargetLanguage = "English");

    // Development-only: seed a pre-computed gloss into the cache (bypasses Groq for testing).
    [HttpPut("{id:int}/gloss")]
    public async Task<ActionResult> SeedGloss(int id, [FromBody] SeedGlossRequest req)
    {
        var existing = await db.ParagraphGlossCaches
            .FirstOrDefaultAsync(g => g.ParagraphId == id && g.TargetLanguage == req.TargetLanguage);

        if (existing != null)
        {
            existing.GlossJson = req.GlossJson;
            await db.SaveChangesAsync();
        }
        else
        {
            db.ParagraphGlossCaches.Add(new ParagraphGlossCache
            {
                ParagraphId = id, TargetLanguage = req.TargetLanguage, GlossJson = req.GlossJson
            });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { }
        }

        return NoContent();
    }
}
