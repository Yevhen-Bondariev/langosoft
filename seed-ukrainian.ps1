# seed-ukrainian.ps1
# Seeds Strikha's Ukrainian translation of Dante's Inferno into the DB.
# Fetches from poetyka.uazone.net canto by canto and PATCHes each paragraph.
#
# Usage:
#   .\seed-ukrainian.ps1                        # all 34 cantos
#   .\seed-ukrainian.ps1 -CantoStart 1 -CantoEnd 3
#   .\seed-ukrainian.ps1 -CantoStart 1 -DryRun  # preview without writing

param(
    [int]$CantoStart = 1,
    [int]$CantoEnd   = 34,
    [switch]$DryRun
)

$ApiBase = "http://localhost:5000"
$BookId  = 5

function Get-UkrainianStanzas([int]$canto) {
    $nn  = $canto.ToString("D2")
    $url = "https://poetyka.uazone.net/default/pages.phtml?place=strikha&page=peklo${nn}&alist=skip"

    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
        $html = $resp.Content
    } catch {
        Write-Host "  ERROR fetching $url : $_"
        return @()
    }

    # Preserve newlines from block-level elements before stripping tags
    $html = $html -replace '<br\s*/?>', "`n"
    $html = $html -replace '</?(?:p|div|li|tr|td|th|h[1-6])[^>]*>', "`n"

    # Strip all remaining tags and decode common entities
    $text = $html -replace '<[^>]+>', ''
    $text = $text -replace '&nbsp;',  ' '
    $text = $text -replace '&lt;',    '<'
    $text = $text -replace '&gt;',    '>'
    $text = $text -replace '&amp;',   '&'
    $text = $text -replace '&#160;',  ' '

    # Split to lines; keep only lines that look like poem lines:
    # - contain Cyrillic
    # - length >= 20 (filters out titles like "Пісня перша", nav links, etc.)
    $poemLines = $text -split '\r?\n' |
        ForEach-Object { $_.Trim() } |
        Where-Object { ($_ -match '[Ѐ-ӿ]') -and ($_.Length -ge 20) -and ($_ -cmatch '[а-яіїєґ]') -and ($_ -notmatch 'переклав|права застережені|&copy;|©|\|\|') }

    if ($poemLines.Count -eq 0) {
        Write-Host "  WARNING: no poem lines extracted"
        return @()
    }

    # Group into stanzas: consecutive lines collected until a gap would break them.
    # Since terza rima is strictly 3 lines, group in threes; handle a trailing
    # 1-line coda (e.g. Inf. III ends on a single line).
    $stanzas = @()
    $i = 0
    while ($i -lt $poemLines.Count) {
        $remaining = $poemLines.Count - $i
        $take = if ($remaining -ge 3) { 3 } else { $remaining }
        $stanzas += ($poemLines[$i..($i + $take - 1)] -join "`n")
        $i += $take
    }

    return $stanzas
}

function Patch-Ukrainian([int]$paraId, [string]$stanza) {
    $escaped  = $stanza -replace '\\', '\\' -replace '"', '\"' -replace "`r", '' -replace "`n", '\n'
    $body     = '"' + $escaped + '"'
    $bytes    = [System.Text.Encoding]::UTF8.GetBytes($body)
    Invoke-WebRequest -Uri "$ApiBase/api/paragraphs/$paraId/ukrainian" `
        -Method PATCH -Body $bytes -ContentType "application/json; charset=utf-8" `
        -UseBasicParsing | Out-Null
}

$totalOk = 0; $totalFail = 0

for ($canto = $CantoStart; $canto -le $CantoEnd; $canto++) {
    $chapterNum = $canto - 1   # DB is 0-indexed
    Write-Host "Canto $canto (chapter $chapterNum)..." -NoNewline

    $stanzas = Get-UkrainianStanzas $canto
    if ($stanzas.Count -eq 0) { Write-Host " skipped"; continue }

    $paraResp = Invoke-WebRequest -Uri "$ApiBase/api/books/$BookId/chapters/$chapterNum/paragraphs" -UseBasicParsing
    $paras = $paraResp.Content | ConvertFrom-Json

    $match = [Math]::Min($paras.Count, $stanzas.Count)
    if ($stanzas.Count -ne $paras.Count) {
        Write-Host ""
        Write-Host "  WARNING: $($paras.Count) DB paragraphs vs $($stanzas.Count) Ukrainian stanzas — seeding first $match"
    } else {
        Write-Host " $match stanzas"
    }

    $ok = 0; $fail = 0
    for ($j = 0; $j -lt $match; $j++) {
        if ($DryRun) {
            $preview = $stanzas[$j] -replace '\n', ' | '
            Write-Host "  [DRY] para $($paras[$j].id): $($preview.Substring(0, [Math]::Min(70, $preview.Length)))"
            $ok++
            continue
        }
        try {
            Patch-Ukrainian $paras[$j].id $stanzas[$j]
            $ok++
        } catch {
            Write-Host "  FAIL para $($paras[$j].id): $_"
            $fail++
        }
    }

    if (-not $DryRun) { Write-Host "  $ok ok, $fail failed" }
    $totalOk += $ok; $totalFail += $fail

    Start-Sleep -Milliseconds 300
}

Write-Host ""
Write-Host "Total: $totalOk seeded, $totalFail failed"
