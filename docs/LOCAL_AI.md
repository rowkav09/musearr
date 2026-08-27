# Local AI (foundation, off by default)

Musearr's ranking and playlist logic is deterministic. Local AI is an **optional**
layer that talks only to a model endpoint **you** run. There is no hosted-LLM
dependency, and nothing is sent to a third party.

## State today

- `packages/intelligence/src/ai/provider.ts` — the `LocalAiProvider` interface
  (`complete`, `embed`, `isReachable`) and `NullLocalAiProvider`, the default,
  whose calls are no-ops that report the feature as disabled.
- `packages/intelligence/src/ai/ollama.ts` — an experimental adapter for a local
  [Ollama](https://ollama.com) server.
- `packages/intelligence/src/ai/similar.ts` — `LocalAiSimilarTrackProvider`, which
  asks the model for tracks similar to a seed and is used only as a source of
  optional "gap" suggestions for playlist generation. Every failure mode
  (disabled, model error, unparseable output) degrades to an empty list.
- `GET /api/v1/settings/local-ai` — reports the configured state (owner only).

When local AI is disabled, `createLocalAiProvider` returns the null provider and
the deterministic pipeline is unchanged.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `MUSEARR_LOCAL_AI_ENABLED` | `false` | Master switch. |
| `MUSEARR_LOCAL_AI_PROVIDER` | `none` | `none` or `ollama`. |
| `MUSEARR_LOCAL_AI_BASE_URL` | – | e.g. `http://ollama.local:11434`. HTTP(S), no credentials. |
| `MUSEARR_LOCAL_AI_MODEL` | – | e.g. `llama3.1`. |

All four must be set (and `ENABLED=true`, `PROVIDER=ollama`) before any model
call is made.

## Principles for extending this

- Deterministic, explainable signals come first; AI is additive and must fail
  safe to the deterministic result.
- Keep the provider interface narrow. No provider-specific types leak into
  ranking or planning code.
- Never make local AI a hard dependency of a core path.
