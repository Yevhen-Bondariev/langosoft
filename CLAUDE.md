# LangoSoft – Claude Instructions

## Before every push that touches TypeScript files

Run the TypeScript compiler check and confirm it passes before committing:

```
cd frontend && npx tsc --noEmit
```

Do not push if there are any errors.

## Development servers

**Backend** (ASP.NET, port 5000):
```
cd backend/LangoSoft.Api && dotnet run
```

**Frontend** (Vite, port 5173):
```
cd frontend && npm run dev
```

To restart both, kill existing processes first:
```powershell
Get-Process dotnet,node -ErrorAction SilentlyContinue | Stop-Process -Force
```
Then start each server in the background with `run_in_background`.

Book IDs: 1=Dorian Gray, 2=Hamlet, 3=Julius Caesar, 4=Politics and the English Language, 5=La Divina Commedia (Dante)

Dante chapters are 0-indexed: chapter 0 = Canto I, chapter 1 = Canto II, etc.

## Stanza refinement script

To run LLM-polished translations for Dante (requires Groq key):
```powershell
.\refine-stanzas.ps1 -GroqApiKey "gsk_..." -BookId 5 -ChapterNumber 0
```
Use `-MaxCount 1` for a single-stanza test. `-DryRun` to preview without saving.
Model: `openai/gpt-oss-120b` (reasoning model, needs 1000 max_tokens).
