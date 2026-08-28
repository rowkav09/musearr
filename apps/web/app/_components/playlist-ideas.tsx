'use client'

import { useCallback, useEffect, useState } from 'react'

type IdeaStatus = 'proposed' | 'dismissed' | 'created'

type PlaylistIdea = {
  id: string
  name: string
  rationale: string
  kind: string
  libraryTrackCount: number
  coveredTrackCount: number
  coverageRatio: number
  source: string
  status: IdeaStatus
}

type ViewState = 'loading' | 'ready' | 'signed_out' | 'forbidden' | 'unavailable'

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail ?? 'Musearr could not complete that request.'
  } catch {
    return 'Musearr could not complete that request.'
  }
}

export function PlaylistIdeas() {
  const [view, setView] = useState<ViewState>('loading')
  const [ideas, setIdeas] = useState<PlaylistIdea[]>([])
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const response = await fetch('/api/v1/playlists/ideas')
    if (response.ok) {
      const payload = (await response.json()) as { ideas: PlaylistIdea[] }
      setIdeas(payload.ideas)
      setView('ready')
    } else if (response.status === 401) {
      setView('signed_out')
    } else if (response.status === 403) {
      setView('forbidden')
    } else {
      setView('unavailable')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function initialLoad() {
      try {
        const response = await fetch('/api/v1/playlists/ideas', { signal: controller.signal })
        if (response.ok) {
          const payload = (await response.json()) as { ideas: PlaylistIdea[] }
          setIdeas(payload.ideas)
          setView('ready')
        } else if (response.status === 401) {
          setView('signed_out')
        } else if (response.status === 403) {
          setView('forbidden')
        } else {
          setView('unavailable')
        }
      } catch {
        if (!controller.signal.aborted) {
          setView('unavailable')
        }
      }
    }

    void initialLoad()
    return () => controller.abort()
  }, [])

  async function scan() {
    setScanning(true)
    setMessage(null)
    try {
      const response = await fetch('/api/v1/playlists/ideas/scan', { method: 'POST' })
      if (!response.ok) throw new Error(await readDetail(response))
      setMessage('Scanning your library; refresh in a moment.')
      window.setTimeout(() => void load(), 2_000)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Musearr could not start the scan.')
    } finally {
      setScanning(false)
    }
  }

  async function dismiss(id: string) {
    const response = await fetch(`/api/v1/playlists/ideas/${id}/dismiss`, { method: 'POST' })
    if (response.ok) {
      const payload = (await response.json()) as { ideas: PlaylistIdea[] }
      setIdeas(payload.ideas)
    }
  }

  async function create(id: string) {
    setMessage(null)
    const response = await fetch(`/api/v1/playlists/ideas/${id}/create`, { method: 'POST' })
    if (!response.ok) {
      setMessage(await readDetail(response))
      return
    }
    setMessage('Building the playlist in Plex; refresh in a moment.')
    window.setTimeout(() => void load(), 2_000)
  }

  if (view === 'loading') {
    return (
      <div className="connection-banner" aria-live="polite">
        <span className="status-dot" />
        <span>Loading playlist ideas…</span>
      </div>
    )
  }
  if (view === 'signed_out') {
    return <p className="field-hint">Sign in as the owner to scan your library for playlist ideas.</p>
  }
  if (view === 'forbidden') {
    return <p className="field-hint">Playlist ideas are available to the local owner account.</p>
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
      <div className="curation-new">
        <p className="field-hint">
          Musearr scans your library for coherent groups — a genre, a decade, an artist&apos;s deep
          cuts, your unplaylisted favourites — that barely appear on any playlist, and suggests them
          as new playlists.
        </p>
        <button className="primary-button" disabled={scanning} onClick={() => void scan()} type="button">
          {scanning ? 'Scanning…' : ideas.length > 0 ? 'Re-scan library' : 'Scan library for ideas'}
        </button>
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
      </div>

      {ideas.length === 0 ? (
        <div className="empty-intelligence">
          <strong>No ideas yet.</strong>
          <span>Run a scan once your library sync has finished.</span>
        </div>
      ) : (
        <ul className="curation-items">
          {ideas.map((idea) => (
            <li className={`curation-item curation-item--${idea.status}`} key={idea.id}>
              <div className="curation-item__song">
                <strong>{idea.name}</strong>
                <span>{idea.rationale}</span>
                <span className="curation-item__reasons">
                  {idea.libraryTrackCount} tracks · {Math.round(idea.coverageRatio * 100)}% already on a
                  playlist
                  {idea.source === 'local_ai' ? ' · AI-named' : ''}
                  {idea.status === 'created' ? ' · created' : ''}
                </span>
              </div>
              {idea.status !== 'created' && (
                <div className="curation-item__actions">
                  <button className="chip chip--on" onClick={() => void create(idea.id)} type="button">
                    Create
                  </button>
                  <button className="chip" onClick={() => void dismiss(idea.id)} type="button">
                    Dismiss
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
