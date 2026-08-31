#Requires -Version 5.1
<#
.SYNOPSIS
  LLM-polishes stanza translations for a specific book chapter using Groq.
  Reads paragraphs that have DeepL text set but no refined text yet, sends each
  terzina to the LLM, then PATCHes the result to /api/paragraphs/{id}/refined.

.PARAMETER BookId        Book ID (default: 1)
.PARAMETER ChapterNumber 1-based chapter number (default: 1 = Canto I)
.PARAMETER GroqApiKey    Groq API key (or set env var GROQ_API_KEY)
.PARAMETER ApiBase       Backend base URL (default: http://localhost:5000)
.PARAMETER Model         Groq model (default: openai/gpt-oss-120b)
.PARAMETER MaxCount      Stop after this many stanzas (0 = all). Use 1 for a test run.
.PARAMETER DelayMs       Milliseconds to sleep between calls (default: 2100).
.PARAMETER DryRun        Print prompts and responses without saving to DB.
#>
param(
    [int]    $BookId        = 1,
    [int]    $ChapterNumber = 1,
    [string] $GroqApiKey    = $env:GROQ_API_KEY,
    [string] $ApiBase       = 'http://localhost:5000',
    [string] $Model         = 'openai/gpt-oss-120b',
    [int]    $MaxCount      = 0,
    [int]    $DelayMs       = 2100,
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
$paragraphs = Invoke-RestMethod -Uri $url -Method Get
$toRefine = @($paragraphs | Where-Object { $_.deeplText -and -not ($_.PSObject.Properties['refinedText'] -and $_.refinedText) })
if ($MaxCount -gt 0) { $toRefine = @($toRefine | Select-Object -First $MaxCount) }
Write-Host "$($toRefine.Count) paragraph(s) to refine."

if ($toRefine.Count -eq 0) { Write-Host 'Nothing to do.'; exit 0 }

# ── Groq call ─────────────────────────────────────────────────────────────────
function Invoke-Groq {
    param(
        [string] $Italian,
        [string] $Deepl,
        [string] $Longfellow = ''
    )

    # Build the Longfellow block only when data is available
    $lfBlock = if ($Longfellow.Trim()) {
        @"

Longfellow's 19th-century translation (scholarly accurate but deliberately archaic —
use for meaning/interpretation guidance only, NOT as a style or vocabulary model):
$($Longfellow.Trim())

Rule: if DeepL and Longfellow agree on the meaning, express it in modern English.
If they disagree, prefer Longfellow's reading of the meaning, DeepL's register.
Never copy Longfellow's phrasing or archaic words directly.
"@
    } else { '' }

    $prompt = @"
You are a scholar translating Dante's Inferno from medieval Tuscan Italian (~1300 AD) into polished modern English.

Italian terzina:
$($Italian.Trim())

DeepL modern translation (reference only — may have word-choice issues):
$($Deepl.Trim())
$lfBlock
Write a polished 3-line English translation. Follow every rule below:

WORD CHOICE — medieval Italian often differs from modern Italian:
- "lasso / lassa" = weary, exhausted (NOT the lasso tool)
- "presta / presto" as adjective = swift, nimble (NOT "to lend"; it is NOT a verb here)
- "si volse" = turned around, wheeled around (the "si" is reflexive, NOT the affirmation "yes")
- "si" before a verb = reflexive marker, not the word "yes"
- "sì" with accent = yes / indeed (not "so" or "thus")
- "là" with accent = there (not the article "la")
- "è" with accent = is / was (never "and"; bare "e" without accent = and)
- "abbandonare" in context = to lose one's way / to stray (not merely "to abandon")
- "selva" = forest, wood (not jungle)
- "diritta" = straight, right (path) — "la diritta via" = the straight road / the right path
- "nel mezzo del cammin" = midway through the journey of life (standard fixed phrase)

STYLE:
- Modern dignified English — gravity suitable for Dante, but NOT 19th-century archaisms
- Do not force rhyme or meter
- Prefer active voice
- Match the emotional weight: fear, wonder, solemnity

OUTPUT FORMAT:
- Exactly 3 lines, one per Italian line, matching the Italian structure
- No labels ("Line 1:", etc.), no commentary, no blank lines between lines
- Only the 3 translated lines, nothing else
"@

    # Build JSON manually to avoid locale-dependent decimal separator (Ukrainian: 0,3 → invalid JSON)
    $escapedPrompt = $prompt `
        -replace '\\', '\\' `
        -replace '"',  '\"' `
        -replace "`r`n", '\n' `
        -replace "`n",   '\n' `
        -replace "`t",   '\t'
    # Build via concatenation — NOT a PS double-quoted string — so escaped quotes inside
    # $escapedPrompt (from the word list: "lasso", "presta" etc.) don't terminate the PS string.
    # 1000 tokens: reasoning models spend ~500-700 tokens thinking before writing the 3 lines.
    $body = '{"model":"' + $Model + '","max_tokens":1000,"temperature":0.3,"messages":[{"role":"user","content":"' + $escapedPrompt + '"}]}'

    # PS 5.1 on Windows encodes -Body strings with the system ANSI codepage (CP1251 on UA),
    # which corrupts non-ANSI chars like em dash (U+2014 → 0x97). Send raw UTF-8 bytes instead.
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)

    $headers = @{
        'Authorization' = "Bearer $GroqApiKey"
        'Content-Type'  = 'application/json; charset=utf-8'
    }

    $response = Invoke-RestMethod `
        -Uri         'https://api.groq.com/openai/v1/chat/completions' `
        -Method      Post `
        -Headers     $headers `
        -Body        $bodyBytes `
        -ContentType 'application/json; charset=utf-8'

    return $response.choices[0].message.content.Trim()
}

# ── Main loop ─────────────────────────────────────────────────────────────────
$success = 0; $failed = 0

foreach ($para in $toRefine) {
    Write-Host "`n=== Paragraph $($para.id) ==="
    Write-Host "IT: $($para.text     -replace '\n', ' | ')"
    Write-Host "DL: $($para.deeplText -replace '\n', ' | ')"
    if ($para.longfellowText) {
    Write-Host "LF: $($para.longfellowText -replace '\n', ' | ')"
    }

    try {
        $lfText  = if ($para.longfellowText) { $para.longfellowText } else { '' }
        $refined = Invoke-Groq -Italian $para.text -Deepl $para.deeplText -Longfellow $lfText

        Write-Host "RF: $($refined -replace '\n', ' | ')"

        if ($DryRun) {
            Write-Host '[DRY RUN — not saved]'
        } else {
            $patchUrl = "$ApiBase/api/paragraphs/$($para.id)/refined"
            $jsonBody  = $refined | ConvertTo-Json
            Invoke-RestMethod -Uri $patchUrl -Method Patch `
                -ContentType 'application/json' -Body $jsonBody | Out-Null
            Write-Host 'Saved.'
            $success++
        }

        if ($toRefine.IndexOf($para) -lt $toRefine.Count - 1) {
            Start-Sleep -Milliseconds $DelayMs
        }
    }
    catch {
        Write-Warning "Failed for paragraph $($para.id): $_"
        $failed++
    }
}

Write-Host "`nDone. Success: $success  Failed: $failed"
