using LangoSoft.Api.DTOs;
using System.Text.Json;

namespace LangoSoft.Api.Services;

public class EssayService(IHttpClientFactory httpClientFactory, IConfiguration configuration)
{
    private string? ApiKey =>
        configuration["Groq:ApiKey"] is { Length: > 0 } k ? k
        : Environment.GetEnvironmentVariable("GROQ_API_KEY");

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);

    public async Task<EssayFeedbackDto> CheckEssayAsync(CheckEssayRequestDto request)
    {
        var apiKey = ApiKey ?? throw new InvalidOperationException("GROQ_API_KEY not configured");

        var prompt = BuildPrompt(request);

        var body = new
        {
            model = "llama-3.3-70b-versatile",
            max_tokens = 2048,
            temperature = 0.1,
            response_format = new { type = "json_object" },
            messages = new[] { new { role = "user", content = prompt } }
        };

        var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
        httpRequest.Headers.Add("Authorization", $"Bearer {apiKey}");
        httpRequest.Content = JsonContent.Create(body);

        var client = httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(60);

        var response = await client.SendAsync(httpRequest);
        response.EnsureSuccessStatusCode();

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        var text = doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? throw new InvalidOperationException("Empty response from Groq");

        var json = ExtractJson(text);

        var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        return JsonSerializer.Deserialize<EssayFeedbackDto>(json, opts)
            ?? throw new InvalidOperationException("Could not parse Groq response as JSON");
    }

    private static string ExtractJson(string text)
    {
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end < 0 || end <= start) return text;
        return text[start..(end + 1)];
    }

    private static string BuildPrompt(CheckEssayRequestDto req)
    {
        var context = req.ContextText is { Length: > 0 } c
            ? $"\nPassage/Prompt: {c[..Math.Min(c.Length, 600)]}"
            : "";

        return $$"""
        You are a strict but fair English writing teacher. The student is Ukrainian and targeting C1-C2 English proficiency.

        READING CONTEXT:
        Book: The Picture of Dorian Gray by Oscar Wilde
        Chapter: {{req.ChapterTitle}}{{context}}

        STUDENT'S ESSAY:
        {{req.EssayText}}

        Evaluate across 7 dimensions. Be honest, specific, and quote actual text from the essay when citing issues. Do not invent issues that aren't there.

        Return ONLY valid JSON — no markdown, no explanation, just JSON:
        {
          "overallScore": <integer 0-100>,
          "categories": {
            "spelling":     { "score": <0-100>, "issues": [<"quoted problem" strings, up to 3>], "tip": "<one concrete actionable fix>" },
            "grammar":      { "score": <0-100>, "issues": [<"quoted problem" strings, up to 3>], "tip": "<one concrete actionable fix>" },
            "punctuation":  { "score": <0-100>, "issues": [<"quoted problem" strings, up to 3>], "tip": "<one concrete actionable fix>" },
            "coherence":    { "score": <0-100>, "issues": [<"description" strings, up to 3>], "tip": "<one concrete actionable fix>" },
            "vocabulary":   { "score": <0-100>, "issues": [<"quoted weak word/phrase" strings, up to 3>], "tip": "<one concrete actionable fix>" },
            "relevance":    { "score": <0-100>, "issues": [<"description" strings, up to 2>], "tip": "<one concrete actionable fix>" },
            "style":        { "score": <0-100>, "issues": [<"description" strings, up to 2>], "tip": "<one concrete actionable fix>" }
          },
          "strongPoints": [<2-4 specific things the student did well>],
          "recommendations": [<exactly 3 most important improvements, ordered by priority>]
        }
        """;
    }
}
