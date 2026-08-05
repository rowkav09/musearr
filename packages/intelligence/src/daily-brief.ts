export const DAILY_BRIEF_ALGORITHM_VERSION = '2026-08-05.1'

export type DailyBriefCard = {
  kind: 'daily_mix' | 'favourite_artist' | 'favourite_genre' | 'library' | 'sync'
  title: string
  body: string
}

export type DailyBriefContent = {
  headline: string
  summary: string
  cards: DailyBriefCard[]
}

export type DailyBriefInput = {
  library: {
    trackCount: number
    albumCount: number
    newestAddedAt: string | null
  }
  listening: {
    totalPlayCount: number
    lastPlayedAt: string | null
  }
  favourites: {
    artists: Array<{ name: string; playCount: number }>
    genres: Array<{ name: string; playCount: number }>
  }
  sync: {
    status: 'not_started' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    lastCompletedAt: string | null
    errorSummary: string | null
  }
  dailyMix: Array<{
    trackTitle: string
    artistName: string
    summary: string
  }>
}

export function localDateInTimeZone(timezone: string, now: Date = new Date()): string {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const parts = new Map(values.map((value) => [value.type, value.value]))
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`
}

export function buildDailyBrief(input: DailyBriefInput): DailyBriefContent {
  if (input.library.trackCount === 0) {
    return {
      headline: 'Your music room is getting ready.',
      summary: 'Musearr will shape your first briefing once Plex has finished importing tracks and listening details.',
      cards: [syncCard(input)],
    }
  }

  const cards: DailyBriefCard[] = []
  const lead = input.dailyMix[0]
  if (lead) {
    cards.push({
      kind: 'daily_mix',
      title: `Start with ${lead.trackTitle}`,
      body: `${lead.artistName} — ${lead.summary}`,
    })
  }

  const favouriteArtist = input.favourites.artists[0]
  if (favouriteArtist) {
    cards.push({
      kind: 'favourite_artist',
      title: `${favouriteArtist.name} is still close`,
      body: `${formatNumber(favouriteArtist.playCount)} recorded plays make this your most-returned artist in the local Plex mirror.`,
    })
  }

  const favouriteGenre = input.favourites.genres[0]
  if (favouriteGenre) {
    cards.push({
      kind: 'favourite_genre',
      title: `Your listening leans toward ${favouriteGenre.name}`,
      body: `${formatNumber(favouriteGenre.playCount)} recorded plays are associated with this genre.`,
    })
  }

  if (input.library.newestAddedAt) {
    cards.push({
      kind: 'library',
      title: 'A collection worth revisiting',
      body: `${formatNumber(input.library.trackCount)} tracks across ${formatNumber(input.library.albumCount)} albums are available locally; the newest addition arrived ${formatDate(input.library.newestAddedAt)}.`,
    })
  }

  const sync = syncCard(input)

  return {
    headline: lead ? 'A thoughtful place to begin.' : 'Your music, in focus.',
    summary: lead
      ? `Today’s Daily Mix starts with ${lead.trackTitle} by ${lead.artistName}.`
      : `${formatNumber(input.library.trackCount)} tracks are ready to rediscover as Musearr gathers more listening context.`,
    cards: [...cards.slice(0, 3), sync],
  }
}

function syncCard(input: DailyBriefInput): DailyBriefCard {
  if (input.sync.status === 'failed') {
    return {
      kind: 'sync',
      title: 'Your Plex mirror needs attention',
      body: input.sync.errorSummary ?? 'The most recent library sync did not complete. Existing insights remain available locally.',
    }
  }
  if (input.sync.status === 'completed' && input.sync.lastCompletedAt) {
    return {
      kind: 'sync',
      title: 'Your local mirror is current',
      body: `The latest Plex sync completed ${formatDate(input.sync.lastCompletedAt)}.`,
    }
  }
  if (input.sync.status === 'running' || input.sync.status === 'queued') {
    return {
      kind: 'sync',
      title: 'Your library is updating',
      body: 'Musearr is refreshing its local mirror. This briefing only uses facts already stored on this device.',
    }
  }
  return {
    kind: 'sync',
    title: 'Waiting for a complete library sync',
    body: 'Musearr will make its next briefing more personal as Plex data arrives.',
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-GB').format(value)
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return 'recently'
  }
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(timestamp)
}
