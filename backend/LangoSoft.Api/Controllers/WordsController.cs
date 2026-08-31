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

    public record TranslateParagraphRequest(string Text, string? TargetLanguage, string? SourceLanguageCode, bool Literal = false);
    public record TranslateParagraphResponse(string Translation);

    [HttpPost("translate-paragraph")]
    public async Task<ActionResult<TranslateParagraphResponse>> TranslateParagraph([FromBody] TranslateParagraphRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest("text is required");
        var lang = string.IsNullOrWhiteSpace(req.TargetLanguage) ? "Ukrainian" : req.TargetLanguage;
        var src = string.IsNullOrWhiteSpace(req.SourceLanguageCode) ? "en" : req.SourceLanguageCode;
        var translation = await wordService.TranslateParagraphAsync(req.Text, lang, src, req.Literal);
        return Ok(new TranslateParagraphResponse(translation));
    }

    public record GlossRequest(string Text, string? TargetLanguage, string? SourceLanguageCode);
    public record GlossResponse(string Gloss);

    [HttpPost("gloss")]
    public async Task<ActionResult<GlossResponse>> Gloss([FromBody] GlossRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest("text is required");
        var lang = string.IsNullOrWhiteSpace(req.TargetLanguage) ? "English" : req.TargetLanguage;
        var src = string.IsNullOrWhiteSpace(req.SourceLanguageCode) ? "en" : req.SourceLanguageCode;
        var gloss = await wordService.GlossAsync(req.Text, lang, src);
        return Ok(new GlossResponse(gloss));
    }

    public record CustomExplainRequest(string Original, string? Literary, string? Literal, string Question);
    public record CustomExplainResponse(string Answer);

    [HttpPost("custom-explain")]
    public async Task<ActionResult<CustomExplainResponse>> CustomExplain([FromBody] CustomExplainRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Original) || string.IsNullOrWhiteSpace(req.Question))
            return BadRequest("original and question are required");
        var answer = await wordService.CustomExplainAsync(req.Original, req.Literary, req.Literal, req.Question);
        return Ok(new CustomExplainResponse(answer));
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

    public record EvaluateTranslationRequest(
        string Original, string UserTranslation,
        string? SourceLanguageCode, string? TargetLanguageName);
    public record EvaluateTranslationResponse(string Feedback);

    [HttpPost("evaluate-translation")]
    public async Task<ActionResult<EvaluateTranslationResponse>> EvaluateTranslation(
        [FromBody] EvaluateTranslationRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Original) || string.IsNullOrWhiteSpace(req.UserTranslation))
            return BadRequest("original and userTranslation are required");
        var src = string.IsNullOrWhiteSpace(req.SourceLanguageCode) ? "it" : req.SourceLanguageCode;
        var tgt = string.IsNullOrWhiteSpace(req.TargetLanguageName) ? "Ukrainian" : req.TargetLanguageName;
        var feedback = await wordService.EvaluateTranslationAsync(req.Original, req.UserTranslation, src, tgt);
        return Ok(new EvaluateTranslationResponse(feedback));
    }
}
