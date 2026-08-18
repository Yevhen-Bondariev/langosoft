using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LangoSoft.Api.Services;
using Microsoft.Extensions.Configuration;

namespace LangoSoft.Api.Tests;

/// <summary>
/// Unit tests for WordService.GlossAsync.
/// No running backend or Groq API key required — HTTP is intercepted by a fake handler.
///
/// These tests verify the fix: GlossAsync sends response_format=json_object to Groq,
/// which forces valid JSON output (the old semicolon-delimited format was intermittently empty).
/// </summary>
public class WordServiceGlossTests
{
    // ── Manual test doubles ──────────────────────────────────────────────────────

    private sealed class FakeHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond,
        List<HttpRequestMessage> log) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            log.Add(request);
            return await respond(request);
        }
    }

    // Creates a fresh HttpClient per call so WordService can set client.Timeout each retry.
    private sealed class FreshClientFactory(
        Func<HttpRequestMessage, Task<HttpResponseMessage>> respond,
        List<HttpRequestMessage> log) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(new FakeHandler(respond, log));
    }

    private static IConfiguration BuildConfig(string apiKey) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Groq:ApiKey"] = apiKey })
            .Build();

    private static (WordService svc, List<HttpRequestMessage> requests) Build(
        Func<HttpRequestMessage, Task<HttpResponseMessage>> respond,
        string apiKey = "test-key")
    {
        var requests = new List<HttpRequestMessage>();
        var svc = new WordService(new FreshClientFactory(respond, requests), BuildConfig(apiKey));
        return (svc, requests);
    }

    private static Task<HttpResponseMessage> OkGroq(string contentJson) =>
        Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new
            {
                choices = new[] { new { message = new { content = contentJson } } }
            })
        });

    // ── Tests ────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task GlossAsync_RequestBody_ContainsResponseFormatJsonObject()
    {
        // The switch to response_format=json_object is the core fix.
        // Groq guarantees a valid JSON object when this is set, unlike the old free-text prompt.
        var (svc, requests) = Build(_ => OkGroq("""{"nel":"in"}"""));

        await svc.GlossAsync("Nel mezzo del cammin di nostra vita", "English", "it");

        Assert.Single(requests);
        var body = await requests[0].Content!.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("response_format", out var fmt),
            "Request body is missing 'response_format' — Groq will not guarantee JSON output without it");
        Assert.True(fmt.TryGetProperty("type", out var type));
        Assert.Equal("json_object", type.GetString());
    }

    [Fact]
    public async Task GlossAsync_ParsesJsonObjectResponseIntoWordMap()
    {
        // Groq returns {"word":"translation",...} when response_format=json_object is used.
        // GlossAsync must return that raw JSON string so the frontend can parse it into a Map.
        const string glossJson = """{"nel":"in","mezzo":"midst","vita":"life"}""";
        var (svc, _) = Build(_ => OkGroq(glossJson));

        var result = await svc.GlossAsync("Nel mezzo del cammin di nostra vita", "English", "it");

        Assert.False(string.IsNullOrEmpty(result),
            "GlossAsync returned empty string for a valid Groq JSON response");

        using var doc = JsonDocument.Parse(result);
        Assert.True(doc.RootElement.TryGetProperty("nel", out var nel), "Key 'nel' missing from parsed gloss");
        Assert.Equal("in", nel.GetString());
        Assert.True(doc.RootElement.TryGetProperty("vita", out var vita), "Key 'vita' missing from parsed gloss");
        Assert.Equal("life", vita.GetString());
    }

    [Fact]
    public async Task GlossAsync_SendsExactlyOneRequestPerAttemptCycle()
    {
        // Sanity check: a successful first attempt produces exactly one HTTP call.
        var (svc, requests) = Build(_ => OkGroq("""{"nel":"in"}"""));

        await svc.GlossAsync("Nel mezzo del cammin di nostra vita", "English", "it");

        Assert.Single(requests);
    }

    [Fact]
    public async Task GlossAsync_ReturnsEmptyString_OnHttpError()
    {
        // All 3 retry attempts fail — must return "" rather than throw.
        var (svc, _) = Build(_ => Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)));

        var result = await svc.GlossAsync("Nel mezzo", "English", "it");

        Assert.Equal("", result);
    }

    [Fact]
    public async Task GlossAsync_RetriesAndSucceeds_WhenFirstAttemptFails()
    {
        // GlossAsync retries up to 3 times. First call fails, second returns JSON.
        var callCount = 0;
        var (svc, _) = Build(_ =>
        {
            callCount++;
            return callCount == 1
                ? Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError))
                : OkGroq("""{"nel":"in"}""");
        });

        var result = await svc.GlossAsync("Nel", "English", "it");

        Assert.Equal(2, callCount);
        Assert.Contains("nel", result);
    }

    [Fact]
    public async Task GlossAsync_TargetsCorrectLanguage_InRequestPrompt()
    {
        // The prompt must mention the target language so Groq translates into the right language.
        var (svc, requests) = Build(_ => OkGroq("""{"nel":"in"}"""));

        await svc.GlossAsync("Nel mezzo", "English", "it");

        var body = await requests[0].Content!.ReadAsStringAsync();
        Assert.Contains("English", body);
        Assert.Contains("Italian", body); // source language name derived from "it" code
    }
}
