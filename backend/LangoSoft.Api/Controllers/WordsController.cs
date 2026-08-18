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

    public record TranslateParagraphRequest(string Text, string? TargetLanguage, string? SourceLanguageCode);
    public record TranslateParagraphResponse(string Translation);

    [HttpPost("translate-paragraph")]
    public async Task<ActionResult<TranslateParagraphResponse>> TranslateParagraph([FromBody] TranslateParagraphRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest("text is required");
        var lang = string.IsNullOrWhiteSpace(req.TargetLanguage) ? "Ukrainian" : req.TargetLanguage;
        var src = string.IsNullOrWhiteSpace(req.SourceLanguageCode) ? "en" : req.SourceLanguageCode;
        var translation = await wordService.TranslateParagraphAsync(req.Text, lang, src);
        return Ok(new TranslateParagraphResponse(translation));
    }

    public record RecallExplainRequest(string Original, string? Typed);
    public record RecallExplainResponse(string Explanation);

    [HttpPost("recall-explain")]
    public async Task<ActionResult<RecallExplainResponse>> RecallExplain([FromBody] RecallExplainRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Original))
            return BadRequest("original is required");
        var explanation = await wordService.ExplainRecallAsync(req.Original, req.Typed ?? "");
        return Ok(new RecallExplainResponse(explanation));
    }
}
