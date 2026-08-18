using System.Text.Json;

namespace LangoSoft.Api.Services;

public class WordService(IHttpClientFactory httpClientFactory, IConfiguration configuration)
{
    private static readonly Dictionary<string, string> LangNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["en"] = "English", ["it"] = "Italian", ["fr"] = "French", ["de"] = "German",
        ["es"] = "Spanish", ["ru"] = "Russian", ["uk"] = "Ukrainian", ["pl"] = "Polish",
        ["pt"] = "Portuguese", ["la"] = "Latin", ["el"] = "Greek", ["nl"] = "Dutch",
        ["ar"] = "Arabic", ["zh"] = "Chinese", ["ja"] = "Japanese", ["ko"] = "Korean",
        ["tr"] = "Turkish", ["he"] = "Hebrew",
    };

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

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
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

    public async Task<string> TranslateParagraphAsync(string text, string targetLanguage = "Ukrainian",
        string sourceLanguageCode = "en", bool literal = false)
    {
        var apiKey = ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey)) return "";

        var sourceName = LangNames.TryGetValue(sourceLanguageCode, out var n) ? n : "English";
        var snippet = text.Length > 1000 ? text[..1000] : text;
        var prompt = literal
            ? $"Produce a word-for-word gloss of the following {sourceName} text into {targetLanguage}. " +
              $"Replace EACH {sourceName} word with its closest {targetLanguage} equivalent in the EXACT same order. " +
              "Do NOT rearrange words. Do NOT add articles, prepositions, or auxiliary words that are not present in the original. " +
              "Do NOT fix grammar or improve readability — the output must mirror the original word order exactly, " +
              $"even if it reads as broken {targetLanguage}. " +
              "Return ONLY the gloss, no explanations.\n\n" + snippet
            : $"Translate the following {sourceName} literary text into {targetLanguage}. " +
              "Preserve the tone, style and paragraph structure. " +
              "Return ONLY the translated text, no explanations, no quotes around it.\n\n" + snippet;

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

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";
        }
        catch { return ""; }
    }

    public async Task<string> GlossAsync(string text, string targetLanguage, string sourceLanguageCode)
    {
        var apiKey = ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey)) return "";

        var sourceName = LangNames.TryGetValue(sourceLanguageCode, out var n) ? n : "English";
        var snippet = text.Length > 400 ? text[..400] : text;
        var prompt =
            $"Translate every word of this {sourceName} text into {targetLanguage}. " +
            "Return ONLY a JSON object where each key is an original word (lowercase, no punctuation) " +
            "and the value is its translation. Include articles, prepositions, conjunctions — every word.\n\n" +
            $"Text: {snippet}";

        var body = new
        {
            model = "openai/gpt-oss-120b",
            max_tokens = 1024,
            temperature = 0.1,
            response_format = new { type = "json_object" },
            messages = new[] { new { role = "user", content = prompt } }
        };

        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                if (attempt > 0) await Task.Delay(attempt * 500);
                var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
                request.Headers.Add("Authorization", $"Bearer {apiKey}");
                request.Content = JsonContent.Create(body);

                var client = httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(30);

                var response = await client.SendAsync(request);
                var rawBody = await response.Content.ReadAsStringAsync();
                if (!response.IsSuccessStatusCode) continue;

                using var doc = JsonDocument.Parse(rawBody);
                var content = doc.RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString()?.Trim() ?? "";
                if (content.Length > 0) return content;
            }
            catch { }
        }
        return "";
    }

    public async Task<string> CustomExplainAsync(string original, string? literary, string? literal, string question)
    {
        var apiKey = ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey)) return "";

        var prompt =
            "You are a language tutor helping a C1/C2 level learner study a literary text.\n\n" +
            $"Original sentence: \"{original}\"\n" +
            (string.IsNullOrWhiteSpace(literary) ? "" : $"Literary translation: \"{literary}\"\n") +
            (string.IsNullOrWhiteSpace(literal) ? "" : $"Literal translation: \"{literal}\"\n") +
            $"\nLearner's question: {question}\n\n" +
            "Answer concisely and directly in 2-4 sentences. Focus on what is most useful to a C1/C2 learner. " +
            "Plain text only — no markdown, no asterisks, no bold, no italic, no bullet points.";

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

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
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

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";
        }
        catch { return ""; }
    }
}
