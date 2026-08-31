using Microsoft.AspNetCore.Mvc;

namespace LangoSoft.Api.Controllers;

[ApiController]
[Route("api/tts")]
public class TtsController(IHttpClientFactory httpClientFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Speak([FromQuery] string text, [FromQuery] string lang = "uk")
    {
        if (string.IsNullOrWhiteSpace(text))
            return BadRequest("text is required");

        var encoded = Uri.EscapeDataString(text);
        var url = $"https://translate.google.com/translate_tts?ie=UTF-8&q={encoded}&tl={lang}&client=tw-ob&ttsspeed=1";

        var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Add("User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        client.DefaultRequestHeaders.Add("Referer", "https://translate.google.com/");

        var response = await client.GetAsync(url);
        if (!response.IsSuccessStatusCode)
            return StatusCode((int)response.StatusCode, "TTS upstream error");

        var bytes = await response.Content.ReadAsByteArrayAsync();
        return File(bytes, "audio/mpeg");
    }
}
