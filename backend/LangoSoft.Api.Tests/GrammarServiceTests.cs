using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LangoSoft.Api.Services;
using Microsoft.Extensions.Configuration;

namespace LangoSoft.Api.Tests;

/// <summary>
/// Unit tests for GrammarService.AnalyzeAsync.
/// No running backend or Groq API key required — HTTP is intercepted by a fake handler.
/// </summary>
public class GrammarServiceTests
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

    private sealed class FreshClientFactory(
        Func<HttpRequestMessage, Task<HttpResponseMessage>> respond,
        List<HttpRequestMessage> log) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(new FakeHandler(respond, log));
    }

    private static IConfiguration BuildConfig(params string[] apiKeys)
    {
        var entries = new Dictionary<string, string?>();
        for (var i = 0; i < apiKeys.Length; i++)
            entries[$"Groq:ApiKeys:{i}"] = apiKeys[i];
        return new ConfigurationBuilder().AddInMemoryCollection(entries).Build();
    }

    private static (GrammarService svc, List<HttpRequestMessage> requests) Build(
        Func<HttpRequestMessage, Task<HttpResponseMessage>> respond,
        params string[] apiKeys)
    {
        if (apiKeys.Length == 0) apiKeys = ["test-key"];
        var requests = new List<HttpRequestMessage>();
        var factory = new FreshClientFactory(respond, requests);
        var groqClient = new GroqClient(factory, BuildConfig(apiKeys));
        var svc = new GrammarService(groqClient);
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
    public async Task AnalyzeAsync_ReturnsEmptyList_WhenNotConfigured()
    {
        // GroqClient.CollectKeys reads env vars (GROQ_API_KEY, GROQ_API_KEY_1..9) at
        // construction time. Clear them temporarily so IsConfigured returns false,
        // then restore — safe because xUnit runs tests in a class sequentially.
        var savedLegacy = Environment.GetEnvironmentVariable("GROQ_API_KEY");
        var savedIndexed = Enumerable.Range(1, 9)
            .Select(i => Environment.GetEnvironmentVariable($"GROQ_API_KEY_{i}"))
            .ToArray();

        try
        {
            Environment.SetEnvironmentVariable("GROQ_API_KEY", null);
            for (var i = 1; i <= 9; i++)
                Environment.SetEnvironmentVariable($"GROQ_API_KEY_{i}", null);

            var requests = new List<HttpRequestMessage>();
            var factory = new FreshClientFactory(_ => throw new Exception("should not be called"), requests);
            var groqClient = new GroqClient(factory, BuildConfig()); // zero config keys + zero env vars
            var svc = new GrammarService(groqClient);

            var result = await svc.AnalyzeAsync("Nel mezzo del cammin", "it");

            Assert.Empty(result);
            Assert.Empty(requests);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GROQ_API_KEY", savedLegacy);
            for (var i = 1; i <= 9; i++)
                Environment.SetEnvironmentVariable($"GROQ_API_KEY_{i}", savedIndexed[i - 1]);
        }
    }

    [Fact]
    public async Task AnalyzeAsync_ParsesTensesArray_FromValidJsonResponse()
    {
        // Happy path: Groq returns a well-formed tenses array with canonical Italian names.
        var (svc, _) = Build(_ => OkGroq("""{"tenses": ["presente", "passato prossimo"]}"""));

        var result = await svc.AnalyzeAsync("Io ho scritto e scrivo", "it");

        Assert.Equal(2, result.Count);
        Assert.Contains("presente", result);
        Assert.Contains("passato prossimo", result);
    }

    [Fact]
    public async Task AnalyzeAsync_FiltersOutTensesNotInValidList()
    {
        // The model may hallucinate tense names. Only canonical names for the language survive.
        var (svc, _) = Build(_ => OkGroq("""{"tenses": ["presente", "invented tense", "futuro semplice"]}"""));

        var result = await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.DoesNotContain("invented tense", result);
        Assert.Contains("presente", result);
        Assert.Contains("futuro semplice", result);
    }

    [Fact]
    public async Task AnalyzeAsync_DeduplicatesTenses()
    {
        // If the model lists the same tense twice, the result must contain it only once.
        var (svc, _) = Build(_ => OkGroq("""{"tenses": ["presente", "presente", "imperfetto"]}"""));

        var result = await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.Equal(result.Count, result.Distinct().Count());
        Assert.Contains("presente", result);
        Assert.Contains("imperfetto", result);
    }

    [Fact]
    public async Task AnalyzeAsync_ReturnsEmptyList_WhenGroqReturnsHttpError()
    {
        // Non-429 HTTP failure — must return [] rather than throw.
        var (svc, _) = Build(_ => Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)));

        var result = await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.Empty(result);
    }

    [Fact]
    public async Task AnalyzeAsync_ReturnsEmptyList_WhenGroqReturnsMalformedJson()
    {
        // Model occasionally returns non-JSON prose. Must not throw, must return [].
        var (svc, _) = Build(_ => OkGroq("Sorry, I cannot analyze that."));

        var result = await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.Empty(result);
    }

    [Fact]
    public async Task AnalyzeAsync_ReturnsEmptyList_WhenTensesKeyMissing()
    {
        // Model returns valid JSON but without the "tenses" key.
        var (svc, _) = Build(_ => OkGroq("""{"analysis": "The text uses present tense."}"""));

        var result = await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.Empty(result);
    }

    [Fact]
    public async Task AnalyzeAsync_ReturnsEmptyList_WhenTensesArrayIsEmpty()
    {
        // Model returns valid JSON with an explicit empty array.
        var (svc, _) = Build(_ => OkGroq("""{"tenses": []}"""));

        var result = await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.Empty(result);
    }

    [Fact]
    public async Task AnalyzeAsync_ExtractsJsonFromMarkdownFences()
    {
        // Model sometimes wraps the JSON in ```json ... ``` fences.
        // GroqClient strips <think> tags; GrammarService must extract the { } block.
        var (svc, _) = Build(_ => OkGroq(
            "```json\n{\"tenses\": [\"presente\"]}\n```"));

        var result = await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.Contains("presente", result);
    }

    [Fact]
    public async Task AnalyzeAsync_IsCaseInsensitive_WhenMatchingTenses()
    {
        // The valid-tense filter uses OrdinalIgnoreCase — "Presente" must match "presente".
        var (svc, _) = Build(_ => OkGroq("""{"tenses": ["Presente", "IMPERFETTO"]}"""));

        var result = await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.NotEmpty(result);
        // Both entries pass the filter (case-insensitive); deduplicated to the model's casing.
        Assert.Equal(2, result.Count);
    }

    [Fact]
    public async Task AnalyzeAsync_UsesCorrectLanguageName_InRequestPrompt()
    {
        // The prompt sent to Groq must name the source language explicitly.
        // "it" → "Italian" must appear in the prompt body so the model uses the right grammar.
        var (svc, requests) = Build(_ => OkGroq("""{"tenses": []}"""));

        await svc.AnalyzeAsync("Io scrivo", "it");

        var body = await requests[0].Content!.ReadAsStringAsync();
        Assert.Contains("Italian", body);
    }

    [Fact]
    public async Task AnalyzeAsync_FallsBackToEnglishTenses_ForUnknownLanguageCode()
    {
        // Language code "xx" is not in TensesByLang. Must fall back to English tense list.
        // We verify by checking that English-valid tenses like "present simple" pass the filter.
        var (svc, _) = Build(_ => OkGroq("""{"tenses": ["present simple", "past simple"]}"""));

        var result = await svc.AnalyzeAsync("He writes", "xx");

        Assert.Contains("present simple", result);
        Assert.Contains("past simple", result);
    }

    [Fact]
    public async Task AnalyzeAsync_FallsBackToEnglish_WhenLanguageCodeIsEmpty()
    {
        // Empty string language code must be treated as "en".
        var (svc, _) = Build(_ => OkGroq("""{"tenses": ["present simple"]}"""));

        var result = await svc.AnalyzeAsync("He writes", "");

        Assert.Contains("present simple", result);
    }

    [Fact]
    public async Task AnalyzeAsync_TruncatesTextTo600Characters()
    {
        // Text longer than 600 chars must be trimmed before being sent to Groq.
        var longText = new string('a', 1200);
        var (svc, requests) = Build(_ => OkGroq("""{"tenses": []}"""));

        await svc.AnalyzeAsync(longText, "en");

        var body = await requests[0].Content!.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        var messages = doc.RootElement.GetProperty("messages");
        var prompt = messages[0].GetProperty("content").GetString() ?? "";
        // The snippet embedded in the prompt must not exceed 600 a's
        var aRun = new string('a', 601);
        Assert.DoesNotContain(aRun, prompt);
    }

    [Fact]
    public async Task AnalyzeAsync_SendsExactlyOneRequest_OnSuccess()
    {
        // Sanity check: a successful first attempt produces exactly one HTTP call.
        var (svc, requests) = Build(_ => OkGroq("""{"tenses": []}"""));

        await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.Single(requests);
    }

    [Fact]
    public async Task AnalyzeAsync_RotatesKeyAndRetries_On429()
    {
        // First key returns 429; second key succeeds. GroqClient must rotate and retry.
        var callCount = 0;
        var (svc, requests) = Build(
            _ =>
            {
                callCount++;
                return callCount == 1
                    ? Task.FromResult(new HttpResponseMessage(HttpStatusCode.TooManyRequests))
                    : OkGroq("""{"tenses": ["presente"]}""");
            },
            "key-1", "key-2");

        var result = await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.Equal(2, callCount);
        Assert.Contains("presente", result);
    }

    [Fact]
    public async Task AnalyzeAsync_ReturnsEmptyList_WhenAllKeysRateLimited()
    {
        // All keys return 429. Must return [] rather than throw.
        var (svc, _) = Build(
            _ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.TooManyRequests)),
            "key-1", "key-2");

        var result = await svc.AnalyzeAsync("Io scrivo", "it");

        Assert.Empty(result);
    }

    [Fact]
    public async Task AnalyzeAsync_EnglishRequest_IncludesEnglishTenseNames_InPrompt()
    {
        // The prompt should embed the valid English tense names so the model knows what's allowed.
        var (svc, requests) = Build(_ => OkGroq("""{"tenses": []}"""));

        await svc.AnalyzeAsync("He writes every day.", "en");

        var body = await requests[0].Content!.ReadAsStringAsync();
        Assert.Contains("present simple", body);
        Assert.Contains("past simple", body);
    }

    [Fact]
    public async Task AnalyzeAsync_LatinRequest_AcceptsLatinFormNames()
    {
        // Latin uses a distinct tense vocabulary ("present active", "perfect passive", etc.)
        var (svc, _) = Build(_ => OkGroq("""{"tenses": ["present active", "perfect passive"]}"""));

        var result = await svc.AnalyzeAsync("Gallia est omnis divisa", "la");

        Assert.Contains("present active", result);
        Assert.Contains("perfect passive", result);
    }

    [Fact]
    public async Task AnalyzeAsync_RejectsItalianTenses_WhenEnglishIsRequested()
    {
        // Language boundary: Italian tense names are not valid when language code is "en".
        var (svc, _) = Build(_ => OkGroq("""{"tenses": ["presente", "passato prossimo"]}"""));

        var result = await svc.AnalyzeAsync("He writes", "en");

        Assert.Empty(result);
    }
}
