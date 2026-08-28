/**
 * Deterministic "playlists you don't have yet" scan.
 *
 * Given the library mirror and the set of tracks already on some playlist, it
 * looks for sizeable, coherent groups that are under-represented on playlists
 * and proposes them as new playlist concepts. Each idea carries a machine
 * filter so it can later be counted again or materialised into a real playlist.
 *
 * Pure and free of randomness.
 */

export const PLAYLIST_IDEAS_ALGORITHM_VERSION = '2026-08-28.1'

export type IdeaLibraryTrack = {
  trackId: string
  artistId: string
  artistName: string
  genres: string[]
  year: number | null
  rating: number | null
  playCount: number
}

export type IdeaFilter =
  | { kind: 'genre'; genre: string }
  | { kind: 'decade'; decade: number }
  | { kind: 'artist'; artistId: string; artistName: string }
  | { kind: 'unplaylisted_favourites' }
  | { kind: 'unplayed_additions' }
  | { kind: 'any'; filters: IdeaFilter[] }

export type PlaylistIdea = {
  name: string
  rationale: string
  kind: IdeaFilter['kind']
  filter: IdeaFilter
  libraryTrackCount: number
  coveredTrackCount: number
  coverageRatio: number
  score: number
}

export type ProposePlaylistIdeasOptions = {
  limit?: number
  /** Ignore groups smaller than this. */
  minGroupSize?: number
}

const DEFAULT_LIMIT = 12
const DEFAULT_MIN_GROUP = 12

export function ideaMatchesTrack(track: IdeaLibraryTrack, filter: IdeaFilter): boolean {
  switch (filter.kind) {
    case 'genre':
      return track.genres.some((genre) => normalise(genre) === normalise(filter.genre))
    case 'decade':
      return decadeOf(track.year) === filter.decade
    case 'artist':
      return track.artistId === filter.artistId
    case 'unplaylisted_favourites':
      return (track.rating ?? 0) >= 8
    case 'unplayed_additions':
      return track.playCount === 0
    case 'any':
      return filter.filters.some((inner) => ideaMatchesTrack(track, inner))
  }
}

export function proposePlaylistIdeas(
  tracks: IdeaLibraryTrack[],
  playlistedTrackIds: Set<string>,
  options: ProposePlaylistIdeasOptions = {},
): PlaylistIdea[] {
  const limit = clampInt(options.limit ?? DEFAULT_LIMIT, 1, 50)
  const minGroup = clampInt(options.minGroupSize ?? DEFAULT_MIN_GROUP, 3, 1_000)
  const isCovered = (track: IdeaLibraryTrack) => playlistedTrackIds.has(track.trackId)

  const ideas: PlaylistIdea[] = []

  // Genres
  for (const [key, group] of groupBy(tracks, (track) => track.genres.map(normalise)).entries()) {
    if (group.length < minGroup) continue
    const covered = group.filter(isCovered).length
    ideas.push(
      makeIdea(
        `${titleCase(key)} mix`,
        `${group.length} ${titleCase(key)} tracks in your library, ${pct(covered, group.length)} of them on a playlist.`,
        'genre',
        { kind: 'genre', genre: key },
        group.length,
        covered,
      ),
    )
  }

  // Decades
  for (const [decade, group] of groupBy(tracks, (track) => {
    const d = decadeOf(track.year)
    return d === null ? [] : [String(d)]
  }).entries()) {
    if (group.length < minGroup) continue
    const covered = group.filter(isCovered).length
    ideas.push(
      makeIdea(
        `The ${decade}s`,
        `${group.length} tracks from the ${decade}s, ${pct(covered, group.length)} already on a playlist.`,
        'decade',
        { kind: 'decade', decade: Number(decade) },
        group.length,
        covered,
      ),
    )
  }

  // Deep artist catalogues that are barely playlisted
  for (const [artistId, group] of groupBy(tracks, (track) => [track.artistId]).entries()) {
    if (group.length < Math.max(minGroup, 15)) continue
    const covered = group.filter(isCovered).length
    if (covered / group.length > 0.4) continue
    ideas.push(
      makeIdea(
        `${group[0]?.artistName ?? 'Artist'} deep cuts`,
        `${group.length} ${group[0]?.artistName ?? 'this artist'} tracks, only ${pct(covered, group.length)} on a playlist.`,
        'artist',
        { kind: 'artist', artistId, artistName: group[0]?.artistName ?? 'Artist' },
        group.length,
        covered,
      ),
    )
  }

  // Cross-cutting: highly rated but unplaylisted
  const favourites = tracks.filter((track) => (track.rating ?? 0) >= 8)
  if (favourites.length >= minGroup) {
    const covered = favourites.filter(isCovered).length
    ideas.push(
      makeIdea(
        'Favourites not on a playlist',
        `${favourites.length} tracks you rated 8+, ${pct(covered, favourites.length)} of them already collected.`,
        'unplaylisted_favourites',
        { kind: 'unplaylisted_favourites' },
        favourites.length,
        covered,
      ),
    )
  }

  // Cross-cutting: in the library but never played
  const unplayed = tracks.filter((track) => track.playCount === 0)
  if (unplayed.length >= minGroup) {
    const covered = unplayed.filter(isCovered).length
    ideas.push(
      makeIdea(
        'Never played',
        `${unplayed.length} tracks you have not played yet, ${pct(covered, unplayed.length)} on a playlist.`,
        'unplayed_additions',
        { kind: 'unplayed_additions' },
        unplayed.length,
        covered,
      ),
    )
  }

  return ideas
    .filter((idea) => idea.coverageRatio < 0.85)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, limit)
}

function makeIdea(
  name: string,
  rationale: string,
  kind: IdeaFilter['kind'],
  filter: IdeaFilter,
  libraryTrackCount: number,
  coveredTrackCount: number,
): PlaylistIdea {
  const coverageRatio = libraryTrackCount === 0 ? 0 : coveredTrackCount / libraryTrackCount
  // Reward large groups that are poorly covered; a log keeps a huge genre from
  // swamping every more specific idea.
  const score = round(Math.log10(libraryTrackCount + 1) * (1 - coverageRatio))
  return {
    name,
    rationale,
    kind,
    filter,
    libraryTrackCount,
    coveredTrackCount,
    coverageRatio: round(coverageRatio),
    score,
  }
}

function groupBy<T>(items: T[], keysOf: (item: T) => string[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    for (const key of keysOf(item)) {
      if (!key) continue
      const bucket = map.get(key)
      if (bucket) bucket.push(item)
      else map.set(key, [item])
    }
  }
  return map
}

function decadeOf(year: number | null): number | null {
  if (year === null || !Number.isFinite(year) || year < 1900 || year > 2100) return null
  return Math.floor(year / 10) * 10
}

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toLocaleUpperCase())
}

function pct(part: number, whole: number): string {
  return whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
