'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type AlbumCard = {
  id: string
  title: string
  artistName: string
  year: number | null
  trackCount: number
  totalPlays: number
  avgRating: number | null
  addedAt: string | null
}

type Sort = 'plays' | 'recent' | 'title'
type ViewState = 'loading' | 'ready' | 'signed_out' | 'unavailable'

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'plays', label: 'Most played' },
  { value: 'recent', label: 'Recently added' },
  { value: 'title', label: 'A–Z' },
]

function n(value: number): string {
  return new Intl.NumberFormat().format(value)
}

export function AlbumBrowser() {
  const [view, setView] = useState<ViewState>('loading')
  const [albums, setAlbums] = useState<AlbumCard[]>([])
  const [sort, setSort] = useState<Sort>('plays')
  const [q, setQ] = useState('')
  const term = q.trim()

  useEffect(() => {
    const controller = new AbortController()
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ sort })
          if (term.length >= 2) params.set('q', term)
          const response = await fetch(`/api/v1/library/albums?${params.toString()}`, {
            signal: controller.signal,
          })
          if (response.ok) {
            const payload = (await response.json()) as { albums: AlbumCard[] }
            setAlbums(payload.albums)
            setView('ready')
          } else if (response.status === 401) {
            setView('signed_out')
          } else {
            setView('unavailable')
          }
        } catch {
          if (!controller.signal.aborted) setView('unavailable')
        }
      })()
    }, term ? 250 : 0)
    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [sort, term])

  if (view === 'loading') {
    return (
      <div className="connection-banner" aria-live="polite">
        <span className="status-dot" />
        <span>Loading your albums…</span>
      </div>
    )
  }
  if (view === 'signed_out') {
    return (
      <div className="empty-intelligence">
        <strong>Sign in to browse your albums.</strong>
        <Link className="secondary-button" href="/login">
          Sign in
        </Link>
      </div>
    )
  }
  if (view === 'unavailable') {
    return (
      <div className="connection-banner connection-banner--warning" role="status">
        <span className="status-dot status-dot--warning" />
        <span>Waiting for the local Musearr service.</span>
      </div>
    )
  }

  return (
    <div className="settings-panel">
      <div className="album-controls">
        <input
          aria-label="Search albums"
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search albums or artists…"
          value={q}
        />
        <select onChange={(event) => setSort(event.target.value as Sort)} value={sort}>
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {albums.length === 0 ? (
        <p className="field-hint">No albums matched.</p>
      ) : (
        <div className="album-grid">
          {albums.map((album) => (
            <article className="album-card" key={album.id}>
              <div className="album-card__cover" aria-hidden="true">
                {album.title.slice(0, 1).toUpperCase()}
              </div>
              <div className="album-card__body">
                <strong title={album.title}>{album.title}</strong>
                <span>{album.artistName}</span>
                <small>
                  {album.year ? `${album.year} · ` : ''}
                  {album.trackCount} {album.trackCount === 1 ? 'track' : 'tracks'}
                  {album.totalPlays > 0 ? ` · ${n(album.totalPlays)} plays` : ''}
                  {album.avgRating ? ` · ★ ${album.avgRating.toFixed(1)}` : ''}
                </small>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
