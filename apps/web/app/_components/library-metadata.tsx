'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type LibraryHealth = {
  totals: { artists: number; albums: number; tracks: number; playlists: number; genres: number }
  gaps: {
    tracksMissingYear: number
    tracksMissingGenre: number
    tracksMissingDuration: number
    albumsMissingYear: number
    unresolvedPlaylistItems: number
  }
  playlistsWithUnresolved: Array<{ name: string; unresolved: number }>
}

type ViewState = 'loading' | 'ready' | 'signed_out' | 'unavailable'

function n(value: number): string {
  return new Intl.NumberFormat().format(value)
}

export function LibraryMetadata() {
  const [view, setView] = useState<ViewState>('loading')
  const [health, setHealth] = useState<LibraryHealth | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('/api/v1/metadata/health', { signal: controller.signal })
        if (response.ok) {
          setHealth((await response.json()) as LibraryHealth)
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
        <span>Checking your library metadata…</span>
      </div>
    )
  }
  if (view === 'signed_out') {
    return (
      <div className="empty-intelligence">
        <strong>Sign in to view library metadata.</strong>
        <Link className="secondary-button" href="/login">
          Sign in
        </Link>
      </div>
    )
  }
  if (view === 'unavailable' || !health) {
    return (
      <div className="connection-banner connection-banner--warning" role="status">
        <span className="status-dot status-dot--warning" />
        <span>Waiting for the local Musearr service.</span>
      </div>
    )
  }

  const { totals, gaps, playlistsWithUnresolved } = health
  const gapRows: Array<{ label: string; value: number; hint: string }> = [
    { label: 'Tracks without a year', value: gaps.tracksMissingYear, hint: 'Weakens era-aware suggestions' },
    { label: 'Tracks without a genre', value: gaps.tracksMissingGenre, hint: 'Weakens genre matching' },
    { label: 'Tracks without a duration', value: gaps.tracksMissingDuration, hint: 'Skips listening-time totals' },
    { label: 'Albums without a year', value: gaps.albumsMissingYear, hint: '' },
    {
      label: 'Playlist entries Musearr could not match',
      value: gaps.unresolvedPlaylistItems,
      hint: 'Usually tracks outside the synced libraries',
    },
  ]

  return (
    <div className="settings-panel">
      <div className="intelligence-grid">
        <Stat label="Artists" value={n(totals.artists)} />
        <Stat label="Albums" value={n(totals.albums)} />
        <Stat label="Tracks" value={n(totals.tracks)} />
        <Stat label="Playlists" value={n(totals.playlists)} />
      </div>

      <div className="insights-block">
        <p className="eyebrow">METADATA GAPS</p>
        <ul className="curation-items">
          {gapRows.map((row) => (
            <li className="curation-item" key={row.label}>
              <div className="curation-item__song">
                <strong>{row.label}</strong>
                {row.hint && <span className="curation-item__reasons">{row.hint}</span>}
              </div>
              <div className="curation-item__actions">
                <span className={`source-pill source-pill--${row.value === 0 ? 'on' : 'off'}`}>
                  {n(row.value)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="field-hint">
          Musearr does not edit Plex metadata. Fix gaps in Plex (or its agents), then run a library
          sync and these counts update.
        </p>
      </div>

      {playlistsWithUnresolved.length > 0 && (
        <div className="insights-block">
          <p className="eyebrow">PLAYLISTS WITH UNMATCHED TRACKS</p>
          <ol className="favourite-list">
            {playlistsWithUnresolved.map((playlist) => (
              <li key={playlist.name}>
                <span>{playlist.name}</span>
                <small>{n(playlist.unresolved)} unmatched</small>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small />
    </article>
  )
}
