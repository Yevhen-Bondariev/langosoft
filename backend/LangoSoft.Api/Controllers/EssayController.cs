using LangoSoft.Api.DTOs;
using LangoSoft.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace LangoSoft.Api.Controllers;

[ApiController]
[Route("api/essays")]
public class EssayController(EssayService essayService) : ControllerBase
{
    [HttpGet("status")]
    public IActionResult GetStatus() =>
        Ok(new { configured = essayService.IsConfigured });

    [HttpPost("check")]
    public async Task<ActionResult<EssayFeedbackDto>> Check(CheckEssayRequestDto request)
    {
        if (!essayService.IsConfigured)
            return BadRequest(new { error = "ANTHROPIC_API_KEY not set. Add it to appsettings.json under Anthropic:ApiKey or set as an environment variable." });

        if (string.IsNullOrWhiteSpace(request.EssayText) || request.EssayText.Length < 20)
            return BadRequest(new { error = "Essay text is too short." });

        try
        {
            var result = await essayService.CheckEssayAsync(request);
            return Ok(result);
        }
        catch (InvalidOperationException ex) when (ex.Message == "ANTHROPIC_API_KEY not configured")
        {
            return BadRequest(new { error = "API key not configured." });
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(502, new { error = $"Claude API error: {ex.Message}" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
