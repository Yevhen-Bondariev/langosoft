using System.Text.Json;

namespace LangoSoft.Api.Services;

public class WordService(IHttpClientFactory httpClientFactory, IConfiguration configuration)
{
    private string? ApiKey =>
        configuration["Groq:ApiKey"] is { Length: > 0 } k ? k
        : Environment.GetEnvironmentVariable("GROQ_API_KEY");

    public async Task<(string Translation, string Synonym)> TranslateAsync(
        string word, string context, string targetLanguage = "Ukrainian")
    {
        var apiKey = ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey))
            return ("", "");

        var contextSnippet = context.Length > 300 ? context[..300] : context;
        var prompt =
            $"You help an advanced English learner build vocabulary flashcards.\n\n" +
            $"Word: \"{word}\"\n" +
            $"Context: \"{contextSnippet}\"\n\n" +
            "Return ONLY valid JSON with exactly these two keys:\n" +
            "{ \"translation\": \"<translation of the word into " + targetLanguage + " (1-4 words) as used in context>\", " +
            "\"synonym\": \"<one English synonym, 1-2 words, not the same as the word itself>\" }\n\n" +
            "Rules: provide the translation in the native script of " + targetLanguage + "; " +
            "if the word is a proper noun return empty string for translation.";

        var body = new
        {
            model = "openai/gpt-oss-120b",
            max_tokens = 128,
            temperature = 0.1,
            response_format = new { type = "json_object" },
            messages = new[] { new { role = "user", content = prompt } }
        };

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
            request.Headers.Add("Authorization", $"Bearer {apiKey}");
            request.Content = JsonContent.Create(body);

            var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);

            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode) return ("", "");

            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            var text = doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";

            var start = text.IndexOf('{');
            var end = text.LastIndexOf('}');
            if (start < 0 || end <= start) return ("", "");

            using var inner = JsonDocument.Parse(text[start..(end + 1)]);
            var root = inner.RootElement;
            var translation = root.TryGetProperty("translation", out var t) ? t.GetString() ?? "" : "";
            var synonym = root.TryGetProperty("synonym", out var s) ? s.GetString() ?? "" : "";
            return (translation, synonym);
        }
        catch
        {
            return ("", "");
        }
    }

    public async Task<string> TranslateParagraphAsync(string text, string targetLanguage = "Ukrainian")
    {
        var apiKey = ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey)) return "";

        var snippet = text.Length > 1000 ? text[..1000] : text;
        var prompt =
            $"Translate the following English literary text into {targetLanguage}. " +
            "Preserve the tone, style and paragraph structure. " +
            "Return ONLY the translated text, no explanations, no quotes around it.\n\n" +
            snippet;

        var body = new
        {
            model = "openai/gpt-oss-120b",
            max_tokens = 1024,
            temperature = 0.2,
            messages = new[] { new { role = "user", content = prompt } }
        };

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
            request.Headers.Add("Authorization", $"Bearer {apiKey}");
            request.Content = JsonContent.Create(body);

            var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);

            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode) return "";

            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            return doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";
        }
        catch { return ""; }
    }

    public async Task<string> ExplainRecallAsync(string original, string typed)
    {
        var apiKey = ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey)) return "";

        var prompt =
            "You are a writing coach for an advanced English learner at C1/C2 level.\n" +
            "The learner practised active recall of this literary sentence:\n\n" +
            $"Original:       \"{original}\"\n" +
            $"Learner wrote:  \"{typed}\"\n\n" +
            "List up to 5 meaningful differences (ignore capitalisation and punctuation). " +
            "For each: one numbered point, one or two sentences — state what differs and WHY " +
            "the original is preferred (article choice, preposition, word order, collocation, " +
            "literary register, etc.). No praise, no filler. " +
            "If the versions are essentially identical, write exactly: Perfect.";

        var body = new
        {
            model = "openai/gpt-oss-120b",
            max_tokens = 512,
            temperature = 0.2,
            messages = new[] { new { role = "user", content = prompt } }
        };

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
            request.Headers.Add("Authorization", $"Bearer {apiKey}");
            request.Content = JsonContent.Create(body);

            var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);

            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode) return "";

            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            return doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";
        }
        catch { return ""; }
    }
}
