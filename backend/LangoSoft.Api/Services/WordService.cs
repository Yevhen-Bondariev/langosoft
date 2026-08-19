using System.Text.Json;

namespace LangoSoft.Api.Services;

public class WordService(GroqClient groqClient)
{
    private const string Model = "qwen/qwen3.6-27b";

    private static readonly Dictionary<string, string> LangNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["en"] = "English", ["it"] = "Italian", ["fr"] = "French", ["de"] = "German",
        ["es"] = "Spanish", ["uk"] = "Ukrainian", ["ru"] = "Russian", ["pl"] = "Polish",
        ["pt"] = "Portuguese", ["la"] = "Latin", ["el"] = "Greek", ["nl"] = "Dutch",
        ["ar"] = "Arabic", ["zh"] = "Chinese", ["ja"] = "Japanese", ["ko"] = "Korean",
        ["tr"] = "Turkish", ["he"] = "Hebrew",
    };

    public async Task<(string Translation, string Synonym)> TranslateAsync(
        string word, string context, string targetLanguage = "Ukrainian")
    {
        if (!groqClient.IsConfigured) return ("", "");

        var contextSnippet = context.Length > 300 ? context[..300] : context;
        var prompt =
            "/no_think\n\n" +
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
            model = Model,
            max_tokens = 2048,
            temperature = 0,
            messages = new[] { new { role = "user", content = prompt } }
        };

        var text = await groqClient.ChatAsync(body);
        if (text == null) return ("", "");

        try
        {
            var start = text.IndexOf('{');
            var end = text.LastIndexOf('}');
            if (start < 0 || end <= start) return ("", "");

            using var inner = JsonDocument.Parse(text[start..(end + 1)]);
            var root = inner.RootElement;
            var translation = root.TryGetProperty("translation", out var t) ? t.GetString() ?? "" : "";
            var synonym = root.TryGetProperty("synonym", out var s) ? s.GetString() ?? "" : "";
            return (translation, synonym);
        }
        catch { return ("", ""); }
    }

    public async Task<string> TranslateParagraphAsync(string text, string targetLanguage = "Ukrainian",
        string sourceLanguageCode = "en", bool literal = false)
    {
        if (!groqClient.IsConfigured) return "";

        var sourceName = LangNames.TryGetValue(sourceLanguageCode, out var n) ? n : "English";
        var snippet = text.Length > 1000 ? text[..1000] : text;
        var prompt = literal
            ? $"/no_think\n\nProduce a word-for-word gloss of the following {sourceName} text into {targetLanguage}. " +
              $"Replace EACH {sourceName} word with its closest {targetLanguage} equivalent in the EXACT same order. " +
              "Do NOT rearrange words. Do NOT add articles, prepositions, or auxiliary words that are not present in the original. " +
              "Do NOT fix grammar or improve readability — the output must mirror the original word order exactly, " +
              $"even if it reads as broken {targetLanguage}. " +
              "Return ONLY the gloss, no explanations.\n\n" + snippet
            : $"/no_think\n\nTranslate the following {sourceName} literary text into {targetLanguage}. " +
              "Preserve the tone, style and paragraph structure. " +
              "Return ONLY the translated text, no explanations, no quotes around it.\n\n" + snippet;

        var body = new
        {
            model = Model,
            max_tokens = 3072,
            temperature = 0.2,
            messages = new[] { new { role = "user", content = prompt } }
        };

        return await groqClient.ChatAsync(body) ?? "";
    }

    public async Task<string> GlossAsync(string text, string targetLanguage, string sourceLanguageCode)
    {
        if (!groqClient.IsConfigured) return "";

        var sourceName = LangNames.TryGetValue(sourceLanguageCode, out var n) ? n : "English";
        var snippet = text.Length > 400 ? text[..400] : text;
        // /no_think suppresses Qwen3 chain-of-thought reasoning tokens (saves ~3800 tokens per call).
        var prompt =
            $"/no_think\n\n" +
            $"Translate every word of this {sourceName} text into {targetLanguage}. " +
            $"Output a single JSON object (no markdown, no code fences) where each key is an original word " +
            $"(lowercase, strip punctuation) and the value is its {targetLanguage} translation. " +
            $"Include every word: articles, prepositions, conjunctions.\n\n" +
            $"Text: {snippet}\n\n" +
            "Output only the JSON object, nothing else.";

        var body = new
        {
            model = Model,
            max_tokens = 8192,
            temperature = 0,
            response_format = new { type = "json_object" },
            messages = new[] { new { role = "user", content = prompt } }
        };

        var raw = await groqClient.ChatAsync(body) ?? "";
        // Extract JSON object from the response (model may still wrap in markdown)
        var start = raw.IndexOf('{');
        var end = raw.LastIndexOf('}');
        return start >= 0 && end > start ? raw[start..(end + 1)] : raw;
    }

    public async Task<string> EvaluateTranslationAsync(
        string original, string userTranslation,
        string sourceLanguageCode, string targetLanguageName)
    {
        if (!groqClient.IsConfigured) return "";

        var sourceName = LangNames.TryGetValue(sourceLanguageCode, out var n) ? n : "the source language";
        var prompt =
            $"You are a translation evaluator helping a C1/C2 learner translate {sourceName} literary text into {targetLanguageName}.\n\n" +
            $"Original {sourceName}: \"{original}\"\n" +
            $"Student's {targetLanguageName} translation: \"{userTranslation}\"\n\n" +
            $"Evaluate whether the meaning is preserved.\n" +
            $"Accept different valid phrasings, word orders, and minor stylistic choices.\n" +
            $"Only flag: wrong word meaning, missing key concept, significant omission, or wrong register.\n" +
            $"If the translation is essentially correct, write exactly: Correct.\n" +
            $"Otherwise list up to 4 specific errors, one per line — state what is wrong and why briefly.\n" +
            $"No praise, no filler, plain text only — no markdown, no asterisks.";

        var body = new
        {
            model = Model,
            max_tokens = 2048,
            temperature = 0.2,
            messages = new[] { new { role = "user", content = prompt } }
        };

        return (await groqClient.ChatAsync(body))?.Trim() ?? "";
    }

    public async Task<string> ArchaicGlossAsync(string text, string sourceLanguageCode)
    {
        if (!groqClient.IsConfigured) return "{}";

        var sourceName = LangNames.TryGetValue(sourceLanguageCode, out var n) ? n : "Italian";
        var snippet = text.Length > 800 ? text[..800] : text;
        var prompt =
            "/no_think\n\n" +
            $"You are an expert in {sourceName} literature and linguistics. " +
            $"Identify every word in the following text that is archaic — " +
            $"meaning it differs from modern standard {sourceName} in spelling, contracted form, grammatical ending, meaning, or word order.\n\n" +
            "Return a JSON object where:\n" +
            "- key = the word exactly as it appears in the text (lowercase, no punctuation)\n" +
            "- value = one concise English sentence: what the archaic form is, its modern equivalent, and what it means\n\n" +
            $"Include contractions, archaic verb endings, inverted syntax, obsolete vocabulary — everything that would confuse a modern {sourceName} reader.\n" +
            "Return ONLY the JSON object. If there are no archaisms, return {}.\n\n" +
            $"Text:\n{snippet}";

        var body = new
        {
            model = Model,
            max_tokens = 4096,
            temperature = 0,
            messages = new[] { new { role = "user", content = prompt } }
        };

        var content = (await groqClient.ChatAsync(body))?.Trim() ?? "{}";
        try
        {
            using var inner = JsonDocument.Parse(content);
            return inner.RootElement.ValueKind == JsonValueKind.Object ? content : "{}";
        }
        catch { return "{}"; }
    }

    public async Task<string> CustomExplainAsync(string original, string? literary, string? literal, string question)
    {
        if (!groqClient.IsConfigured) return "";

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
            model = Model,
            max_tokens = 2048,
            temperature = 0.2,
            messages = new[] { new { role = "user", content = prompt } }
        };

        return await groqClient.ChatAsync(body) ?? "";
    }

    public async Task<string> ExplainRecallAsync(string original, string typed)
    {
        if (!groqClient.IsConfigured) return "";

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
            model = Model,
            max_tokens = 2048,
            temperature = 0.2,
            messages = new[] { new { role = "user", content = prompt } }
        };

        return await groqClient.ChatAsync(body) ?? "";
    }

    public async Task<string?> TestGroqRawAsync(object body) => await groqClient.ChatAsync(body, timeoutSeconds: 30);

    // Translate a vocabulary list into English in rate-limited batches.
    // Designed for one-time static-file generation; not for real-time use.
    // Returns: normalizedWord (lowercase, no diacritics, no apostrophes) → englishTranslation
    public async Task<Dictionary<string, string>> TranslateVocabularyAsync(
        IList<string> words, string sourceLangName, int batchSize = 30)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        var batchNum = 0;
        for (int i = 0; i < words.Count; i += batchSize)
        {
            if (i > 0) await Task.Delay(8000); // 8s between batches

            var batch = words.Skip(i).Take(batchSize).ToList();
            batchNum++;

            // Use GlossAsync-style prompt: words as space-separated text (not a quoted list).
            // This format works reliably; the quoted-list format causes empty generation.
            var text = string.Join(" ", batch);
            var prompt =
                $"Translate every word of this {sourceLangName} text into English. " +
                $"Output a single JSON object (no markdown, no code fences) where each key is an original word " +
                $"(lowercase, strip punctuation) and the value is its English translation (1-3 words). " +
                $"Include every word.\n\n" +
                $"Text: {text}\n\n" +
                "Output only the JSON object, nothing else.";

            string? raw = null;
            for (int attempt = 0; attempt < 3; attempt++)
            {
                if (attempt > 0)
                {
                    Console.Error.WriteLine($"[Vocab] Batch {batchNum}: retrying after 60s (attempt {attempt + 1})...");
                    await Task.Delay(60000);
                }
                // Use compound-mini: a non-reasoning model that reliably outputs json_object.
                // qwen3 (Model constant) is a reasoning model that puts <think> inside message.content,
                // which breaks Groq's server-side json_validate when response_format is set.
                raw = await groqClient.ChatAsync(new
                {
                    model = "groq/compound-mini", max_tokens = 2048, temperature = 0,
                    response_format = new { type = "json_object" },
                    messages = new[] { new { role = "user", content = prompt } }
                }, timeoutSeconds: 60);
                if (raw != null) break;
            }

            if (raw == null)
            {
                Console.Error.WriteLine($"[Vocab] Batch {batchNum}: all attempts failed, skipping");
                continue;
            }

            Console.Error.WriteLine($"[Vocab] Batch {batchNum}: got {raw.Length} chars, preview: [{(raw.Length > 200 ? raw[..200] : raw)}]");
            var start = raw.IndexOf('{'); var end = raw.LastIndexOf('}');
            if (start < 0 || end <= start) { Console.Error.WriteLine($"[Vocab] Batch {batchNum}: no JSON object found in [{raw}]"); continue; }

            try
            {
                var parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(raw[start..(end + 1)]);
                if (parsed == null) continue;
                foreach (var (k, v) in parsed)
                    if (!string.IsNullOrWhiteSpace(v)) result[k.ToLowerInvariant()] = v;
                Console.Error.WriteLine($"[Vocab] Batch {batchNum}: +{parsed.Count} words (total {result.Count})");
            }
            catch (Exception ex) { Console.Error.WriteLine($"[Vocab] Batch {batchNum}: parse error: {ex.Message}"); }
        }
        return result;
    }
}
