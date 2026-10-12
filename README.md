# RepoLens — AI Repository Explainer

**Problem:** New contributors waste hours figuring out how an unfamiliar open-source repo is organized.
**Solution:** Paste a public GitHub URL. RepoLens fetches the real code, picks the most relevant files, and an AI model explains the architecture, gives a file guide, answers questions, or diagnoses a bug — citing the files it used and stating what it is unsure of.

## Architecture

```text
User (URL + mode/question)
   │
   ▼
Repository processing  (src/lib/github-loader.server.ts)
   GitHub API tree → ignore deps/binaries → rank key files → fetch & truncate
   │
   ▼
AI engine ★ core      (src/routes/api/explain.ts)
   Grounded system prompt + repo context → LLM via Lovable AI Gateway (streamed)
   │
   ▼
Validation & output
   Mandatory file citations, "Uncertainty" section, error surfacing
   │
   ▼
Interactive UI         (src/routes/index.tsx)
   Pipeline status, evidence list, streamed Markdown answer
```

Without the model, the app only lists files — the explanation, reasoning, and diagnosis are produced entirely by the AI.

## Modes
Architecture · File guide · Ask a question · Diagnose a bug

## Run locally
```bash
bun install
cp .env.example .env   # set LOVABLE_API_KEY
bun run dev
```

## Design decisions
- Heuristic file ranking (manifests, READMEs, entry points, shallow `src/` files) keeps context within model limits.
- Streaming output so long analyses appear immediately.
- Prompt forces evidence citations and explicit uncertainty to reduce hallucination.

## Limitations
- Public repos only; unauthenticated GitHub API is limited to 60 requests/hour.
- Only ~14 files (6 KB each) are analyzed, so very large repos are partially covered.
- The model can still be wrong; check cited files.

## License
MIT — see [LICENSE](LICENSE).
