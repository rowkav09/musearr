import type { IdeaFilter } from '../playlist-ideas.js'
import type { LocalAiProvider } from './provider.js'

/**
 * Turns a free-text playlist request ("moody late-90s trip hop", "upbeat
 * workout stuff") into a concrete library filter, using the genres that
 * actually exist in the user's library. The model only ever picks from that
 * list and optional decades; anything it returns that isn't recognised is
 * dropped. Returns null when nothing usable came back.
 */

const SYSTEM_PROMPT =
  'You translate a listener\'s playlist request into filters over their existing music library. ' +
  'You are given the genres that exist in the library. Reply with ONLY a JSON object like ' +
  '{"genres":["Electronic"],"decades":[1990,2000]} using genres copied exactly from the list and ' +
  'decades as 4-digit years divisible by 10. Omit a key if you have nothing for it. No prose.'

export async function promptToPlaylistFilter(
  ai: LocalAiProvider,
  prompt: string,
  availableGenres: string[],
): Promise<IdeaFilter | null> {
  if (!ai.enabled) {
    return null
  }

  let raw: string
  try {
    raw = await ai.complete({
      system: SYSTEM_PROMPT,
      prompt: `Library genres: ${availableGenres.slice(0, 60).join(', ')}\nRequest: ${prompt}`,
      temperature: 0.2,
      maxTokens: 200,
    })
  } catch {
    return null
  }

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) {
    return null
  }
  let parsed: { genres?: unknown; decades?: unknown }
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }

  const known = new Map(availableGenres.map((genre) => [genre.toLocaleLowerCase(), genre]))
  const filters: IdeaFilter[] = []

  if (Array.isArray(parsed.genres)) {
    for (const value of parsed.genres) {
      const match = typeof value === 'string' ? known.get(value.trim().toLocaleLowerCase()) : undefined
      if (match) {
        filters.push({ kind: 'genre', genre: match })
      }
    }
  }
  if (Array.isArray(parsed.decades)) {
    for (const value of parsed.decades) {
      const decade = typeof value === 'number' ? Math.floor(value / 10) * 10 : Number.NaN
      if (Number.isInteger(decade) && decade >= 1900 && decade <= 2100) {
        filters.push({ kind: 'decade', decade })
      }
    }
  }

  if (filters.length === 0) {
    return null
  }
  return filters.length === 1 ? (filters[0] as IdeaFilter) : { kind: 'any', filters }
}
