using System.Net;
using System.Text.Json;

namespace LangoSoft.Api.Services;

/// <summary>
/// Thread-safe Groq API client with automatic key rotation on 429 responses.
/// Tries every key in sequence before giving up.
/// Reads keys from Groq:ApiKeys (config array), Groq:ApiKey (legacy single key),
/// GROQ_API_KEY_1 … GROQ_API_KEY_9 (env vars), and GROQ_API_KEY (legacy env var).
/// </summary>
public class GroqClient(IHttpClientFactory httpClientFactory, IConfiguration configuration)
{
    private const string BaseUrl = "https://api.groq.com/openai/v1/chat/completions";

    private readonly string[] _keys = CollectKeys(configuration);
    private int _keyIndex;

    public bool IsConfigured => _keys.Length > 0;

    /// <summary>
    /// Posts to the Groq chat completions endpoint and returns choices[0].message.content,
    /// or null if all keys are rate-limited or no keys are configured.
    /// Cycles through every key on 429 before giving up.
    /// </summary>
    public async Task<string?> ChatAsync(object body, int timeoutSeconds = 30)
    {
        if (_keys.Length == 0) return null;

        var startIdx = Volatile.Read(ref _keyIndex) % _keys.Length;

        for (var attempt = 0; attempt < _keys.Length; attempt++)
        {
            var idx = (startIdx + attempt) % _keys.Length;
            var key = _keys[idx];

            var (content, rateLimited) = await TrySendAsync(key, body, timeoutSeconds);

            if (!rateLimited) return content;

            // Advance the shared index so other concurrent requests skip this key too
            Interlocked.CompareExchange(ref _keyIndex, (idx + 1) % _keys.Length, idx);
        }

        return null; // all keys exhausted
    }

    private async Task<(string? content, bool rateLimited)> TrySendAsync(
        string key, object body, int timeoutSeconds)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl);
            request.Headers.Add("Authorization", $"Bearer {key}");
            request.Content = JsonContent.Create(body);

            var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);

            var response = await client.SendAsync(request);

            if (response.StatusCode == HttpStatusCode.TooManyRequests)
                return (null, true);

            if (!response.IsSuccessStatusCode)
            {
                var errBody = await response.Content.ReadAsStringAsync();
                Console.Error.WriteLine($"[GroqClient] {(int)response.StatusCode} from Groq: {errBody}");
                return (null, false);
            }

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var raw = doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";

            // Qwen3 reasoning models embed <think>...</think> inside content.
            // Strip it so callers only see the final answer.
            var thinkEnd = raw.LastIndexOf("</think>");
            var content = thinkEnd >= 0 ? raw[(thinkEnd + 8)..].TrimStart() : raw;

            return (content, false);
        }
        catch
        {
            return (null, false);
        }
    }

    private static string[] CollectKeys(IConfiguration config)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var keys = new List<string>();

        void Add(string? k)
        {
            if (!string.IsNullOrWhiteSpace(k) && seen.Add(k)) keys.Add(k);
        }

        // New array format: Groq:ApiKeys:0, Groq:ApiKeys:1, …
        var section = config.GetSection("Groq:ApiKeys");
        foreach (var child in section.GetChildren()) Add(child.Value);

        // Legacy single key from config
        Add(config["Groq:ApiKey"]);

        // Env vars: GROQ_API_KEY_1 … GROQ_API_KEY_9
        for (var i = 1; i <= 9; i++)
            Add(Environment.GetEnvironmentVariable($"GROQ_API_KEY_{i}"));

        // Legacy env var
        Add(Environment.GetEnvironmentVariable("GROQ_API_KEY"));

        return [.. keys];
    }
}
