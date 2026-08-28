/**
 * Deterministic "add more tracks like these" proposal for an existing playlist.
 *
 * Given the tracks already on a playlist (the basis) and the library mirror, it
 * scores library tracks that are NOT already on the playlist by how well they
 * fit the basis's artist / genre / era character, and returns an ordered
 * shortlist of additions. It never suggests removing or reordering anything.
 *
 * Pure and free of randomness: the same inputs always yield the same proposal.
 */

export const CURATION_ALGORITHM_VERSION = '2026-08-28.1'

export type CurationLibraryTrack = {
  trackId: string
  plexRatingKey: string
  artistId: string
  artistName: string
  albumId: string
  albumTitle: string
  trackTitle: string
  genres: string[]
  year: number | null
  rating: number | null
  playCount: number
}

export type CurationReasonCode =
  | 'PLAYLIST_ARTIST'
  | 'PLAYLIST_GENRE'
  | 'PLAYLIST_ERA'
  | 'HIGH_RATING'
  | 'FAMILIAR'
  | 'FRESH'

export type CurationReason = {
  code: CurationReasonCode
  weight: number
  facts: Record<string, string | number>
}

export type CurationProposalItem = {
  trackId: string
  plexRatingKey: string
  artistName: string
  trackTitle: string
  score: number
  reasons: CurationReason[]
}

export type CurationProposal = {
  algorithmVersion: string
  basisTrackCount: number
  items: CurationProposalItem[]
}

export type ProposeCurationOptions = {
  limit?: number
  /** Deterministic shortlist depth handed to an optional AI re-rank. */
  shortlistFactor?: number
}

const DEFAULT_LIMIT = 20
const MAX_PER_ARTIST = 2

type Profile = {
  artistWeights: Map<string, number>
  genreWeights: Map<string, number>
  decadeWeights: Map<number, number>
  topGenres: string[]
  topDecades: number[]
}

export function proposeCurationAdditions(
  basis: CurationLibraryTrack[],
  library: CurationLibraryTrack[],
  options: ProposeCurationOptions = {},
): CurationProposal {
  const limit = clampInt(options.limit ?? DEFAULT_LIMIT, 1, 100)
  const basisIds = new Set(basis.map((track) => track.trackId))
  const profile = buildProfile(basis)
  const maxPlayCount = Math.max(1, ...library.map((track) => track.playCount))

  const scored = library
    .filter((track) => !basisIds.has(track.trackId))
    .map((track) => scoreCandidate(track, profile, maxPlayCount))
    .filter((entry): entry is ScoredCandidate => entry !== null)
    .sort(
      (left, right) =>
        right.item.score - left.item.score || left.item.trackId.localeCompare(right.item.trackId),
    )

  const depth = Math.max(limit, Math.round(limit * (options.shortlistFactor ?? 1)))
  const items = diversify(scored, depth).map((entry) => entry.item)

  return {
    algorithmVersion: CURATION_ALGORITHM_VERSION,
    basisTrackCount: basis.length,
    items: items.slice(0, depth),
  }
}

type ScoredCandidate = { item: CurationProposalItem; artistId: string }

function buildProfile(basis: CurationLibraryTrack[]): Profile {
  const artistCounts = new Map<string, number>()
  const genreCounts = new Map<string, number>()
  const decadeCounts = new Map<number, number>()

  for (const track of basis) {
    artistCounts.set(track.artistId, (artistCounts.get(track.artistId) ?? 0) + 1)
    for (const genre of track.genres.map(normaliseGenre).filter(Boolean)) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1)
    }
    const decade = decadeOf(track.year)
    if (decade !== null) {
      decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1)
    }
  }

  const total = Math.max(1, basis.length)
  return {
    artistWeights: ratio(artistCounts, total),
    genreWeights: ratio(genreCounts, total),
    decadeWeights: ratio(decadeCounts, total),
    topGenres: topKeys(genreCounts, 5),
    topDecades: topKeys(decadeCounts, 2),
  }
}

function scoreCandidate(
  track: CurationLibraryTrack,
  profile: Profile,
  maxPlayCount: number,
): ScoredCandidate | null {
  const trackGenres = track.genres.map(normaliseGenre).filter(Boolean)
  const genreSignal = Math.max(
    0,
    ...trackGenres.map((genre) => profile.genreWeights.get(genre) ?? 0),
  )
  const artistSignal = clamp(profile.artistWeights.get(track.artistId) ?? 0, 0, 1)
  const decade = decadeOf(track.year)
  const eraSignal = decade === null ? 0 : clamp(profile.decadeWeights.get(decade) ?? 0, 0, 1)
  const ratingSignal = track.rating === null ? 0.5 : clamp(track.rating / 10, 0, 1)
  const playSignal = clamp(Math.log1p(Math.max(0, track.playCount)) / Math.log1p(maxPlayCount), 0, 1)
  const familiarBlend = track.playCount === 0 ? 0.5 : playSignal

  if (artistSignal === 0 && genreSignal === 0) {
    // No shared artist and no shared genre: nothing ties this track to the
    // playlist's character, so leave it out rather than guess.
    return null
  }

  const score = round(
    clamp(
      genreSignal * 0.4 + artistSignal * 0.25 + eraSignal * 0.12 + ratingSignal * 0.13 + familiarBlend * 0.1,
      0,
      1,
    ),
  )

  const reasons: CurationReason[] = []
  if (artistSignal > 0) {
    reasons.push({
      code: 'PLAYLIST_ARTIST',
      weight: round(artistSignal),
      facts: { artist: track.artistName },
    })
  }
  const sharedGenre = trackGenres.find((genre) => profile.topGenres.includes(genre))
  if (sharedGenre) {
    reasons.push({
      code: 'PLAYLIST_GENRE',
      weight: round(genreSignal),
      facts: { genre: sharedGenre },
    })
  }
  if (decade !== null && profile.topDecades.includes(decade)) {
    reasons.push({ code: 'PLAYLIST_ERA', weight: round(eraSignal || 0.5), facts: { decade: `${decade}s` } })
  }
  if ((track.rating ?? 0) >= 8) {
    reasons.push({ code: 'HIGH_RATING', weight: ratingSignal, facts: { rating: track.rating as number } })
  }
  reasons.push(
    track.playCount > 0
      ? { code: 'FAMILIAR', weight: round(playSignal), facts: { playCount: track.playCount } }
      : { code: 'FRESH', weight: 1, facts: {} },
  )

  return {
    artistId: track.artistId,
    item: {
      trackId: track.trackId,
      plexRatingKey: track.plexRatingKey,
      artistName: track.artistName,
      trackTitle: track.trackTitle,
      score,
      reasons: reasons.slice(0, 3),
    },
  }
}

function diversify(scored: ScoredCandidate[], limit: number): ScoredCandidate[] {
  const selected: ScoredCandidate[] = []
  const perArtist = new Map<string, number>()
  for (const candidate of scored) {
    if (selected.length >= limit) {
      break
    }
    const count = perArtist.get(candidate.artistId) ?? 0
    if (count >= MAX_PER_ARTIST) {
      continue
    }
    selected.push(candidate)
    perArtist.set(candidate.artistId, count + 1)
  }
  return selected
}

function ratio<K>(counts: Map<K, number>, total: number): Map<K, number> {
  return new Map([...counts.entries()].map(([key, value]) => [key, value / total]))
}

function topKeys<K>(counts: Map<K, number>, n: number): K[] {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, n)
    .map(([key]) => key)
}

function decadeOf(year: number | null): number | null {
  if (year === null || !Number.isFinite(year) || year < 1900 || year > 2100) {
    return null
  }
  return Math.floor(year / 10) * 10
}

function normaliseGenre(genre: string): string {
  return genre.trim().toLocaleLowerCase()
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
