using LangoSoft.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace LangoSoft.Api.Controllers;

[ApiController]
[Route("api/grammar")]
public class GrammarController(GrammarService grammarService) : ControllerBase
{
    public record AnalyzeRequest(string Text);
    public record AnalyzeResponse(List<string> Tenses);

    [HttpPost("analyze")]
    public async Task<ActionResult<AnalyzeResponse>> Analyze([FromBody] AnalyzeRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Text))
            return BadRequest("text is required");

        var tenses = await grammarService.AnalyzeAsync(req.Text);
        return Ok(new AnalyzeResponse(tenses));
    }
}
