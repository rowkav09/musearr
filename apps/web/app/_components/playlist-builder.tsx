'use client'

import { useEffect, useState } from 'react'

type TrackHit = { id: string; title: string; artistName: string; albumTitle: string }
type Genre = { name: string; trackCount: number }
type Mode = 'track' | 'genre' | 'prompt'

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail ?? 'Musearr could not complete that request.'
  } catch {
    return 'Musearr could not complete that request.'
  }
}

export function PlaylistBuilder() {
  const [mode, setMode] = useState<Mode>('track')

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<TrackHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [seed, setSeed] = useState<TrackHit | null>(null)

  const [genres, setGenres] = useState<Genre[]>([])
  const [genre, setGenre] = useState('')
  const [prompt, setPrompt] = useState('')

  const [name, setName] = useState('')
  const [size, setSize] = useState('25')
  const [acquireMissing, setAcquireMissing] = useState(false)
  const [publishToPlex, setPublishToPlex] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const term = query.trim()

  useEffect(() => {
    if (mode !== 'genre' || genres.length > 0) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/v1/library/genres', { signal: controller.signal })
        if (response.ok) {
          const payload = (await response.json()) as { genres: Genre[] }
          setGenres(payload.genres)
          setGenre((current) => current || payload.genres[0]?.name || '')
        }
      } catch {
        /* ignore */
      }
    })()
    return () => controller.abort()
  }, [mode, genres.length])

  useEffect(() => {
    if (mode !== 'track' || seed || term.length < 2) return
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
          /* aborted */
        } finally {
          setSearching(false)
        }
      })()
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [mode, term, seed])

  const ready =
    (mode === 'track' && seed) || (mode === 'genre' && genre) || (mode === 'prompt' && prompt.trim().length >= 3)

  async function build() {
    if (!ready) return
    const parsedSize = Number.parseInt(size, 10)
    const sizeField = Number.isInteger(parsedSize) && parsedSize > 0 ? Math.min(200, parsedSize) : undefined
    setBusy(true)
    setMessage(null)
    try {
      let response: Response
      if (mode === 'track') {
        response = await fetch('/api/v1/playlists/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            seedTrackId: seed!.id,
            ...(name.trim() ? { name: name.trim() } : {}),
            ...(sizeField ? { targetSize: sizeField } : {}),
            acquireMissing,
            publishToPlex,
          }),
        })
      } else {
        response = await fetch('/api/v1/playlists/from-filter', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...(name.trim() ? { name: name.trim() } : {}),
            ...(mode === 'genre' ? { genre } : { prompt: prompt.trim() }),
            ...(sizeField ? { size: sizeField } : {}),
          }),
        })
      }
      if (!response.ok) throw new Error(await readDetail(response))
      setOk(true)
      setMessage(
        mode === 'track'
          ? 'Building it locally. Track its progress under “Acquisitions” below.'
          : 'Building it in Plex now; it will appear in your Plex playlists shortly.',
      )
      setSeed(null)
      setQuery('')
      setHits(null)
      setPrompt('')
      setName('')
    } catch (error) {
      setOk(false)
      setMessage(error instanceof Error ? error.message : 'Musearr could not start that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-panel">
      <div className="build-modes">
        {(['track', 'genre', 'prompt'] as Mode[]).map((value) => (
          <button
            className={mode === value ? 'chip chip--on' : 'chip'}
            key={value}
            onClick={() => {
              setMode(value)
              setMessage(null)
            }}
            type="button"
          >
            {value === 'track' ? 'From a track' : value === 'genre' ? 'From a genre' : 'Describe it'}
          </button>
        ))}
      </div>

      <div className="curation-new">
        {mode === 'track' && (
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
        )}

        {mode === 'genre' && (
          <label>
            Genre
            <select onChange={(event) => setGenre(event.target.value)} value={genre}>
              {genres.length === 0 && <option value="">Loading…</option>}
              {genres.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name} ({entry.trackCount})
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === 'prompt' && (
          <label>
            Describe the playlist
            <textarea
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. moody late-90s trip hop for a rainy evening"
              rows={2}
              value={prompt}
            />
            <span className="field-hint">
              Local AI maps this to genres and eras that exist in your library. Needs local AI enabled
              in Settings.
            </span>
          </label>
        )}

        <label>
          Name
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder="Optional"
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

        {mode === 'track' && (
          <>
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
                  Musearr adds a brand-new, clearly-prefixed playlist to your Plex server. It never
                  edits your own playlists. Off keeps the result inside Musearr only.
                </span>
              </span>
            </label>
          </>
        )}

        {mode !== 'track' && (
          <p className="field-hint">
            Genre and description builds are library-only and are created straight into Plex as a new
            Musearr playlist.
          </p>
        )}

        <button className="primary-button" disabled={!ready || busy} onClick={() => void build()} type="button">
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
