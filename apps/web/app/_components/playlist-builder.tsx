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
  const [hits, setHits] = useState<TrackHit[]>([])
  const [seed, setSeed] = useState<TrackHit | null>(null)
  const [name, setName] = useState('')
  const [size, setSize] = useState(25)
  const [acquireMissing, setAcquireMissing] = useState(false)
  const [publishToPlex, setPublishToPlex] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const term = query.trim()
  const showHits = !seed && term.length >= 2

  useEffect(() => {
    if (!showHits) {
      return
    }
    const controller = new AbortController()
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/v1/library/tracks?q=${encodeURIComponent(term)}`, {
            signal: controller.signal,
          })
          if (response.ok) {
            const payload = (await response.json()) as { tracks: TrackHit[] }
            setHits(payload.tracks)
          }
        } catch {
          /* ignore */
        }
      })()
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [term, showHits])

  async function build() {
    if (!seed) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/v1/playlists/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          seedTrackId: seed.id,
          ...(name.trim() ? { name: name.trim() } : {}),
          targetSize: size,
          acquireMissing,
          publishToPlex,
        }),
      })
      if (!response.ok) throw new Error(await readDetail(response))
      setOk(true)
      setMessage('Building it locally. Track its progress under “Acquisitions” below.')
      setSeed(null)
      setName('')
      setQuery('')
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
              }}
              type="button"
            >
              Change
            </button>
          </div>
        ) : (
          <label>
            Seed track
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your library…"
              value={query}
            />
            {showHits && hits.length > 0 && (
              <ul className="track-hits">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button onClick={() => setSeed(hit)} type="button">
                      <strong>{hit.title}</strong>
                      <span>
                        {hit.artistName} · {hit.albumTitle}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
        )}

        <label>
          Name <span className="field-hint">Optional — defaults to “Like &lt;seed&gt;”.</span>
          <input onChange={(event) => setName(event.target.value)} value={name} placeholder="Late night drive" />
        </label>

        <label className="curation-limit">
          Length
          <input
            inputMode="numeric"
            onChange={(event) => setSize(Math.max(5, Math.min(100, Number(event.target.value) || 25)))}
            value={size}
          />
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
            Publish to Plex as a Musearr playlist
            <span className="field-hint">Additive and idempotent; never touches your own playlists.</span>
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
