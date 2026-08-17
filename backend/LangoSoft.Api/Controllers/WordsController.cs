using LangoSoft.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace LangoSoft.Api.Controllers;

[ApiController]
[Route("api/words")]
public class WordsController(WordService wordService) : ControllerBase
{
    public record TranslateRequest(string Word, string Context, string? TargetLanguage);
    public record TranslateResponse(string Translation, string Synonym);

    [HttpPost("translate")]
    public async Task<ActionResult<TranslateResponse>> Translate([FromBody] TranslateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Word))
            return BadRequest("word is required");

        var lang = string.IsNullOrWhiteSpace(req.TargetLanguage) ? "Ukrainian" : req.TargetLanguage;
        var (translation, synonym) = await wordService.TranslateAsync(req.Word, req.Context ?? "", lang);
        return Ok(new TranslateResponse(translation, synonym));
    }
}
