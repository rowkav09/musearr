'use client'

import { useEffect, useState } from 'react'

type TrackHit = { id: string; title: string; artistName: string; albumTitle: string }

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail ?? 'Musearr could not complete that request.'
  } catch {
    return 'Musearr could not complete that request.'
  }
}

export function PlaylistBuilder() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<TrackHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [seed, setSeed] = useState<TrackHit | null>(null)
  const [name, setName] = useState('')
  const [size, setSize] = useState('25')
  const [acquireMissing, setAcquireMissing] = useState(false)
  const [publishToPlex, setPublishToPlex] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const term = query.trim()

  useEffect(() => {
    if (seed || term.length < 2) {
      return
    }
    const controller = new AbortController()
    const handle = setTimeout(() => {
      void (async () => {
        setSearching(true)
        try {
          const response = await fetch(`/api/v1/library/tracks?q=${encodeURIComponent(term)}`, {
            signal: controller.signal,
          })
          if (response.ok) {
            const payload = (await response.json()) as { tracks: TrackHit[] }
            setHits(payload.tracks)
          } else {
            setHits([])
          }
        } catch {
          // aborted or offline; leave whatever we had
        } finally {
          setSearching(false)
        }
      })()
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [term, seed])

  async function build() {
    if (!seed) {
      return
    }
    const parsedSize = Number.parseInt(size, 10)
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/v1/playlists/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          seedTrackId: seed.id,
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(Number.isInteger(parsedSize) && parsedSize > 0
            ? { targetSize: Math.min(200, parsedSize) }
            : {}),
          acquireMissing,
          publishToPlex,
        }),
      })
      if (!response.ok) {
        throw new Error(await readDetail(response))
      }
      setOk(true)
      setMessage('Building it locally. Track its progress under “Acquisitions” below.')
      setSeed(null)
      setName('')
      setQuery('')
      setHits(null)
    } catch (error) {
      setOk(false)
      setMessage(error instanceof Error ? error.message : 'Musearr could not start that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-panel">
      <div className="curation-new">
        <div className="seed-field">
          <span className="seed-field__label">Seed track</span>
          {seed ? (
            <div className="verified-server">
              <span className="verified-server__check" aria-hidden="true">
                ♪
              </span>
              <span>
                <strong>
                  {seed.title} — {seed.artistName}
                </strong>
                <small>{seed.albumTitle}</small>
              </span>
              <button
                className="linkish-button"
                onClick={() => {
                  setSeed(null)
                  setQuery('')
                  setHits(null)
                }}
                type="button"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="seed-search">
              <input
                aria-label="Search your library for a seed track"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your library…"
                value={query}
              />
              {term.length >= 2 && (
                <ul className="track-hits">
                  {searching && hits === null ? (
                    <li className="track-hits__note">Searching…</li>
                  ) : hits && hits.length === 0 ? (
                    <li className="track-hits__note">No tracks matched.</li>
                  ) : (
                    (hits ?? []).map((hit) => (
                      <li key={hit.id}>
                        <button onClick={() => setSeed(hit)} type="button">
                          <strong>{hit.title}</strong>
                          <span>
                            {hit.artistName} · {hit.albumTitle}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <label>
          Name
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder="Optional — defaults to “Like <seed track>”"
            value={name}
          />
        </label>

        <label className="curation-limit">
          About how many tracks
          <input
            inputMode="numeric"
            onChange={(event) => setSize(event.target.value.replace(/[^\d]/g, ''))}
            placeholder="25"
            value={size}
          />
          <span className="field-hint">A target — you get up to this many that genuinely fit.</span>
        </label>

        <label className="settings-toggle">
          <input
            checked={acquireMissing}
            onChange={(event) => setAcquireMissing(event.target.checked)}
            type="checkbox"
          />
          <span>
            Acquire missing tracks via Lidarr
            <span className="field-hint">
              Off keeps the playlist library-only. Needs a Lidarr connection in Settings.
            </span>
          </span>
        </label>

        <label className="settings-toggle">
          <input
            checked={publishToPlex}
            onChange={(event) => setPublishToPlex(event.target.checked)}
            type="checkbox"
          />
          <span>
            Also create it in Plex
            <span className="field-hint">
              Musearr adds a brand-new playlist to your Plex server with these tracks (prefixed so
              it&apos;s clearly Musearr&apos;s). It never edits or reorders your own playlists. Off
              keeps the result inside Musearr only.
            </span>
          </span>
        </label>

        <button className="primary-button" disabled={!seed || busy} onClick={() => void build()} type="button">
          {busy ? 'Starting…' : 'Build playlist'}
        </button>

        {message && (
          <p className={`form-message ${ok ? 'form-message--success' : ''}`.trim()} role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
