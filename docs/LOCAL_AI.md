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

For playlist generation, local AI runs *after* the deterministic
MusicBrainz/ListenBrainz source (`docs/PLAYLIST_GENERATION.md`) and only tops up
what that returned.

When local AI is disabled, `createLocalAiProvider` returns the null provider and
the deterministic pipeline is unchanged.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `MUSEARR_LOCAL_AI_ENABLED` | `false` | Master switch. |
| `MUSEARR_LOCAL_AI_PROVIDER` | `none` | `none` or `ollama`. |
| `MUSEARR_LOCAL_AI_BASE_URL` | – | e.g. `http://ollama.local:11434`. HTTP(S), no credentials. |
| `MUSEARR_LOCAL_AI_MODEL` | – | e.g. `qwen2.5:3b`. |

All four must be set (and `ENABLED=true`, `PROVIDER=ollama`) before any model
call is made.

## Recommended models

The only model task wired today is `complete()` — asking for tracks similar to a
seed and parsing a small JSON array back. That rewards **dense world knowledge**
and **reliable instruction-following at small size**, not raw parameter count.
There is no small music-specialist text model in common registries, so these are
general models chosen for good music recall per gigabyte. Pull with
`ollama pull <tag>`; approximate 4-bit sizes shown.

### `complete()` — similar-track suggestions

| Tag | Params | ~Size | Notes |
|---|---|---|---|
| `qwen2.5:3b` | 3B | ~2.0 GB | **Default suggestion.** Strong knowledge density, dependable JSON. Runs on CPU. |
| `llama3.2:3b` | 3B | ~2.0 GB | Comparable; slightly chattier, occasionally wraps JSON in prose (the parser tolerates it). |
| `qwen3:4b` | 4B | ~2.6 GB | Newer, a step up in recall if you have the headroom. |
| `gemma3:4b` | 4B | ~3.3 GB | Good knowledge; fine if you already run it. |
| `phi4-mini:3.8b` | 3.8B | ~2.5 GB | Reasoning-strong for its size; knowledge a touch thinner than Qwen. |
| `gemma2:2b` / `gemma3:1b` / `granite4:1b` | 1–2B | ~0.8–1.7 GB | Fastest tier. Expect more invented track titles; keep `acquireMissing` conservative. |
| `qwen3:8b` / `mistral:7b` | 7–8B | ~4.7–5.0 GB | Best music recall in the "small" bracket; wants ~8 GB RAM/VRAM. |

### `embed()` — future semantic similarity (tags, artist blurbs)

Not wired yet, but the interface exists. Small text embedders:

| Tag | Params | ~Size | Notes |
|---|---|---|---|
| `nomic-embed-text` | 137M | ~275 MB | Good general default; trivial on CPU. |
| `snowflake-arctic-embed:137m` | 137M | ~275 MB | Strong retrieval quality at the same size. |
| `bge-m3` | 567M | ~1.2 GB | Higher quality, multilingual. |
| `all-minilm:33m` / `granite-embedding:30m` | ~30M | ~65 MB | Tiniest; lower quality, near-instant. |
| `mxbai-embed-large` | 335M | ~670 MB | Quality-leaning mid-size. |

### Genuinely music-specialised models (not applicable yet)

`MERT`, `LAION-CLAP`, and `MusicGen` are audio-input models. Musearr is a
read-only metadata companion and never holds the audio files, so they do not fit
the current `complete()`/`embed()` text interface. If a future feature ingests
audio (opt-in, owner-provided path), CLAP-style joint text/audio embeddings would
be the thing to revisit. They need a Python/ONNX runtime, not Ollama.

## Principles for extending this

- Deterministic, explainable signals come first; AI is additive and must fail
  safe to the deterministic result.
- Keep the provider interface narrow. No provider-specific types leak into
  ranking or planning code.
- Never make local AI a hard dependency of a core path.
