'use client'

import { useCallback, useEffect, useState } from 'react'

type GenStatus =
  | 'generating'
  | 'awaiting_acquisition'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'partially_published'
  | 'failed'

type Counts = {
  total: number
  inLibrary: number
  awaitingAcquisition: number
  unavailable: number
  published: number
}

type GenerationSummary = {
  id: string
  name: string
  seedLabel: string
  status: GenStatus
  acquireMissing: boolean
  publishToPlex: boolean
  counts: Counts
  errorSummary: string | null
  createdAt: string
}

type GenerationItem = {
  id: string
  trackTitle: string
  artistName: string
  albumTitle: string | null
  state: 'in_library' | 'pending' | 'requested' | 'downloading' | 'imported' | 'matched' | 'unavailable'
}

type Generation = GenerationSummary & { items: GenerationItem[] }
type ViewState = 'loading' | 'ready' | 'signed_out' | 'unavailable'

const STATUS_LABEL: Record<GenStatus, string> = {
  generating: 'Planning',
  awaiting_acquisition: 'Acquiring',
  ready: 'Ready',
  publishing: 'Publishing',
  published: 'Published',
  partially_published: 'Partly published',
  failed: 'Failed',
}

const STATE_LABEL: Record<GenerationItem['state'], string> = {
  in_library: 'In library',
  pending: 'Queued',
  requested: 'Requested from Lidarr',
  downloading: 'Downloading',
  imported: 'Imported, awaiting sync',
  matched: 'Matched',
  unavailable: 'Unavailable',
}

export function Acquisitions() {
  const [view, setView] = useState<ViewState>('loading')
  const [generations, setGenerations] = useState<GenerationSummary[]>([])
  const [open, setOpen] = useState<Record<string, Generation>>({})

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/v1/playlists/generations', signal ? { signal } : {})
    if (response.status === 401) {
      setView('signed_out')
      return
    }
    if (!response.ok) {
      setView('unavailable')
      return
    }
    const payload = (await response.json()) as { generations: GenerationSummary[] }
    setGenerations(payload.generations)
    setView('ready')
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        await load(controller.signal)
      } catch {
        if (!controller.signal.aborted) setView('unavailable')
      }
    })()
    return () => controller.abort()
  }, [load])

  async function toggle(id: string) {
    if (open[id]) {
      setOpen((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      return
    }
    const response = await fetch(`/api/v1/playlists/generations/${id}`)
    if (response.ok) {
      const payload = (await response.json()) as { generation: Generation }
      setOpen((current) => ({ ...current, [id]: payload.generation }))
    }
  }

  if (view === 'loading') {
    return (
      <div className="connection-banner" aria-live="polite">
        <span className="status-dot" />
        <span>Loading acquisitions…</span>
      </div>
    )
  }
  if (view === 'signed_out') {
    return <p className="field-hint">Sign in as the owner to see playlist builds and acquisitions.</p>
  }
  if (view === 'unavailable') {
    return (
      <div className="connection-banner connection-banner--warning" role="status">
        <span className="status-dot status-dot--warning" />
        <span>Waiting for the local Musearr service.</span>
      </div>
    )
  }

  if (generations.length === 0) {
    return (
      <div className="empty-intelligence">
        <strong>Nothing building yet.</strong>
        <span>
          Build a playlist above. If you turn on “acquire missing tracks”, Lidarr requests show up here
          and move through requested → downloading → imported → matched as they land.
        </span>
      </div>
    )
  }

  return (
    <div className="curation-list">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BUILDS</p>
          <h2>From plan to Plex</h2>
        </div>
        <button className="linkish-button" onClick={() => void load()} type="button">
          Refresh
        </button>
      </div>

      {generations.map((generation) => {
        const detail = open[generation.id]
        const done = generation.counts.inLibrary
        const total = Math.max(generation.counts.total, 1)
        return (
          <article className="curation-card" key={generation.id}>
            <button className="curation-card__head" onClick={() => void toggle(generation.id)} type="button">
              <span className="curation-card__title">
                <strong>{generation.name}</strong>
                <span>
                  {generation.counts.inLibrary} in library · {generation.counts.awaitingAcquisition} acquiring
                  · {generation.counts.unavailable} unavailable
                  {generation.publishToPlex ? ` · ${generation.counts.published} published` : ''}
                </span>
              </span>
              <span className={`curation-badge curation-badge--${generation.status}`}>
                {STATUS_LABEL[generation.status]}
              </span>
            </button>

            <div className="acq-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </div>

            {generation.errorSummary && <p className="form-message">{generation.errorSummary}</p>}

            {detail && (
              <div className="curation-card__body">
                <ul className="curation-items">
                  {detail.items.map((item) => (
                    <li className="curation-item" key={item.id}>
                      <div className="curation-item__song">
                        <strong>{item.trackTitle}</strong>
                        <span>
                          {item.artistName}
                          {item.albumTitle ? ` · ${item.albumTitle}` : ''}
                        </span>
                      </div>
                      <div className="curation-item__actions">
                        <span
                          className={`source-pill source-pill--${
                            item.state === 'in_library' || item.state === 'matched'
                              ? 'on'
                              : item.state === 'unavailable'
                                ? 'off'
                                : 'database'
                          }`}
                        >
                          {STATE_LABEL[item.state]}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
