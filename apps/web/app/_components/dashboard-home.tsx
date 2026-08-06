'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Recommendation = {
  runId: string
  createdAt: string
  trackTitle: string
  artistName: string
  albumTitle: string
  rank: number
  summary: string
}

type DashboardOverview = {
  library: {
    artistCount: number
    albumCount: number
    trackCount: number
    totalDurationMs: number
    newestAddedAt: string | null
  }
  listening: {
    totalPlayCount: number
    playedTrackCount: number
    ratedTrackCount: number
    lastPlayedAt: string | null
  }
  favourites: {
    artists: Array<{ id: string; name: string; playCount: number }>
    genres: Array<{ id: string; name: string; playCount: number }>
  }
  sync: {
    status: 'not_started' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    lastCompletedAt: string | null
    errorSummary: string | null
  }
  dailyMix: Recommendation[]
}

type DailyBrief = {
  id: string
  briefDate: string
  timezone: string
  content: {
    headline: string
    summary: string
    cards: Array<{
      kind: 'daily_mix' | 'favourite_artist' | 'favourite_genre' | 'library' | 'sync'
      title: string
      body: string
    }>
  }
  createdAt: string
  discordDelivery: {
    status: 'pending' | 'delivered' | 'failed'
    attemptCount: number
    lastAttemptAt: string | null
    deliveredAt: string | null
    errorSummary: string | null
  } | null
}

type ViewState = 'loading' | 'ready' | 'unconfigured' | 'signed_out' | 'unavailable'

const startingMixes = [
  {
    name: 'Night Bus Windows',
    artist: 'Cigarettes After Sex',
    note: 'Soft repetition and slow-blooming detail for late listening.',
    tone: 'violet',
  },
  {
    name: 'After the Rain',
    artist: 'Maya Delilah',
    note: 'Warm guitar tones with the soul and jazz textures you revisit.',
    tone: 'peach',
  },
  {
    name: 'Waterfalls',
    artist: 'Paul McCartney',
    note: 'A familiar voice with a patient, melodic pulse.',
    tone: 'gold',
  },
]

export function DashboardHome() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [dailyBrief, setDailyBrief] = useState<DailyBrief | null>(null)
  const [viewState, setViewState] = useState<ViewState>('loading')
  const [generationState, setGenerationState] = useState<'idle' | 'queueing' | 'queued' | 'failed'>('idle')
  const [briefGenerationState, setBriefGenerationState] = useState<'idle' | 'queueing' | 'queued' | 'failed'>('idle')

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      try {
        const dashboardRequest = fetch('/api/v1/dashboard', {
          signal: controller.signal,
        })
        const briefRequest = fetch('/api/v1/daily-briefs/latest', {
          signal: controller.signal,
        }).catch(() => null)
        const response = await dashboardRequest
        if (response.ok) {
          setOverview((await response.json()) as DashboardOverview)
          setViewState('ready')
          const briefResponse = await briefRequest
          if (briefResponse?.ok) {
            const payload = (await briefResponse.json()) as { brief: DailyBrief | null }
            setDailyBrief(payload.brief)
          }
          return
        }
        if (response.status !== 401) {
          setViewState('unavailable')
          return
        }

        const setupResponse = await fetch('/api/v1/setup/status', {
          signal: controller.signal,
        })
        const setup = setupResponse.ok ? ((await setupResponse.json()) as { phase?: string }) : null
        setViewState(setup?.phase === 'configured' ? 'signed_out' : 'unconfigured')
      } catch {
        if (!controller.signal.aborted) {
          setViewState('unavailable')
        }
      }
    }

    void loadDashboard()
    return () => controller.abort()
  }, [])

  async function generateDailyMix() {
    setGenerationState('queueing')
    try {
      const response = await fetch('/api/v1/recommendations/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'daily_mix', limit: 20 }),
      })
      if (!response.ok) {
        throw new Error('Musearr could not queue a Daily Mix.')
      }
      setGenerationState('queued')
    } catch {
      setGenerationState('failed')
    }
  }

  async function generateDailyBrief() {
    setBriefGenerationState('queueing')
    try {
      const response = await fetch('/api/v1/daily-briefs/generate', { method: 'POST' })
      if (!response.ok) {
        throw new Error('Musearr could not queue a daily briefing.')
      }
      setBriefGenerationState('queued')
    } catch {
      setBriefGenerationState('failed')
    }
  }

  if (viewState === 'loading') {
    return <DashboardLoading />
  }

  if (viewState === 'unconfigured') {
    return (
      <section className="dashboard-empty" aria-labelledby="setup-dashboard-title">
        <p className="eyebrow">WELCOME TO MUSEARR</p>
        <h1 id="setup-dashboard-title">Set up your private listening home</h1>
        <p>Connect your Plex server to turn your library and listening history into personal recommendations.</p>
        <Link className="primary-button" href="/setup">
          Begin setup
        </Link>
      </section>
    )
  }

  if (viewState === 'signed_out') {
    return (
      <section className="dashboard-empty" aria-labelledby="sign-in-dashboard-title">
        <p className="eyebrow">YOUR PRIVATE SPACE</p>
        <h1 id="sign-in-dashboard-title">Sign in to see your listening world</h1>
        <p>Your library, recommendations, and daily brief are kept behind your account.</p>
        <Link className="primary-button" href="/login">
          Sign in
        </Link>
      </section>
    )
  }

  if (viewState === 'unavailable' || !overview) {
    return (
      <section className="dashboard-empty" aria-labelledby="unavailable-dashboard-title">
        <p className="eyebrow">DASHBOARD UNAVAILABLE</p>
        <h1 id="unavailable-dashboard-title">Your listening home is taking a moment</h1>
        <p>Refresh this page to try again. Your Plex library and recommendations remain private.</p>
      </section>
    )
  }

  return (
    <>
      <section className="hero-panel" aria-labelledby="dashboard-title">
        <div className="hero-panel__copy">
          <p className="eyebrow">GOOD MORNING</p>
          <h1 id="dashboard-title">A little more of what moves you.</h1>
          <p>
            {overview.library.trackCount > 0
              ? `${formatNumber(overview.library.trackCount)} tracks from ${formatNumber(overview.library.artistCount)} artists are ready to rediscover.`
              : 'Your first Plex sync is under way. This view will become personal as soon as tracks arrive.'}
          </p>
          <button
            className="primary-button"
            disabled={generationState === 'queueing'}
            onClick={generateDailyMix}
            type="button"
          >
            {generationState === 'queueing'
              ? 'Preparing your mix…'
              : generationState === 'queued'
                ? 'Daily Mix queued'
                : 'Generate Daily Mix'}
          </button>
          {generationState === 'failed' ? <p className="action-error">Your Daily Mix could not be queued. Try again.</p> : null}
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="hero-art__sun" />
          <span className="hero-art__arc hero-art__arc--one" />
          <span className="hero-art__arc hero-art__arc--two" />
          <span className="hero-art__orb hero-art__orb--one" />
          <span className="hero-art__orb hero-art__orb--two" />
          <span className="hero-art__line" />
        </div>
      </section>

      <section className="section-block" aria-labelledby="daily-mix-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TODAY’S MIX</p>
            <h2 id="daily-mix-title">Made from your library</h2>
          </div>
          {overview.dailyMix.length > 0 ? <span className="quiet-label">Updated today</span> : null}
        </div>
        {overview.dailyMix.length > 0 ? (
          <div className="mix-grid">
            {overview.dailyMix.slice(0, 3).map((recommendation, index) => (
              <article className={`mix-card mix-card--${startingMixes[index]?.tone ?? 'violet'}`} key={recommendation.runId}>
                <span className="mix-card__number">0{index + 1}</span>
                <div>
                  <h3>{recommendation.trackTitle}</h3>
                  <p>{recommendation.artistName}</p>
                </div>
                <p className="mix-card__reason">{recommendation.summary}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-intelligence">
            <strong>No Daily Mix has been saved yet.</strong>
            <span>Generate one after your library sync finishes. Every track will include a factual reason.</span>
          </div>
        )}
      </section>

      <DailyBriefPanel brief={dailyBrief} generationState={briefGenerationState} onGenerate={generateDailyBrief} />

      <section className="dashboard-split" aria-label="Favourite artists, genres, and sync status">
        <InsightCard
          eyebrow="FAVOURITE ARTISTS"
          title="Who you return to"
          values={overview.favourites.artists}
          empty="Play data from Plex will reveal your familiar artists here."
        />
        <InsightCard
          eyebrow="FAVOURITE GENRES"
          title="Your current texture"
          values={overview.favourites.genres}
          empty="Genre signals will appear as you listen through your library."
          tone="violet"
        />
        <SyncStateCard sync={overview.sync} />
      </section>
    </>
  )
}

function SyncStateCard({ sync }: { sync: DashboardOverview['sync'] }) {
  const isActive = sync.status === 'queued' || sync.status === 'running'
  const isFailure = sync.status === 'failed'

  return (
    <article
      className={`insight-card insight-card--green sync-state-card sync-state-card--${sync.status}`}
      aria-live={isActive || isFailure ? 'polite' : undefined}
    >
      <div className="sync-state-card__heading">
        <p className="eyebrow">LIBRARY CARE</p>
        <span className="sync-state-badge">{syncStatusLabel(sync.status)}</span>
      </div>
      <h2>{syncHeading(sync.status)}</h2>
      <p className="insight-card__copy">{syncSummary(sync)}</p>
      {sync.lastCompletedAt ? (
        <p className="sync-state-card__timestamp">Last completed {formatDate(sync.lastCompletedAt)}</p>
      ) : null}
    </article>
  )
}

function syncStatusLabel(status: DashboardOverview['sync']['status']): string {
  switch (status) {
    case 'not_started':
      return 'Not started'
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Syncing'
    case 'completed':
      return 'Up to date'
    case 'failed':
      return 'Needs attention'
    case 'cancelled':
      return 'Cancelled'
  }
}

function syncSummary(sync: DashboardOverview['sync']): string {
  if (sync.status === 'failed') {
    return sync.errorSummary ?? 'The last library sync did not finish. Check your Plex connection, then use the existing sync control to try again.'
  }

  switch (sync.status) {
    case 'queued':
      return 'Your library sync is waiting to start. This dashboard will refresh when it finishes.'
    case 'running':
      return 'Your library is being reconciled now. Keep this page open or return later for refreshed results.'
    case 'completed':
      return sync.lastCompletedAt
        ? 'Your library mirror is current. Scheduled reconciliation keeps it fresh.'
        : 'Your library mirror is current.'
    case 'cancelled':
      return 'The last library sync was cancelled. Use the existing sync control when you are ready to run it again.'
    case 'not_started':
      return 'No library sync has started yet. Your library and listening insights will appear after the first sync.'
    case 'failed':
      return sync.errorSummary ?? 'The last library sync did not finish.'
  }
}

function DailyBriefPanel({
  brief,
  generationState,
  onGenerate,
}: {
  brief: DailyBrief | null
  generationState: 'idle' | 'queueing' | 'queued' | 'failed'
  onGenerate: () => void
}) {
  return (
    <section className="section-block" aria-labelledby="daily-brief-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DAILY INTELLIGENCE</p>
          <h2 id="daily-brief-title">Your private morning note</h2>
        </div>
        {brief ? <span className="quiet-label">Prepared {formatDate(brief.createdAt)}</span> : null}
      </div>
      {brief ? (
        <article className="daily-brief-card">
          <div className="daily-brief-card__intro">
            <div>
              <h3>{brief.content.headline}</h3>
              <p>{brief.content.summary}</p>
            </div>
            <span className={`delivery-state delivery-state--${brief.discordDelivery?.status ?? 'local'}`}>
              {deliveryLabel(brief.discordDelivery)}
            </span>
          </div>
          <div className="daily-brief-card__items">
            {brief.content.cards.map((card) => (
              <article className="daily-brief-item" key={`${card.kind}-${card.title}`}>
                <span className="daily-brief-item__kind">{briefCardLabel(card.kind)}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </article>
      ) : (
        <div className="empty-intelligence">
          <strong>No daily briefing has been prepared yet.</strong>
          <span>Generate one from your synced library whenever you want a private listening note.</span>
          <button
            className="secondary-button"
            disabled={generationState === 'queueing'}
            onClick={onGenerate}
            type="button"
          >
            {generationState === 'queueing'
              ? 'Preparing your note…'
              : generationState === 'queued'
                ? 'Brief queued'
                : 'Generate daily brief'}
          </button>
          {generationState === 'failed' ? <p className="action-error">Your daily brief could not be queued. Try again.</p> : null}
        </div>
      )}
    </section>
  )
}

function InsightCard({
  eyebrow,
  title,
  values,
  empty,
  tone = 'sand',
}: {
  eyebrow: string
  title: string
  values: Array<{ id: string; name: string; playCount: number }>
  empty: string
  tone?: 'sand' | 'violet'
}) {
  return (
    <article className={`insight-card insight-card--${tone}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {values.length > 0 ? (
        <ul className="favourite-list">
          {values.slice(0, 4).map((value) => (
            <li key={value.id}>
              <span>{value.name}</span>
              <small>{formatNumber(value.playCount)} plays</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="insight-card__copy">{empty}</p>
      )}
    </article>
  )
}

function DashboardLoading() {
  return (
    <div className="dashboard-loading" aria-live="polite">
      <span className="loading-mark" aria-hidden="true" />
      <p>Opening your listening home…</p>
    </div>
  )
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-GB').format(value)
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function syncHeading(status: DashboardOverview['sync']['status']): string {
  switch (status) {
    case 'completed':
      return 'Library is in sync'
    case 'running':
      return 'Syncing your library'
    case 'queued':
      return 'Sync is queued'
    case 'failed':
      return 'Sync needs attention'
    case 'cancelled':
      return 'Sync was cancelled'
    case 'not_started':
      return 'First sync is waiting'
  }
}

function deliveryLabel(delivery: DailyBrief['discordDelivery']): string {
  if (!delivery) return 'Saved locally'
  if (delivery.status === 'delivered') return 'Discord delivered'
  if (delivery.status === 'failed') return 'Discord needs attention'
  return 'Discord delivery pending'
}

function briefCardLabel(kind: DailyBrief['content']['cards'][number]['kind']): string {
  switch (kind) {
    case 'daily_mix':
      return 'START HERE'
    case 'favourite_artist':
      return 'FAVOURITE ARTIST'
    case 'favourite_genre':
      return 'FAVOURITE GENRE'
    case 'library':
      return 'YOUR LIBRARY'
    case 'sync':
      return 'SYSTEM STATUS'
  }
}
