# seed-ukrainian.ps1
# Seeds Drobyazko's Ukrainian translation of Dante's Divine Comedy from ukrlib.com.ua.
# Fetches pages in bulk, parses numbered lines (N] text), groups into terzas, PATCHes each paragraph.
#
# Usage:
#   .\seed-ukrainian.ps1                        # all 34 Inferno cantos
#   .\seed-ukrainian.ps1 -CantoStart 1 -CantoEnd 3
#   .\seed-ukrainian.ps1 -DryRun               # preview without writing

param(
    [int]$CantoStart = 1,
    [int]$CantoEnd   = 100,
    [switch]$DryRun,
    [string]$ApiBase = "http://localhost:5000"
)

$BookId = 5
$Enc    = [System.Text.Encoding]::GetEncoding("windows-1251")

# --- 1. Fetch pages ---

Write-Host "Fetching Drobyazko translation from ukrlib.com.ua..."

$rawLines = [System.Collections.Generic.List[string]]::new()
$page = 1

while ($true) {
    $url = "https://www.ukrlib.com.ua/world/printit.php?tid=347&page=$page"
    Write-Host "  Page $page..." -NoNewline
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
        $html = $Enc.GetString($resp.RawContentStream.ToArray())
    } catch {
        Write-Host " ERROR: $_"; break
    }

    # Extract article body only
    if ($html -match '<article[^>]*id="content"[^>]*>([\s\S]*?)</article>') {
        $content = $Matches[1]
    } else {
        Write-Host " no article, stopping"; break
    }

    # Stop when no numbered poem lines remain
    if ($content -notmatch '\d+\]') {
        Write-Host " end of poem content"; break
    }

    # Strip scripts/styles, convert <br> to newlines, strip remaining tags
    $content = $content -replace '(?s)<script[^>]*>.*?</script>', ''
    $content = $content -replace '(?s)<style[^>]*>.*?</style>',  ''
    $content = $content -replace '<br\s*/?>', "`n"
    $content = $content -replace '<[^>]+>',   ' '
    $content = $content -replace '&nbsp;',    ' '
    $content = $content -replace '&amp;',     '&'
    $content = $content -replace '&#160;',    ' '
    $content = $content -replace '&lt;',      '<'
    $content = $content -replace '&gt;',      '>'

    $lines = $content -split '\r?\n' |
        ForEach-Object { ($_ -replace '\s+', ' ').Trim() } |
        Where-Object   { $_ -ne '' }

    $rawLines.AddRange([string[]]$lines)
    Write-Host " $($lines.Count) lines"
    $page++
    Start-Sleep -Milliseconds 500
}

Write-Host "Total raw lines: $($rawLines.Count)"

# --- 2. Parse cantos ---
# Section order: PEKLO (34 cantos) -> CHYSTYLYSHCHE (33) -> RAY (33)
# Canto boundaries: "PISNYA [ORDINAL]" headings, counted per section.
# Section IDs advance monotonically (navigation noise can't re-enter a past section).

$cantos      = @{}   # absolute canto 1-100 -> [string[]] poem lines
$sectionRank = @{ 'ПЕКЛО' = 1; 'ЧИСТИЛИЩЕ' = 2; 'РАЙ' = 3 }
$sectionBase = @{ 'ПЕКЛО' = 0; 'ЧИСТИЛИЩЕ' = 34; 'РАЙ' = 67 }
$sectionIdx  = @{ 'ПЕКЛО' = 0; 'ЧИСТИЛИЩЕ' = 0;  'РАЙ' = 0  }
$section     = 'ПЕКЛО'
$currentRank = 1
$currentCanto = 0

foreach ($line in $rawLines) {
    # Section header — only advance, never retreat (guards against nav breadcrumbs)
    if ($sectionRank.ContainsKey($line) -and $sectionRank[$line] -ge $currentRank) {
        $section      = $line
        $currentRank  = $sectionRank[$line]
        continue
    }

    # Canto header: "ПІСНЯ ПЕРША", "ПІСНЯ ДВАДЦЯТЬ ТРЕТЯ", etc.
    if ($line -match '^ПІСНЯ\s+[А-ЯІЇЄ]') {
        $sectionIdx[$section]++
        $currentCanto = $sectionBase[$section] + $sectionIdx[$section]
        if (-not $cantos.ContainsKey($currentCanto)) {
            $cantos[$currentCanto] = [System.Collections.Generic.List[string]]::new()
        }
        continue
    }

    # Numbered poem line: "N] text of the verse"
    if ($currentCanto -gt 0 -and $line -match '^\d+\]\s*(.+)$') {
        $cantos[$currentCanto].Add($Matches[1].Trim())
    }
}

Write-Host "Parsed $($cantos.Count) cantos"

# --- 3. Seed ---

function Set-Ukrainian([int]$paraId, [string]$stanza) {
    $escaped = $stanza -replace '\\', '\\' -replace '"', '\"' -replace "`r", '' -replace "`n", '\n'
    $body    = '"' + $escaped + '"'
    $bytes   = [System.Text.Encoding]::UTF8.GetBytes($body)
    Invoke-WebRequest -Uri "$ApiBase/api/paragraphs/$paraId/ukrainian" `
        -Method PATCH -Body $bytes -ContentType "application/json; charset=utf-8" `
        -UseBasicParsing | Out-Null
}

$totalOk = 0; $totalFail = 0

for ($canto = $CantoStart; $canto -le $CantoEnd; $canto++) {
    $chapterNum = $canto - 1
    Write-Host "Canto $canto (chapter $chapterNum)..." -NoNewline

    if (-not $cantos.ContainsKey($canto)) {
        Write-Host " NO DATA"; continue
    }

    $poemLines = @($cantos[$canto])

    # Group into terzas of 3; last stanza may be 1 line (Inf. III coda, etc.)
    $stanzas = @()
    $i = 0
    while ($i -lt $poemLines.Count) {
        $take = if ($poemLines.Count - $i -ge 3) { 3 } else { $poemLines.Count - $i }
        $stanzas += ,($poemLines[$i..($i + $take - 1)] -join "`n")
        $i += $take
    }

    $paraResp = Invoke-WebRequest -Uri "$ApiBase/api/books/$BookId/chapters/$chapterNum/paragraphs" -UseBasicParsing
    $paras    = $paraResp.Content | ConvertFrom-Json
    $match    = [Math]::Min($paras.Count, $stanzas.Count)

    if ($stanzas.Count -ne $paras.Count) {
        Write-Host ""
        Write-Host "  WARNING: $($paras.Count) DB paragraphs vs $($stanzas.Count) stanzas — seeding first $match"
    } else {
        Write-Host " $match stanzas"
    }

    $ok = 0; $fail = 0
    for ($j = 0; $j -lt $match; $j++) {
        if ($DryRun) {
            $preview = $stanzas[$j] -replace '\n', ' | '
            Write-Host "  [DRY] para $($paras[$j].id): $($preview.Substring(0, [Math]::Min(80, $preview.Length)))"
            $ok++; continue
        }
        try {
            Set-Ukrainian $paras[$j].id $stanzas[$j]
            $ok++
        } catch {
            Write-Host "  FAIL para $($paras[$j].id): $_"; $fail++
        }
    }

    if (-not $DryRun) { Write-Host "  $ok ok, $fail failed" }
    $totalOk += $ok; $totalFail += $fail
}

Write-Host ""
Write-Host "Total: $totalOk seeded, $totalFail failed"
