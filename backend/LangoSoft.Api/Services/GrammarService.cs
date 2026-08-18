using System.Text.Json;

namespace LangoSoft.Api.Services;

public class GrammarService(GroqClient groqClient)
{
    private static readonly Dictionary<string, string[]> TensesByLang = new(StringComparer.OrdinalIgnoreCase)
    {
        ["en"] =
        [
            "present simple", "present continuous", "present perfect", "present perfect continuous",
            "past simple", "past continuous", "past perfect", "past perfect continuous",
            "future simple", "future continuous", "future perfect",
            "going to", "conditional",
            "present simple passive", "past simple passive",
            "past continuous passive", "past perfect passive",
        ],
        ["it"] =
        [
            "presente", "imperfetto", "passato remoto", "passato prossimo",
            "trapassato prossimo", "trapassato remoto",
            "futuro semplice", "futuro anteriore",
            "condizionale presente", "condizionale passato",
            "congiuntivo presente", "congiuntivo imperfetto",
            "congiuntivo passato", "congiuntivo trapassato",
            "imperativo", "infinito", "participio", "gerundio",
        ],
        ["fr"] =
        [
            "présent", "imparfait", "passé simple", "passé composé",
            "plus-que-parfait", "passé antérieur",
            "futur simple", "futur antérieur",
            "conditionnel présent", "conditionnel passé",
            "subjonctif présent", "subjonctif imparfait",
            "subjonctif passé", "subjonctif plus-que-parfait",
            "impératif", "infinitif", "participe", "gérondif",
        ],
        ["de"] =
        [
            "Präsens", "Präteritum", "Perfekt", "Plusquamperfekt",
            "Futur I", "Futur II",
            "Konjunktiv I", "Konjunktiv II",
            "Passiv Präsens", "Passiv Präteritum",
            "Imperativ", "Infinitiv", "Partizip",
        ],
        ["es"] =
        [
            "presente", "pretérito imperfecto", "pretérito indefinido", "pretérito perfecto",
            "pretérito pluscuamperfecto", "futuro simple", "futuro compuesto",
            "condicional simple", "condicional compuesto",
            "subjuntivo presente", "subjuntivo imperfecto",
            "imperativo", "infinitivo", "participio", "gerundio",
        ],
        ["la"] =
        [
            "present active", "present passive",
            "imperfect active", "imperfect passive",
            "perfect active", "perfect passive",
            "pluperfect active", "pluperfect passive",
            "future active", "future passive",
            "future perfect active", "future perfect passive",
            "subjunctive present", "subjunctive imperfect",
            "subjunctive perfect", "subjunctive pluperfect",
            "imperative", "infinitive", "participle", "gerund", "supine",
        ],
    };

    private static readonly string[] EnglishTenses = TensesByLang["en"];

    public async Task<List<string>> AnalyzeAsync(string text, string languageCode = "en")
    {
        if (!groqClient.IsConfigured) return [];

        var lang = string.IsNullOrWhiteSpace(languageCode) ? "en" : languageCode.ToLowerInvariant();
        var validTenses = TensesByLang.TryGetValue(lang, out var t) ? t : EnglishTenses;

        var langNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["en"] = "English", ["it"] = "Italian", ["fr"] = "French", ["de"] = "German",
            ["es"] = "Spanish", ["la"] = "Latin", ["el"] = "Greek", ["pt"] = "Portuguese",
        };
        var langName = langNames.TryGetValue(lang, out var n) ? n : "the given language";

        var snippet = text.Length > 600 ? text[..600] : text;
        var validList = string.Join(", ", validTenses.Select(t2 => $"\"{t2}\""));

        var prompt =
            "/no_think\n\n" +
            $"You are a {langName} grammar analyzer for advanced learners.\n\n" +
            $"Analyze this {langName} text and identify all verb tense/mood constructions present:\n\"{snippet}\"\n\n" +
            $"Return a JSON object with a single key \"tenses\" whose value is an array using EXACTLY these canonical {langName} grammar names (only include forms that actually appear):\n" +
            $"[{validList}]\n\n" +
            $"Example: {{\"tenses\": [\"{validTenses[0]}\", \"{validTenses[Math.Min(2, validTenses.Length - 1)]}\"]}}\n" +
            "Return {\"tenses\": []} if no recognizable tenses or moods are found.";

        var body = new
        {
            model = "qwen/qwen3.6-27b",
            max_tokens = 2048,
            temperature = 0,
            messages = new[] { new { role = "user", content = prompt } }
        };

        var raw = await groqClient.ChatAsync(body);
        if (raw == null) return [];

        // Extract JSON object from response (model may include markdown fences)
        var js = raw.IndexOf('{'); var je = raw.LastIndexOf('}');
        var jsonStr = js >= 0 && je > js ? raw[js..(je + 1)] : raw;

        try
        {
            using var inner = JsonDocument.Parse(jsonStr);
            if (!inner.RootElement.TryGetProperty("tenses", out var arr)) return [];
            return arr.EnumerateArray()
                .Select(e => e.GetString() ?? "")
                .Where(t => validTenses.Contains(t, StringComparer.OrdinalIgnoreCase))
                .Distinct()
                .ToList();
        }
        catch { return []; }
    }
}
