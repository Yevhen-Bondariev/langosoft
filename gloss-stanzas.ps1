#Requires -Version 5.1
<#
.SYNOPSIS
  Generates context-aware word-by-word English glosses for Dante stanzas via Groq,
  batching multiple stanzas per API call to stay within TPM limits.
  Seeds results into ParagraphGlossCaches via PUT /api/paragraphs/{id}/gloss.
  Skips paragraphs that already have a cached gloss.

.PARAMETER BookId        Book ID (default: 5 = La Divina Commedia)
.PARAMETER ChapterNumber 0-based chapter number (default: 0 = Canto I)
.PARAMETER GroqApiKey    Groq API key (or set env var GROQ_API_KEY)
.PARAMETER ApiBase       Backend base URL (default: http://localhost:5000)
.PARAMETER Model         Groq model (default: groq/compound-mini)
.PARAMETER BatchSize     Stanzas per API call (default: 5)
.PARAMETER MaxCount      Stop after this many stanzas (0 = all).
.PARAMETER DelayMs       Milliseconds between batch calls (default: 15000).
.PARAMETER Force         Re-gloss paragraphs that already have a cached gloss (overwrite).
.PARAMETER ParaIds       Comma-separated paragraph IDs to target (overrides chapter scan).
.PARAMETER DryRun        Print results without seeding to DB.
#>
param(
    [int]    $BookId        = 5,
    [int]    $ChapterNumber = 0,
    [string] $GroqApiKey    = $env:GROQ_API_KEY,
    [string] $ApiBase       = 'http://localhost:5000',
    [string] $Model         = 'groq/compound-mini',
    [int]    $BatchSize     = 1,
    [int]    $MaxCount      = 0,
    [int]    $DelayMs       = 15000,
    [int[]]  $ParaIds       = @(),
    [switch] $Force,
    [switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $GroqApiKey) {
    Write-Error 'Provide -GroqApiKey or set the GROQ_API_KEY environment variable.'
    exit 1
}

# ── Fetch paragraphs ──────────────────────────────────────────────────────────
$url = "$ApiBase/api/books/$BookId/chapters/$ChapterNumber/paragraphs"
Write-Host "Fetching paragraphs from $url ..."
$all = Invoke-RestMethod -Uri $url -Method Get

if ($ParaIds.Count -gt 0) {
    $toGloss = @($all | Where-Object { $ParaIds -contains $_.id })
    Write-Host "Targeting $($toGloss.Count) specific paragraph(s)."
} elseif ($Force) {
    $toGloss = @($all)
    Write-Host "Force mode - will re-gloss all $($toGloss.Count) paragraph(s)."
} else {
    Write-Host 'Checking which paragraphs already have a cached gloss...'
    $toGloss = @($all | Where-Object {
        $g = Invoke-RestMethod "$ApiBase/api/paragraphs/$($_.id)/gloss?cacheOnly=true" -Method Get -ErrorAction SilentlyContinue
        $existing = $g.gloss
        return (-not $existing) -or ($existing -eq '{}') -or ($existing.Length -le 2)
    })
}

if ($MaxCount -gt 0) { $toGloss = @($toGloss | Select-Object -First $MaxCount) }
Write-Host "$($toGloss.Count) paragraph(s) to gloss."
if ($toGloss.Count -eq 0) { Write-Host 'Nothing to do.'; exit 0 }

# ── Groq batch call ───────────────────────────────────────────────────────────
function Invoke-GlossGroqBatch {
    param(
        [string]   $ApiModel,
        [string]   $ApiKey,
        [string[]] $Stanzas
    )

    $stanzaBlock = ''
    for ($i = 0; $i -lt $Stanzas.Count; $i++) {
        $stanzaBlock += "[$i]`n$($Stanzas[$i].Trim())`n`n"
    }
    $stanzaBlock = $stanzaBlock.Trim()

    # Build prompt via concatenation — here-strings must have closing "@ at column 0
    # which is impossible inside a function body without ugly dedenting.
    $rules = 'Rules:' + "`n" +
        '- Return a JSON object: outer keys are stanza indices ("0","1",...), values are gloss objects' + "`n" +
        '- Each gloss object: keys are the exact Italian tokens as they appear (lowercase, preserve diacritics), values are English glosses' + "`n" +
        '- Cover every word across all lines of each stanza' + "`n" +
        '' + "`n" +
        'KEY FORMAT — critical:' + "`n" +
        '- Keys must be clean word tokens with NO trailing punctuation. Strip any comma, period, colon, semicolon.' + "`n" +
        '  WRONG: "mattino," or "fame," or "rispuosemi:" or "ambedui."' + "`n" +
        '  RIGHT: "mattino" or "fame" or "rispuosemi" or "ambedui"' + "`n" +
        '' + "`n" +
        'GRAMMAR — highest priority:' + "`n" +
        '- "per" before an infinitive = "to/in order to" (never "for"):' + "`n" +
        '  "per trattar" = "to speak of", "per ritornar" = "to return", "per venire" = "to come"' + "`n" +
        '- Italian verb conjugation already implies its subject — do NOT add a pronoun to the gloss:' + "`n" +
        '  "ho" = "have" (not "I have"), "dirò" = "will tell" (not "I will tell")' + "`n" +
        '  "ha" = "has", "verrà" = "will come", "saranno" = "will be"' + "`n" +
        '  Only include "I/he/she" if the Italian has an explicit pronoun (io, tu, egli, i'', ella)' + "`n" +
        '- "m''" clitic = "me" (not "myself"): "m''apparve" = "appeared to me", "m''ha" = "has made me"' + "`n" +
        '' + "`n" +
        'SPECIFIC WORDS — common errors to avoid:' + "`n" +
        '- contractions: nel="in the", del="of the", al="to the", dal="from the", col="with the"' + "`n" +
        '- "mezzo" = "middle" (not "halfway"), "per" = "through/within/to" by context' + "`n" +
        '- "mi" reflexive = "myself", "si" reflexive = "himself"' + "`n" +
        '- "or"/"or''" without accent = "now" (temporal adverb, not the disjunctive "or")' + "`n" +
        '- "se''" with apostrophe (from essere) = "are": "tu se''" = "you are" (not "if")' + "`n" +
        '- "ché/che" as conjunction = "for" or "that"' + "`n" +
        '- "là" with accent = "there", "sì" with accent = "so/yes", "è" = "is", "e" = "and"' + "`n" +
        '- "fiera" as noun = "beast/wild animal" (not the adjective "fierce")' + "`n" +
        '- "presta/presto" as adjective = "swift/nimble" (not "ready" or "to lend")' + "`n" +
        '- "quai/quali" = "which/whom" (not "quay" the harbor structure)' + "`n" +
        '- "ivi" = "there" (not a pronoun like "him")' + "`n" +
        '- "cu''" = "whom" (relative pronoun, not "with")' + "`n" +
        '- "veltro" = "hound/greyhound" (not "velvet")' + "`n" +
        '- "campar" in this context = "to escape/be saved" (not "to appear")' + "`n" +
        '- "ria" as adjective = "wicked/vile" (not "again")' + "`n" +
        '- "dilettoso" = "delightful/pleasant" (adjective, not the noun "enjoyer")' + "`n" +
        '- "noia" archaic = "trouble/weariness" (not "boredom")' + "`n" +
        '- single-letter particles: "e"="and", "a"="to/at", "i"="the", "o"="or"' + "`n" +
        '- "ivi"="there", "ove"="where", "ond''"="whence/therefore"' + "`n" +
        '' + "`n" +
        '- Do NOT add notes, parentheses, or alternatives — one clean gloss per word' + "`n" +
        '- Return ONLY the JSON object, no markdown, no explanation'

    $promptRaw = 'You are a medieval Italian scholar creating interlinear glosses for Dante''s Inferno.' + "`n`n" +
        'Stanzas (numbered):' + "`n" + $stanzaBlock + "`n`n" +
        'Task: for every word token in each stanza, give the single best English equivalent in THIS specific context.' + "`n`n" +
        $rules

    $escapedPrompt = $promptRaw `
        -replace '\\', '\\' `
        -replace '"',  '\"' `
        -replace "`r`n", '\n' `
        -replace "`n",   '\n' `
        -replace "`t",   '\t'

    $body = '{"model":"' + $ApiModel + '","max_tokens":6000,"temperature":0,' +
            '"messages":[{"role":"user","content":"' + $escapedPrompt + '"}]}'
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)

    $headers = @{
        'Authorization' = "Bearer $ApiKey"
        'Content-Type'  = 'application/json; charset=utf-8'
    }

    # Invoke-WebRequest + manual UTF-8 decode avoids PS 5.1 Latin-1 response corruption
    $webResp = Invoke-WebRequest `
        -Uri         'https://api.groq.com/openai/v1/chat/completions' `
        -Method      Post `
        -Headers     $headers `
        -Body        $bodyBytes `
        -ContentType 'application/json; charset=utf-8'

    $responseText = [System.Text.Encoding]::UTF8.GetString($webResp.RawContentStream.ToArray())
    $respObj  = $responseText | ConvertFrom-Json
    $content  = $respObj.choices[0].message.content.Trim()

    # Strip markdown code fences if present (```json ... ```)
    if ($content -match '(?s)```(?:json)?\s*(\{.+\})\s*```') {
        return $Matches[1].Trim()
    }
    # Extract outermost JSON object if surrounded by prose
    if ($content -match '(?s)(\{.+\})') {
        return $Matches[1].Trim()
    }
    return $content
}

# ── Main loop ─────────────────────────────────────────────────────────────────
$success      = 0
$failed       = 0
$batchNum     = 0
$totalBatches = [Math]::Ceiling($toGloss.Count / $BatchSize)

for ($bStart = 0; $bStart -lt $toGloss.Count; $bStart += $BatchSize) {
    $bEnd  = [Math]::Min($bStart + $BatchSize, $toGloss.Count) - 1
    $batch = @($toGloss[$bStart..$bEnd])
    $batchNum++

    Write-Host "`n=== Batch $batchNum / $totalBatches ($($batch.Count) stanzas) ==="
    for ($i = 0; $i -lt $batch.Count; $i++) {
        Write-Host "  [$i] Para $($batch[$i].id): $($batch[$i].text -replace '\n', ' | ')"
    }

    try {
        $stanzaTexts = @($batch | ForEach-Object { $_.text })
        $batchJson   = Invoke-GlossGroqBatch -ApiModel $Model -ApiKey $GroqApiKey -Stanzas $stanzaTexts
        $batchParsed = $batchJson | ConvertFrom-Json
        if (-not $batchParsed) { throw "Model returned empty or unparseable JSON: $batchJson" }

        for ($i = 0; $i -lt $batch.Count; $i++) {
            $para      = $batch[$i]
            $glossProp = $batchParsed.PSObject.Properties["$i"]

            if (-not $glossProp) {
                Write-Warning "  [$i] No gloss returned for para $($para.id)"
                $failed++
                continue
            }

            # Lowercase all keys for consistent normWord lookup in the frontend
            $lowered = @{}
            $glossProp.Value.PSObject.Properties | ForEach-Object {
                $lowered[$_.Name.ToLowerInvariant()] = $_.Value
            }
            $glossJsonFinal = $lowered | ConvertTo-Json -Compress
            Write-Host "  [$i] GL: $glossJsonFinal"

            if ($DryRun) {
                Write-Host "  [$i] [DRY RUN]"
                $success++
            } else {
                $seedUrl  = "$ApiBase/api/paragraphs/$($para.id)/gloss"
                $reqBody  = @{ GlossJson = $glossJsonFinal; TargetLanguage = 'English' } | ConvertTo-Json
                $reqBytes = [System.Text.Encoding]::UTF8.GetBytes($reqBody)
                Invoke-RestMethod -Uri $seedUrl -Method Put `
                    -ContentType 'application/json' -Body $reqBytes | Out-Null
                Write-Host "  [$i] Saved."
                $success++
            }
        }
    } catch {
        Write-Warning "Batch $batchNum failed: $_"
        $failed += $batch.Count
    }

    if ($batchNum -lt $totalBatches) {
        Write-Host "`nWaiting $([int]($DelayMs / 1000))s before next batch..."
        Start-Sleep -Milliseconds $DelayMs
    }
}

Write-Host "`nDone. Success: $success  Failed: $failed"
