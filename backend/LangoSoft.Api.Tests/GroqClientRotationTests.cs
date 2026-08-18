using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LangoSoft.Api.Services;
using Microsoft.Extensions.Configuration;

namespace LangoSoft.Api.Tests;

/// <summary>
/// Proves that GroqClient.ChatAsync rotates API keys on 429 responses.
/// Every test captures the actual Authorization headers sent, so there is no
/// guesswork about which key was used on which attempt.
/// </summary>
public class GroqClientRotationTests
{
    // ── Plumbing ─────────────────────────────────────────────────────────────

    private sealed class FakeHandler(
        Func<HttpRequestMessage, Task<HttpResponseMessage>> respond,
        List<string> keysUsed) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            // Record the API key from the Authorization header
            var auth = request.Headers.Authorization?.Parameter ?? "";
            keysUsed.Add(auth);
            return await respond(request);
        }
    }

    private sealed class FreshClientFactory(
        Func<HttpRequestMessage, Task<HttpResponseMessage>> respond,
        List<string> keysUsed) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) =>
            new(new FakeHandler(respond, keysUsed));
    }

    private static IConfiguration BuildConfig(params string[] apiKeys)
    {
        var entries = new Dictionary<string, string?>();
        for (var i = 0; i < apiKeys.Length; i++)
            entries[$"Groq:ApiKeys:{i}"] = apiKeys[i];
        return new ConfigurationBuilder().AddInMemoryCollection(entries).Build();
    }

    /// <summary>
    /// Builds a GroqClient with a fake HTTP layer.
    /// keysUsed is populated in order with the Bearer token from each attempt.
    /// </summary>
    private static (GroqClient client, List<string> keysUsed) Build(
        Func<HttpRequestMessage, Task<HttpResponseMessage>> respond,
        params string[] apiKeys)
    {
        var keysUsed = new List<string>();

        // Clear env-var keys so the test pool is exactly what we pass in
        var savedLegacy = Environment.GetEnvironmentVariable("GROQ_API_KEY");
        var savedIndexed = Enumerable.Range(1, 9)
            .Select(i => Environment.GetEnvironmentVariable($"GROQ_API_KEY_{i}"))
            .ToArray();
        Environment.SetEnvironmentVariable("GROQ_API_KEY", null);
        for (var i = 1; i <= 9; i++)
            Environment.SetEnvironmentVariable($"GROQ_API_KEY_{i}", null);

        var factory = new FreshClientFactory(respond, keysUsed);
        var client = new GroqClient(factory, BuildConfig(apiKeys));

        // Restore env vars (best-effort; not critical for test isolation)
        Environment.SetEnvironmentVariable("GROQ_API_KEY", savedLegacy);
        for (var i = 1; i <= 9; i++)
            Environment.SetEnvironmentVariable($"GROQ_API_KEY_{i}", savedIndexed[i - 1]);

        return (client, keysUsed);
    }

    private static Task<HttpResponseMessage> Ok(string content) =>
        Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new
            {
                choices = new[] { new { message = new { content } } }
            })
        });

    private static Task<HttpResponseMessage> RateLimit() =>
        Task.FromResult(new HttpResponseMessage(HttpStatusCode.TooManyRequests));

    private static Task<HttpResponseMessage> ServerError() =>
        Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError)
        {
            Content = new StringContent("error")
        });

    // ── Tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ChatAsync_UsesFirstKey_WhenItSucceeds()
    {
        // Baseline: a working first key should result in exactly one request.
        var (client, keysUsed) = Build(_ => Ok("hello"), "key-A", "key-B");

        var result = await client.ChatAsync(new { });

        Assert.Equal("hello", result);
        Assert.Single(keysUsed);
        Assert.Equal("key-A", keysUsed[0]);
    }

    [Fact]
    public async Task ChatAsync_RotatesToSecondKey_WhenFirstReturns429()
    {
        // Core rotation: first key 429 → second key succeeds.
        // The second request must carry the second key's Bearer token.
        var (client, keysUsed) = Build(
            req =>
            {
                var key = req.Headers.Authorization?.Parameter;
                return key == "key-A" ? RateLimit() : Ok("answer");
            },
            "key-A", "key-B");

        var result = await client.ChatAsync(new { });

        Assert.Equal("answer", result);
        Assert.Equal(2, keysUsed.Count);
        Assert.Equal("key-A", keysUsed[0]); // first attempt
        Assert.Equal("key-B", keysUsed[1]); // rotated attempt
    }

    [Fact]
    public async Task ChatAsync_RotationUsesCorrectBearerToken_NotJustAnyKey()
    {
        // Explicit header check: after rotation the Authorization header must
        // carry exactly "Bearer key-B", not "Bearer key-A" again.
        var (client, keysUsed) = Build(
            req => req.Headers.Authorization?.Parameter == "key-A" ? RateLimit() : Ok("ok"),
            "key-A", "key-B");

        await client.ChatAsync(new { });

        Assert.Equal("Bearer key-B",
            $"Bearer {keysUsed[1]}",
            StringComparer.Ordinal);
        // Directly assert the header value that was actually sent
        Assert.Equal("key-B", keysUsed[1]);
    }

    [Fact]
    public async Task ChatAsync_CyclesThroughAllThreeKeys_WhenFirstTwoReturn429()
    {
        // Three-key pool: proves N-key rotation, not just a two-key special case.
        var (client, keysUsed) = Build(
            req => req.Headers.Authorization?.Parameter switch
            {
                "key-A" => RateLimit(),
                "key-B" => RateLimit(),
                _       => Ok("third-key-worked"),
            },
            "key-A", "key-B", "key-C");

        var result = await client.ChatAsync(new { });

        Assert.Equal("third-key-worked", result);
        Assert.Equal(3, keysUsed.Count);
        Assert.Equal(new[] { "key-A", "key-B", "key-C" }, keysUsed);
    }

    [Fact]
    public async Task ChatAsync_ReturnsNull_WhenAllKeysReturn429()
    {
        // Exhaustion: every key rate-limited → must return null, not throw,
        // and must have tried each key exactly once.
        var (client, keysUsed) = Build(_ => RateLimit(), "key-A", "key-B", "key-C");

        var result = await client.ChatAsync(new { });

        Assert.Null(result);
        Assert.Equal(3, keysUsed.Count);
        Assert.Equal(new[] { "key-A", "key-B", "key-C" }, keysUsed);
    }

    [Fact]
    public async Task ChatAsync_ReturnsNull_WhenSingleKeyReturn429()
    {
        // Edge case: single key pool, 429 → null (cannot rotate to another key).
        var (client, keysUsed) = Build(_ => RateLimit(), "only-key");

        var result = await client.ChatAsync(new { });

        Assert.Null(result);
        Assert.Single(keysUsed);
    }

    [Fact]
    public async Task ChatAsync_DoesNotRetryOnNon429Error()
    {
        // A 500 server error is not a rate-limit — rotation must NOT happen.
        // Only one request should be made even with multiple keys available.
        var (client, keysUsed) = Build(_ => ServerError(), "key-A", "key-B");

        var result = await client.ChatAsync(new { });

        Assert.Null(result);
        Assert.Single(keysUsed);             // only one attempt
        Assert.Equal("key-A", keysUsed[0]); // used first key, did not rotate
    }

    [Fact]
    public async Task ChatAsync_AdvancesSharedIndex_SoNextCallStartsFromRotatedKey()
    {
        // After key-A is rate-limited and index advances to key-B,
        // a subsequent call on the SAME client instance must start at key-B,
        // not restart from key-A (stale rate-limited key).
        var (client, keysUsed) = Build(
            req => req.Headers.Authorization?.Parameter == "key-A" ? RateLimit() : Ok("ok"),
            "key-A", "key-B");

        // First call: key-A → 429, rotates to key-B (succeeds), advances _keyIndex to 1
        await client.ChatAsync(new { });
        keysUsed.Clear(); // reset log for second call

        // Second call: must start at key-B (index 1), not key-A (index 0)
        var result = await client.ChatAsync(new { });

        Assert.Equal("ok", result);
        Assert.Single(keysUsed);
        Assert.Equal("key-B", keysUsed[0]); // skipped the known-bad key-A
    }

    [Fact]
    public async Task ChatAsync_StripsThinkTagsFromContent()
    {
        // Qwen3 embeds <think>...</think> reasoning in the response.
        // GroqClient must strip it so callers receive only the final answer.
        var rawWithThink = "<think>Let me reason step by step…</think>\n\nfinal answer";
        var (client, _) = Build(_ => Ok(rawWithThink), "key-A");

        var result = await client.ChatAsync(new { });

        Assert.Equal("final answer", result);
        Assert.DoesNotContain("<think>", result!);
    }

    [Fact]
    public async Task ChatAsync_ReturnsContentAsIs_WhenNoThinkTag()
    {
        // Content without a <think> block must pass through unchanged.
        var (client, _) = Build(_ => Ok("""{"answer":"42"}"""), "key-A");

        var result = await client.ChatAsync(new { });

        Assert.Equal("""{"answer":"42"}""", result);
    }

    [Fact]
    public async Task ChatAsync_SendsRequestBodyToGroq()
    {
        // Sanity check: the serialized body reaches the fake handler intact.
        string? receivedBody = null;
        var (client, _) = Build(async req =>
        {
            receivedBody = await req.Content!.ReadAsStringAsync();
            return await Ok("ok");
        }, "key-A");

        var body = new { model = "test-model", max_tokens = 512 };
        await client.ChatAsync(body);

        Assert.NotNull(receivedBody);
        using var doc = JsonDocument.Parse(receivedBody!);
        Assert.Equal("test-model", doc.RootElement.GetProperty("model").GetString());
        Assert.Equal(512, doc.RootElement.GetProperty("max_tokens").GetInt32());
    }

    [Fact]
    public async Task ChatAsync_ReturnsNull_WhenNotConfigured()
    {
        // No keys at all → IsConfigured is false → must return null immediately,
        // no HTTP request attempted.
        var keysUsed = new List<string>();
        var factory = new FreshClientFactory(_ => throw new Exception("must not be called"), keysUsed);

        var savedLegacy = Environment.GetEnvironmentVariable("GROQ_API_KEY");
        var savedIndexed = Enumerable.Range(1, 9)
            .Select(i => Environment.GetEnvironmentVariable($"GROQ_API_KEY_{i}"))
            .ToArray();
        try
        {
            Environment.SetEnvironmentVariable("GROQ_API_KEY", null);
            for (var i = 1; i <= 9; i++)
                Environment.SetEnvironmentVariable($"GROQ_API_KEY_{i}", null);

            var client = new GroqClient(factory, BuildConfig());

            var result = await client.ChatAsync(new { });

            Assert.Null(result);
            Assert.Empty(keysUsed);
            Assert.False(client.IsConfigured);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GROQ_API_KEY", savedLegacy);
            for (var i = 1; i <= 9; i++)
                Environment.SetEnvironmentVariable($"GROQ_API_KEY_{i}", savedIndexed[i - 1]);
        }
    }

    [Fact]
    public async Task ChatAsync_ConcurrentCalls_AllCompleteWithoutDeadlock()
    {
        // Smoke test: 20 concurrent calls with key-A rate-limited should all
        // complete (not deadlock) and return a result via key-B.
        var (client, _) = Build(
            req => req.Headers.Authorization?.Parameter == "key-A" ? RateLimit() : Ok("ok"),
            "key-A", "key-B");

        var tasks = Enumerable.Range(0, 20).Select(_ => client.ChatAsync(new { }));
        var results = await Task.WhenAll(tasks);

        Assert.All(results, r => Assert.Equal("ok", r));
    }
}
