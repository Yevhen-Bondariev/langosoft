param(
    [string[]]$ApiKeys = @(
        # Paste your Groq API keys here, one per line: "gsk_..."
    ),
    [int]$BookId = 5,
    [int]$BatchSize = 50,
    [int]$DelaySeconds = 90,
    [string]$OutputFile = "$PSScriptRoot\..\frontend\public\gloss-it.json"
)

$groqUrl = "https://api.groq.com/openai/v1/chat/completions"
$script:keyIdx = 0

function Invoke-Groq([string]$Prompt) {
    $tried = 0
    while ($tried -lt $ApiKeys.Count) {
        $key = $ApiKeys[$script:keyIdx % $ApiKeys.Count]
        $script:keyIdx = ($script:keyIdx + 1) % $ApiKeys.Count
        $tried++
        $body = @{
            model = "groq/compound-mini"; max_tokens = 2048; temperature = 0
            response_format = @{ type = "json_object" }
            messages = @(@{ role = "user"; content = $Prompt })
        } | ConvertTo-Json -Depth 5 -Compress
        try {
            $r = Invoke-WebRequest -Uri $groqUrl -Method Post -TimeoutSec 60 `
                -Headers @{ Authorization = "Bearer $key"; "Content-Type" = "application/json" } `
                -Body $body
            return ($r.Content | ConvertFrom-Json).choices[0].message.content
        } catch {
            $sc = $_.Exception.Response.StatusCode.value__
            $tail = $key.Substring($key.Length - 8)
            if ($sc -eq 429) { Write-Host "  ...$tail 429" -ForegroundColor Yellow }
            else              { Write-Host "  ...$tail HTTP $sc" -ForegroundColor Red }
        }
    }
    return $null
}

# Load existing progress
$gloss = @{}
if (Test-Path $OutputFile) {
    try {
        $existing = [System.IO.File]::ReadAllText($OutputFile, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
        $existing.PSObject.Properties | ForEach-Object { $gloss[$_.Name] = $_.Value }
        Write-Host "Loaded $($gloss.Count) existing translations." -ForegroundColor Cyan
    } catch { Write-Host "Could not parse existing file, starting fresh." -ForegroundColor Yellow }
}

# Fetch words in reading order (Canto 1 words first, Canto 2 next, etc.)
# This guarantees that partial runs always cover the beginning of the book.
Write-Host "Fetching word list in reading order..."
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:5000/api/books/$BookId/words-ordered" -TimeoutSec 30
    $data = $resp.Content | ConvertFrom-Json
    # $data.words is an array of {norm, orig} objects in first-appearance order
    $orderedWords = $data.words
    Write-Host ("Book: {0} unique words in reading order." -f $orderedWords.Count) -ForegroundColor Cyan
} catch {
    Write-Host "ERROR: Cannot reach server at http://localhost:5000" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

$langName = if ($data.language -eq "it") { "Italian" } else { $data.language }

# Skip words already translated; keep reading-order for untranslated ones
$remaining = @($orderedWords | Where-Object { -not $gloss.ContainsKey($_.norm) })
Write-Host ("{0} words still need translation (reading-order: Canto 1 first)." -f $remaining.Count) -ForegroundColor Cyan
if ($remaining.Count -eq 0) { Write-Host "All done." -ForegroundColor Green; exit 0 }

$totalBatches = [Math]::Ceiling($remaining.Count / $BatchSize)
Write-Host ("Starting {0} batches of {1} words. Delay: {2}s between batches." -f $totalBatches, $BatchSize, $DelaySeconds)
Write-Host "Safe to Ctrl+C -- progress saved after every batch."
Write-Host ""

for ($i = 0; $i -lt $remaining.Count; $i += $BatchSize) {
    $batchNum = [Math]::Floor($i / $BatchSize) + 1

    if ($i -gt 0) {
        Write-Host ("  Waiting {0}s..." -f $DelaySeconds) -NoNewline
        Start-Sleep -Seconds $DelaySeconds
        Write-Host " ok"
    }

    $bEnd = [Math]::Min($i + $BatchSize - 1, $remaining.Count - 1)
    $batch = $remaining[$i..$bEnd]

    # Send original (un-normalised) forms to Groq; store result under normalised key
    $origWords = $batch | ForEach-Object { $_.orig }
    $text = $origWords -join " "

    $p1 = "Translate every word of this $langName text into English."
    $p2 = "Output a single JSON object where each key is the original word"
    $p3 = "and the value is its English translation (1-3 words). Include every word."
    $p4 = "Text: $text"
    $p5 = "Output only the JSON object, nothing else."
    $prompt = "$p1 $p2 $p3`n`n$p4`n`n$p5"

    Write-Host ("Batch {0}/{1} (words {2}-{3})..." -f $batchNum, $totalBatches, ($i+1), ($bEnd+1)) -NoNewline

    $raw = Invoke-Groq $prompt
    if ($null -eq $raw) {
        Write-Host " all keys rate-limited -- waiting 5 min..." -ForegroundColor Red
        Start-Sleep -Seconds 300
        $raw = Invoke-Groq $prompt
    }
    if ($null -eq $raw) { Write-Host " skipped" -ForegroundColor Red; continue }

    $s = $raw.IndexOf('{'); $e = $raw.LastIndexOf('}')
    if ($s -lt 0 -or $e -le $s) { Write-Host " no JSON" -ForegroundColor Red; continue }

    try {
        $parsed = $raw.Substring($s, $e - $s + 1) | ConvertFrom-Json
        $added = 0
        # Map returned keys (orig forms) back to normalised keys for frontend lookup
        $normMap = @{}
        $batch | ForEach-Object { $normMap[$_.orig] = $_.norm }
        $parsed.PSObject.Properties | ForEach-Object {
            $origKey = $_.Name.ToLower()
            $val = $_.Value
            if (-not [string]::IsNullOrWhiteSpace($val)) {
                # Try direct orig match first, then fall back to key as-is
                $normKey = if ($normMap.ContainsKey($origKey)) { $normMap[$origKey] } else { $origKey }
                $gloss[$normKey] = $val
                $added++
            }
        }
        $json = $gloss | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText($OutputFile, $json, [System.Text.UTF8Encoding]::new($false))
        Write-Host (" +{0} words, total {1}" -f $added, $gloss.Count) -ForegroundColor Green
    } catch { Write-Host " parse error: $_" -ForegroundColor Red }
}

$sizeKB = [Math]::Round((Get-Item $OutputFile).Length / 1024, 1)
Write-Host ("Done: {0} words saved. Size: {1} KB" -f $gloss.Count, $sizeKB) -ForegroundColor Green
