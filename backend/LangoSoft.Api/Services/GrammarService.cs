using System.Text.Json;

namespace LangoSoft.Api.Services;

public class GrammarService(IHttpClientFactory httpClientFactory, IConfiguration configuration)
{
    private string? ApiKey =>
        configuration["Groq:ApiKey"] is { Length: > 0 } k ? k
        : Environment.GetEnvironmentVariable("GROQ_API_KEY");

    private static readonly string[] ValidTenses =
    [
        "present simple", "present continuous", "present perfect", "present perfect continuous",
        "past simple", "past continuous", "past perfect", "past perfect continuous",
        "future simple", "future continuous", "future perfect",
        "going to", "conditional",
        "present simple passive", "past simple passive",
        "past continuous passive", "past perfect passive",
    ];

    public async Task<List<string>> AnalyzeAsync(string text)
    {
        var apiKey = ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey))
            return [];

        var snippet = text.Length > 600 ? text[..600] : text;
        var validList = string.Join(", ", ValidTenses.Select(t => $"\"{t}\""));

        var prompt =
            "You are an English grammar analyzer for advanced learners.\n\n" +
            $"Analyze this English text and identify all verb tense constructions present:\n\"{snippet}\"\n\n" +
            "Return ONLY a JSON array using EXACTLY these canonical tense names (only include tenses that actually appear):\n" +
            $"[{validList}]\n\n" +
            "Example: [\"past simple\", \"past simple passive\"]\n" +
            "Return [] if no recognizable tenses are found.";

        var body = new
        {
            model = "llama-3.3-70b-versatile",
            max_tokens = 128,
            temperature = 0,
            messages = new[] { new { role = "user", content = prompt } }
        };

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
            request.Headers.Add("Authorization", $"Bearer {apiKey}");
            request.Content = JsonContent.Create(body);

            var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(20);

            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode) return [];

            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            var raw = doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "[]";

            var start = raw.IndexOf('[');
            var end = raw.LastIndexOf(']');
            if (start < 0 || end <= start) return [];

            using var arr = JsonDocument.Parse(raw[start..(end + 1)]);
            return arr.RootElement.EnumerateArray()
                .Select(e => e.GetString() ?? "")
                .Where(t => ValidTenses.Contains(t))
                .Distinct()
                .ToList();
        }
        catch
        {
            return [];
        }
    }
}
