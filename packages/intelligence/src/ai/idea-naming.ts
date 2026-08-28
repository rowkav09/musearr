import type { PlaylistIdea } from '../playlist-ideas.js'
import type { LocalAiProvider } from './provider.js'

/**
 * Optional AI pass that gives a deterministic playlist idea a nicer name. The
 * rationale (which carries the real counts) is never touched, and any failure
 * keeps the deterministic name, so the numbers a user sees are always the
 * scanner's.
 */

const SYSTEM_PROMPT =
  'You name music playlists. Given a plain description of a group of songs, reply with ONLY a short, ' +
  'evocative playlist name (2-4 words, no quotes, no emoji, Title Case). Nothing else.'

const MAX_NAME_CHARS = 40

export async function namePlaylistIdeas<T extends PlaylistIdea>(
  ai: LocalAiProvider,
  ideas: T[],
): Promise<T[]> {
  if (!ai.enabled) {
    return ideas
  }

  const named: T[] = []
  for (const idea of ideas) {
    let raw: string
    try {
      raw = await ai.complete({
        system: SYSTEM_PROMPT,
        prompt: `Songs: ${idea.rationale}\nCurrent name: ${idea.name}\nSuggest a better name.`,
        temperature: 0.7,
        maxTokens: 24,
      })
    } catch {
      named.push(idea)
      continue
    }
    const clean = sanitiseName(raw)
    named.push(clean ? { ...idea, name: clean } : idea)
  }
  return named
}

function sanitiseName(raw: string): string | null {
  let text = raw.trim().split('\n')[0]?.trim() ?? ''
  const quoted = /^["'“”](.+)["'“”]$/.exec(text)
  if (quoted?.[1]) text = quoted[1].trim()
  text = text.replace(/[.!]+$/, '').trim()
  if (text.length < 3 || text.length > MAX_NAME_CHARS || text.split(/\s+/).length > 6) {
    return null
  }
  return text
}
