'use client'

import { useEffect, useState } from 'react'

type IncompleteAlbum = {
  id: string
  title: string
  artistName: string
  haveTracks: number
  expectedTracks: number
}

type ViewState = 'loading' | 'ready' | 'signed_out' | 'unavailable'

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail ?? 'Musearr could not complete that request.'
  } catch {
    return 'Musearr could not complete that request.'
  }
}

export function IncompleteAlbums() {
  const [view, setView] = useState<ViewState>('loading')
  const [albums, setAlbums] = useState<IncompleteAlbum[]>([])
  const [requested, setRequested] = useState<Record<string, string>>({})

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/v1/albums/incomplete', { signal: controller.signal })
        if (response.ok) {
          const payload = (await response.json()) as { albums: IncompleteAlbum[] }
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
    return () => controller.abort()
  }, [])

  async function request(album: IncompleteAlbum) {
    setRequested((current) => ({ ...current, [album.id]: 'Requesting…' }))
    try {
      const response = await fetch('/api/v1/albums/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ artistName: album.artistName, albumTitle: album.title }),
      })
      const outcome = response.ok ? 'Requested in Lidarr' : `Failed: ${await readDetail(response)}`
      setRequested((current) => ({ ...current, [album.id]: outcome }))
    } catch {
      setRequested((current) => ({ ...current, [album.id]: 'Failed to reach Musearr' }))
    }
  }

  if (view === 'loading' || view === 'signed_out') {
    return null
  }
  if (view === 'unavailable' || albums.length === 0) {
    return view === 'unavailable' ? null : (
      <p className="field-hint">Every album with track numbers looks complete. Nice.</p>
    )
  }

  return (
    <ul className="curation-items">
      {albums.map((album) => {
        const state = requested[album.id]
        return (
          <li className="curation-item" key={album.id}>
            <div className="curation-item__song">
              <strong>{album.title}</strong>
              <span>{album.artistName}</span>
              <span className="curation-item__reasons">
                {album.haveTracks} of {album.expectedTracks} tracks
              </span>
            </div>
            <div className="curation-item__actions">
              {state ? (
                <span className="source-pill source-pill--database">{state}</span>
              ) : (
                <button className="chip chip--on" onClick={() => void request(album)} type="button">
                  Request in Lidarr
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
