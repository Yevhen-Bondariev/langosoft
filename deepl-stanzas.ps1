#Requires -Version 5.1
<#
.SYNOPSIS
  Translates stanzas for a book chapter via DeepL and stores in DeeplText column.
  Sends each verse line as a separate text item so DeepL preserves line-level structure.
  Skips paragraphs that already have DeeplText set.

.PARAMETER BookId        Book ID (default: 5 = La Divina Commedia)
.PARAMETER ChapterNumber 0-based chapter number (default: 0 = Canto I)
.PARAMETER DeeplKey      DeepL API key (or set env var DEEPL_API_KEY)
.PARAMETER ApiBase       Backend base URL (default: http://localhost:5000)
.PARAMETER Force         Re-translate even paragraphs that already have DeeplText.
.PARAMETER DryRun        Print results without saving to DB.
#>
param(
    [int]    $BookId        = 5,
    [int]    $ChapterNumber = 0,
    [string] $DeeplKey      = $env:DEEPL_API_KEY,
    [string] $ApiBase       = 'http://localhost:5000',
    [switch] $Force,
    [switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $DeeplKey) {
    Write-Error 'Provide -DeeplKey or set the DEEPL_API_KEY environment variable.'
    exit 1
}

$DeeplUrl = 'https://api-free.deepl.com/v2/translate'

# ── Fetch paragraphs ──────────────────────────────────────────────────────────
$url = "$ApiBase/api/books/$BookId/chapters/$ChapterNumber/paragraphs"
Write-Host "Fetching paragraphs from $url ..."
$paragraphs = Invoke-RestMethod -Uri $url -Method Get

$toTranslate = if ($Force) {
    @($paragraphs)
} else {
    @($paragraphs | Where-Object { -not ($_.PSObject.Properties['deeplText'] -and $_.deeplText) })
}

Write-Host "$($toTranslate.Count) paragraph(s) to translate (of $($paragraphs.Count) total)."
if ($toTranslate.Count -eq 0) { Write-Host 'Nothing to do.'; exit 0 }

# ── DeepL call ────────────────────────────────────────────────────────────────
function Invoke-DeepL {
    param([string[]] $Lines)

    # Build form body: text[]=line1&text[]=line2&text[]=line3
    $formParts = $Lines | ForEach-Object {
        'text=' + [System.Uri]::EscapeDataString($_)
    }
    $body = ($formParts -join '&') + '&target_lang=EN&source_lang=IT'

    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)

    $headers = @{
        'Authorization' = "DeepL-Auth-Key $DeeplKey"
        'Content-Type'  = 'application/x-www-form-urlencoded'
    }

    $response = Invoke-RestMethod `
        -Uri         $DeeplUrl `
        -Method      Post `
        -Headers     $headers `
        -Body        $bodyBytes `
        -ContentType 'application/x-www-form-urlencoded; charset=utf-8'

    return $response.translations | ForEach-Object { $_.text }
}

# ── Main loop ─────────────────────────────────────────────────────────────────
$success = 0; $failed = 0

foreach ($para in $toTranslate) {
    $lines = $para.text -split '\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ }

    Write-Host "`n--- Paragraph $($para.id) ---"
    Write-Host "IT: $($para.text -replace '\n',' | ')"

    try {
        $translated = Invoke-DeepL -Lines $lines
        $deeplText  = $translated -join "`n"

        Write-Host "DL: $($deeplText -replace '\n',' | ')"

        if ($DryRun) {
            Write-Host '[DRY RUN — not saved]'
        } else {
            $patchUrl  = "$ApiBase/api/paragraphs/$($para.id)/deepl"
            $jsonBody  = $deeplText | ConvertTo-Json
            Invoke-RestMethod -Uri $patchUrl -Method Patch `
                -ContentType 'application/json' -Body $jsonBody | Out-Null
            Write-Host 'Saved.'
            $success++
        }
    }
    catch {
        Write-Warning "Failed for paragraph $($para.id): $_"
        $failed++
    }
}

Write-Host "`nDone. Success: $success  Failed: $failed"
