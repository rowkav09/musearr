'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Favourite = { id: string; name: string; playCount: number }
type TopTrack = { id: string; name: string; artistName: string; playCount: number }

type InsightSummary = {
  period: { startDate: string; endDate: string; timezone: string }
  playback: {
    reportedPlays: number
    estimatedListenedMs: number
    uniqueTracks: number
    uniqueArtists: number
    coverage: 'none' | 'exact' | 'observed' | 'mixed'
  }
  topArtists: Favourite[]
  allTime: {
    totalPlays: number
    playedTracks: number
    ratedTracks: number
    topArtists: Favourite[]
    topTracks: TopTrack[]
    topGenres: Favourite[]
  }
}

type ViewState = 'loading' | 'ready' | 'signed_out' | 'unavailable'

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}
function formatHours(ms: number): string {
  const hours = ms / 3_600_000
  return hours >= 1 ? `${formatNumber(Math.round(hours))}h` : `${Math.round(ms / 60_000)} min`
}

export function ListeningInsights() {
  const [view, setView] = useState<ViewState>('loading')
  const [summary, setSummary] = useState<InsightSummary | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('/api/v1/insights/listening?days=30', { signal: controller.signal })
        if (response.ok) {
          setSummary((await response.json()) as InsightSummary)
          setView('ready')
        } else if (response.status === 401) {
          setView('signed_out')
        } else {
          setView('unavailable')
        }
      } catch {
        if (!controller.signal.aborted) setView('unavailable')
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  if (view === 'loading') {
    return (
      <div className="connection-banner" aria-live="polite">
        <span className="status-dot" />
        <span>Loading your listening insights…</span>
      </div>
    )
  }
  if (view === 'signed_out') {
    return (
      <div className="empty-intelligence">
        <strong>Sign in to see your listening insights.</strong>
        <Link className="secondary-button" href="/login">
          Sign in
        </Link>
      </div>
    )
  }
  if (view === 'unavailable' || !summary) {
    return (
      <div className="connection-banner connection-banner--warning" role="status">
        <span className="status-dot status-dot--warning" />
        <span>Waiting for the local Musearr service.</span>
      </div>
    )
  }

  const { allTime, playback } = summary
  const hasPeriod = playback.reportedPlays > 0

  return (
    <div className="settings-panel">
      <div className="intelligence-grid">
        <Stat label="Total plays" value={formatNumber(allTime.totalPlays)} note="From your Plex play counts" />
        <Stat label="Tracks played" value={formatNumber(allTime.playedTracks)} note="At least one play" />
        <Stat label="Rated tracks" value={formatNumber(allTime.ratedTracks)} note="You gave these a rating" />
        <Stat
          label="Last 30 days"
          value={hasPeriod ? `${formatNumber(playback.reportedPlays)} plays` : '—'}
          note={hasPeriod ? formatHours(playback.estimatedListenedMs) + ' listened' : 'No new plays reported yet'}
        />
      </div>

      <div className="insights-columns">
        <InsightList title="Most played artists" items={allTime.topArtists} unit="plays" />
        <InsightList title="Top genres" items={allTime.topGenres} unit="plays" />
      </div>

      <div className="insights-block">
        <p className="eyebrow">MOST PLAYED TRACKS</p>
        {allTime.topTracks.length === 0 ? (
          <p className="field-hint">No play counts have been mirrored from Plex yet.</p>
        ) : (
          <ol className="recommendation-list">
            {allTime.topTracks.map((track, index) => (
              <li className="recommendation-row" key={track.id}>
                <span className="recommendation-rank">{String(index + 1).padStart(2, '0')}</span>
                <div className="recommendation-song">
                  <strong>{track.name}</strong>
                  <span>{track.artistName}</span>
                </div>
                <p>{formatNumber(track.playCount)} plays</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {!hasPeriod && (
        <p className="field-hint">
          Day-by-day trends and the “last 30 days” figures fill in as Plex reports new plays (or via a
          Plex webhook). The all-time numbers above come straight from the play counts already in your
          library.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function InsightList({ title, items, unit }: { title: string; items: Favourite[]; unit: string }) {
  return (
    <article className="insight-card">
      <p className="eyebrow">{title.toUpperCase()}</p>
      {items.length === 0 ? (
        <p className="insight-card__copy">Nothing to show yet.</p>
      ) : (
        <ol className="favourite-list">
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <small>
                {formatNumber(item.playCount)} {unit}
              </small>
            </li>
          ))}
        </ol>
      )}
    </article>
  )
}
