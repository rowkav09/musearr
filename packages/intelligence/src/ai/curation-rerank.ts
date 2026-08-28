import type { CurationProposalItem } from '../curation.js'
import type { LocalAiProvider } from './provider.js'

/**
 * Optional AI re-rank of a deterministic curation shortlist.
 *
 * The deterministic scorer produces an ordered shortlist of additions. When
 * Local AI is enabled, the model may reorder that shortlist (and drop weaker
 * entries) for a playlist described by its dominant artists and genres. It can
 * only ever choose from the shortlist it is given — it cannot introduce a track.
 * Any failure (disabled, unreachable, unparseable, empty pick) keeps the
 * deterministic order.
 */

const SYSTEM_PROMPT =
  'You curate music playlists. Given a playlist description and a numbered shortlist of candidate ' +
  'additions, choose which candidates best fit and in what order. Reply with ONLY a JSON array of the ' +
  'candidate numbers, best first, no duplicates, no prose. Choose from the given numbers only.'

export type CurationRerankInput = {
  playlistName: string
  topArtists: string[]
  topGenres: string[]
  shortlist: CurationProposalItem[]
  limit: number
}

export type CurationRerankResult = {
  items: CurationProposalItem[]
  aiUsed: boolean
}

export async function rerankCurationWithAi(
  ai: LocalAiProvider,
  input: CurationRerankInput,
): Promise<CurationRerankResult> {
  const deterministic = input.shortlist.slice(0, input.limit)
  if (!ai.enabled || input.shortlist.length <= 1) {
    return { items: deterministic, aiUsed: false }
  }

  let raw: string
  try {
    raw = await ai.complete({
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input),
      temperature: 0.2,
      maxTokens: 256,
    })
  } catch {
    return { items: deterministic, aiUsed: false }
  }

  const order = parseNumberArray(raw, input.shortlist.length)
  if (order.length === 0) {
    return { items: deterministic, aiUsed: false }
  }

  const picked: CurationProposalItem[] = []
  const seen = new Set<number>()
  for (const oneBased of order) {
    const index = oneBased - 1
    if (index >= 0 && index < input.shortlist.length && !seen.has(index)) {
      seen.add(index)
      picked.push(input.shortlist[index] as CurationProposalItem)
    }
    if (picked.length >= input.limit) {
      break
    }
  }
  if (picked.length === 0) {
    return { items: deterministic, aiUsed: false }
  }

  // Top up from the deterministic order if the model returned fewer than asked.
  for (const [index, item] of input.shortlist.entries()) {
    if (picked.length >= input.limit) {
      break
    }
    if (!seen.has(index)) {
      seen.add(index)
      picked.push(item)
    }
  }

  return { items: picked.slice(0, input.limit), aiUsed: true }
}

function buildPrompt(input: CurationRerankInput): string {
  const character: string[] = []
  if (input.topArtists.length > 0) {
    character.push(`Artists: ${input.topArtists.join(', ')}`)
  }
  if (input.topGenres.length > 0) {
    character.push(`Genres: ${input.topGenres.join(', ')}`)
  }
  const shortlist = input.shortlist
    .map((item, index) => `${index + 1}. ${item.artistName} — ${item.trackTitle}`)
    .join('\n')
  return [
    `Playlist: "${input.playlistName}"`,
    character.length > 0 ? character.join('\n') : 'Character: mixed',
    '',
    'Candidate additions:',
    shortlist,
    '',
    `Choose up to ${input.limit}, best fit first.`,
  ].join('\n')
}

function parseNumberArray(raw: string, max: number): number[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end <= start) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed
    .map((value) => (typeof value === 'number' ? Math.floor(value) : Number.parseInt(String(value), 10)))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= max)
}
