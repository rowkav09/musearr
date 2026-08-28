import type { LocalAiProvider } from './provider.js'

/**
 * Optional AI rewriting of a recommendation's one-line reason.
 *
 * The deterministic ranker (`ranking.ts`) always produces the score, the ordered
 * structured `reasons`, and a factual `summary` sentence. This module only
 * rephrases that sentence into warmer prose, grounded in the same facts, when
 * Local AI is enabled. Every failure mode — disabled provider, model error,
 * empty or multi-sentence or over-long output — keeps the deterministic
 * sentence, so the explanation never becomes something the ranker did not say.
 */

export const REASON_PHRASING_MAX_CHARS = 220

export type SummaryPhrasing = 'deterministic' | 'local_ai'

export type PhrasableRecommendation = {
  trackTitle: string
  artistName: string
  albumTitle: string
  kind: string
  /** The deterministic sentence; also the fallback. */
  summary: string
  /** Structured reason codes from the ranker, passed as grounding only. */
  reasons: unknown[]
}

export type PhrasedSummary = {
  summary: string
  phrasing: SummaryPhrasing
}

const SYSTEM_PROMPT =
  'You rewrite one factual note about why a song suits a listener into a single warm, natural sentence ' +
  'for a personal music dashboard. Rules: keep every fact from the note and add none; write for the ' +
  'listener in second person; never mention playlists, lists, "signals", scores, algorithms, or this ' +
  'app; no preamble, no quotation marks, no lists; exactly one sentence, under 28 words. Return only ' +
  'the sentence.'

/** Human-readable hints for the ranker's reason codes, so the model never echoes a raw code. */
const REASON_HINTS: Record<string, string> = {
  FAVOURITE_ARTIST: 'an artist they play often',
  FAVOURITE_GENRE: 'a genre they gravitate to',
  FORGOTTEN_FAVOURITE: 'something they loved but have not played in a long time',
  HIGH_RATING: 'a track they rated highly',
  RECENTLY_ADDED: 'a recent addition to their library',
  UNDERPLAYED: 'a track they have barely played',
  UNHEARD: 'a track they have never played',
  WELL_LOVED: 'a track they have played a lot',
}

export async function phraseRecommendationSummaries<T extends PhrasableRecommendation>(
  ai: LocalAiProvider,
  items: T[],
  options: { maxItems?: number } = {},
): Promise<PhrasedSummary[]> {
  if (!ai.enabled) {
    return items.map((item) => ({ summary: item.summary, phrasing: 'deterministic' }))
  }

  const limit = Math.max(0, Math.min(options.maxItems ?? items.length, items.length))
  const results: PhrasedSummary[] = []

  for (const [index, item] of items.entries()) {
    if (index >= limit) {
      results.push({ summary: item.summary, phrasing: 'deterministic' })
      continue
    }

    let raw: string
    try {
      raw = await ai.complete({
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(item),
        temperature: 0.4,
        maxTokens: 120,
      })
    } catch {
      results.push({ summary: item.summary, phrasing: 'deterministic' })
      continue
    }

    const cleaned = sanitisePhrase(raw)
    results.push(
      cleaned && cleaned !== item.summary
        ? { summary: cleaned, phrasing: 'local_ai' }
        : { summary: item.summary, phrasing: 'deterministic' },
    )
  }

  return results
}

function buildPrompt(item: PhrasableRecommendation): string {
  const hints = item.reasons
    .map((reason) =>
      reason && typeof reason === 'object' && 'code' in reason
        ? REASON_HINTS[String((reason as { code: unknown }).code)]
        : undefined,
    )
    .filter((hint): hint is string => Boolean(hint))

  return [
    `Song: "${item.trackTitle}" by ${item.artistName}.`,
    hints.length > 0 ? `Why it suits them: ${hints.join('; ')}.` : null,
    `Note to rewrite: ${item.summary}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

/** Returns a usable one-sentence phrase, or null to fall back to the deterministic one. */
function sanitisePhrase(raw: string): string | null {
  let text = raw.trim()
  if (text.includes('\n')) {
    // Models sometimes add a preamble line then the sentence, or a bulleted list.
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length !== 1) {
      return null
    }
    text = lines[0] as string
  }

  // Strip a single pair of wrapping quotes.
  const wrapped = /^["'“”‘’](.+)["'“”‘’]$/.exec(text)
  if (wrapped?.[1]) {
    text = wrapped[1].trim()
  }

  if (text.length < 8 || text.length > REASON_PHRASING_MAX_CHARS) {
    return null
  }
  // One sentence: at most one terminal punctuation mark, not mid-string.
  const interior = text.slice(0, -1)
  if (/[.!?]\s/.test(interior)) {
    return null
  }
  return text
}
