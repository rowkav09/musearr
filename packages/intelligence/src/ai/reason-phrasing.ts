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
  'You rewrite a factual note about why a song was recommended into ONE warm, natural sentence for a ' +
  'personal music dashboard. Rules: use ONLY the facts given; never invent play counts, dates, ratings, ' +
  'genres, or opinions; no lists; no preamble or quotation marks; one sentence; keep it under 30 words. ' +
  'If you cannot improve on the given sentence, return it unchanged.'

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
  const codes = item.reasons
    .map((reason) =>
      reason && typeof reason === 'object' && 'code' in reason
        ? String((reason as { code: unknown }).code)
        : null,
    )
    .filter((code): code is string => Boolean(code))

  return [
    `Track: "${item.trackTitle}" by ${item.artistName}`,
    `Album: ${item.albumTitle}`,
    `List: ${item.kind}`,
    codes.length > 0 ? `Signals: ${codes.join(', ')}` : null,
    `Factual note: ${item.summary}`,
    'Rewrite the factual note as one sentence.',
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
