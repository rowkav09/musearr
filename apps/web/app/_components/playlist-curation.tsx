'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type MirroredPlaylist = {
  plexRatingKey: string
  name: string
  managedByMusearr: boolean
  trackCount: number
}

type CurationStatus =
  | 'proposed'
  | 'approved'
  | 'applying'
  | 'applied'
  | 'partially_applied'
  | 'failed'
  | 'dismissed'

type CurationCounts = {
  total: number
  accepted: number
  rejected: number
  suggested: number
  applied: number
}

type CurationReason = { code: string; weight: number; facts: Record<string, string | number> }

type CurationItem = {
  id: string
  position: number
  trackId: string
  artistName: string
  trackTitle: string
  score: number
  reasons: CurationReason[]
  decision: 'suggested' | 'accepted' | 'rejected'
  appliedAt: string | null
}

type CurationSummary = {
  id: string
  playlistName: string
  status: CurationStatus
  useAi: boolean
  aiUsed: boolean
  basisTrackCount: number
  counts: CurationCounts
  errorSummary: string | null
  createdAt: string
}

type Curation = CurationSummary & { items: CurationItem[] }

type ViewState = 'loading' | 'ready' | 'signed_out' | 'forbidden' | 'unavailable'

const APPLICABLE: CurationStatus[] = ['proposed', 'approved', 'failed', 'partially_applied']

const REASON_LABELS: Record<string, string> = {
  PLAYLIST_ARTIST: 'artist on the playlist',
  PLAYLIST_GENRE: 'shared genre',
  PLAYLIST_ERA: 'same era',
  HIGH_RATING: 'you rated it highly',
  FAMILIAR: 'you have played it',
  FRESH: 'new to you',
}

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail ?? 'Musearr could not complete that request.'
  } catch {
    return 'Musearr could not complete that request.'
  }
}

function statusLabel(status: CurationStatus): string {
  switch (status) {
    case 'proposed':
      return 'Ready for review'
    case 'approved':
      return 'Reviewed'
    case 'applying':
      return 'Adding to Plex'
    case 'applied':
      return 'Added to Plex'
    case 'partially_applied':
      return 'Partly added'
    case 'failed':
      return 'Needs attention'
    case 'dismissed':
      return 'Dismissed'
  }
}

export function PlaylistCuration() {
  const [view, setView] = useState<ViewState>('loading')
  const [playlists, setPlaylists] = useState<MirroredPlaylist[]>([])
  const [curations, setCurations] = useState<CurationSummary[]>([])
  const [expanded, setExpanded] = useState<Record<string, Curation>>({})
  const [message, setMessage] = useState<string | null>(null)

  const [selectedKey, setSelectedKey] = useState('')
  const [useAi, setUseAi] = useState(false)
  const [limit, setLimit] = useState(20)
  const [creating, setCreating] = useState(false)

  const loadCurations = useCallback(async () => {
    const response = await fetch('/api/v1/playlists/curations')
    if (response.ok) {
      const payload = (await response.json()) as { curations: CurationSummary[] }
      setCurations(payload.curations)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const [playlistResponse, curationResponse] = await Promise.all([
          fetch('/api/v1/playlists', { signal: controller.signal }),
          fetch('/api/v1/playlists/curations', { signal: controller.signal }),
        ])
        if (playlistResponse.status === 401) {
          setView('signed_out')
          return
        }
        if (playlistResponse.status === 403) {
          setView('forbidden')
          return
        }
        if (!playlistResponse.ok || !curationResponse.ok) {
          setView('unavailable')
          return
        }
        const playlistPayload = (await playlistResponse.json()) as { playlists: MirroredPlaylist[] }
        const curationPayload = (await curationResponse.json()) as { curations: CurationSummary[] }
        setPlaylists(playlistPayload.playlists)
        setCurations(curationPayload.curations)
        setSelectedKey(playlistPayload.playlists[0]?.plexRatingKey ?? '')
        setView('ready')
      } catch {
        if (!controller.signal.aborted) {
          setView('unavailable')
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  async function createCuration() {
    if (!selectedKey) {
      return
    }
    setCreating(true)
    setMessage(null)
    try {
      const response = await fetch('/api/v1/playlists/curations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plexPlaylistRatingKey: selectedKey, useAi, limit }),
      })
      if (!response.ok) {
        throw new Error(await readDetail(response))
      }
      setMessage('Proposal queued. The local worker is building it; refresh in a moment.')
      window.setTimeout(() => void loadCurations(), 1_500)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Musearr could not queue that curation.')
    } finally {
      setCreating(false)
    }
  }

  async function toggleExpand(id: string) {
    if (expanded[id]) {
      setExpanded((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      return
    }
    const response = await fetch(`/api/v1/playlists/curations/${id}`)
    if (response.ok) {
      const payload = (await response.json()) as { curation: Curation }
      setExpanded((current) => ({ ...current, [id]: payload.curation }))
    }
  }

  function applyCurationToState(curation: Curation) {
    setExpanded((current) => ({ ...current, [curation.id]: curation }))
    setCurations((current) =>
      current.map((entry) => (entry.id === curation.id ? stripItems(curation) : entry)),
    )
  }

  async function decide(id: string, itemId: string, decision: CurationItem['decision']) {
    const response = await fetch(`/api/v1/playlists/curations/${id}/items/${itemId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    if (response.ok) {
      const payload = (await response.json()) as { curation: Curation }
      applyCurationToState(payload.curation)
    }
  }

  async function applyCuration(id: string) {
    setMessage(null)
    const response = await fetch(`/api/v1/playlists/curations/${id}/apply`, { method: 'POST' })
    if (!response.ok) {
      setMessage(await readDetail(response))
      return
    }
    setMessage('Adding the accepted tracks to Plex; refresh in a moment.')
    window.setTimeout(() => void loadCurations(), 1_500)
  }

  if (view === 'loading') {
    return (
      <div className="connection-banner" aria-live="polite">
        <span className="status-dot" />
        <span>Loading playlist curations…</span>
      </div>
    )
  }
  if (view === 'signed_out') {
    return (
      <div className="empty-intelligence">
        <strong>Sign in to curate playlists.</strong>
        <Link className="secondary-button" href="/login">
          Sign in
        </Link>
      </div>
    )
  }
  if (view === 'forbidden') {
    return (
      <div className="empty-intelligence">
        <strong>Owner only.</strong>
        <span>Playlist curation is available to the local owner account.</span>
      </div>
    )
  }
  if (view === 'unavailable') {
    return (
      <div className="connection-banner connection-banner--warning" role="status">
        <span className="status-dot status-dot--warning" />
        <span>Waiting for the local Musearr service.</span>
        <span className="banner-detail">Start the API and PostgreSQL, then refresh.</span>
      </div>
    )
  }

  return (
    <div className="settings-panel">
      <div className="curation-new">
        {playlists.length === 0 ? (
          <p className="field-hint">
            No playlists are mirrored yet. Run a Plex playlist sync, then a playlist will be selectable
            here.
          </p>
        ) : (
          <div className="connection-form">
            <label>
              Playlist
              <select onChange={(event) => setSelectedKey(event.target.value)} value={selectedKey}>
                {playlists.map((playlist) => (
                  <option key={playlist.plexRatingKey} value={playlist.plexRatingKey}>
                    {playlist.name} · {playlist.trackCount} tracks
                    {playlist.managedByMusearr ? ' · Musearr' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-toggle">
              <input checked={useAi} onChange={(event) => setUseAi(event.target.checked)} type="checkbox" />
              <span>
                Use local AI to re-rank the suggestions
                <span className="field-hint">
                  Only reorders and trims the deterministic shortlist. Off keeps it fully
                  deterministic.
                </span>
              </span>
            </label>
            <label>
              How many to suggest
              <input
                inputMode="numeric"
                onChange={(event) => setLimit(Math.max(1, Math.min(100, Number(event.target.value) || 20)))}
                value={limit}
              />
            </label>
            <button
              className="primary-button"
              disabled={creating || !selectedKey}
              onClick={() => void createCuration()}
              type="button"
            >
              {creating ? 'Queueing…' : 'Suggest additions'}
            </button>
          </div>
        )}
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
      </div>

      <div className="curation-list">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PROPOSALS</p>
            <h2>Review before anything reaches Plex</h2>
          </div>
          <button className="linkish-button" onClick={() => void loadCurations()} type="button">
            Refresh
          </button>
        </div>

        {curations.length === 0 ? (
          <div className="empty-intelligence">
            <strong>No curations yet.</strong>
            <span>Pick a playlist above and Musearr will propose tracks from your library to add.</span>
          </div>
        ) : (
          curations.map((curation) => {
            const open = expanded[curation.id]
            return (
              <article className="curation-card" key={curation.id}>
                <button className="curation-card__head" onClick={() => void toggleExpand(curation.id)} type="button">
                  <span className="curation-card__title">
                    <strong>{curation.playlistName}</strong>
                    <span>
                      {curation.counts.total} suggested · {curation.counts.accepted} accepted ·{' '}
                      {curation.counts.rejected} rejected
                      {curation.aiUsed ? ' · AI re-ranked' : ''}
                    </span>
                  </span>
                  <span className={`curation-badge curation-badge--${curation.status}`}>
                    {statusLabel(curation.status)}
                  </span>
                </button>

                {curation.errorSummary && <p className="form-message">{curation.errorSummary}</p>}

                {open && (
                  <div className="curation-card__body">
                    {open.items.length === 0 ? (
                      <p className="field-hint">
                        No additions were proposed — the library had nothing that fit this playlist.
                      </p>
                    ) : (
                      <ul className="curation-items">
                        {open.items.map((item) => (
                          <li className={`curation-item curation-item--${item.decision}`} key={item.id}>
                            <div className="curation-item__song">
                              <strong>{item.trackTitle}</strong>
                              <span>{item.artistName}</span>
                              <span className="curation-item__reasons">
                                {item.reasons
                                  .map((reason) => REASON_LABELS[reason.code] ?? reason.code)
                                  .join(' · ')}
                              </span>
                            </div>
                            <div className="curation-item__actions">
                              <button
                                className={item.decision === 'accepted' ? 'chip chip--on' : 'chip'}
                                onClick={() =>
                                  void decide(
                                    curation.id,
                                    item.id,
                                    item.decision === 'accepted' ? 'suggested' : 'accepted',
                                  )
                                }
                                type="button"
                              >
                                Accept
                              </button>
                              <button
                                className={item.decision === 'rejected' ? 'chip chip--off' : 'chip'}
                                onClick={() =>
                                  void decide(
                                    curation.id,
                                    item.id,
                                    item.decision === 'rejected' ? 'suggested' : 'rejected',
                                  )
                                }
                                type="button"
                              >
                                Reject
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {APPLICABLE.includes(open.status) && open.counts.accepted > 0 && (
                      <button
                        className="primary-button"
                        onClick={() => void applyCuration(curation.id)}
                        type="button"
                      >
                        Add {open.counts.accepted} accepted{' '}
                        {open.counts.accepted === 1 ? 'track' : 'tracks'} to Plex
                      </button>
                    )}
                  </div>
                )}
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}

function stripItems(curation: Curation): CurationSummary {
  const summary: CurationSummary = {
    id: curation.id,
    playlistName: curation.playlistName,
    status: curation.status,
    useAi: curation.useAi,
    aiUsed: curation.aiUsed,
    basisTrackCount: curation.basisTrackCount,
    counts: curation.counts,
    errorSummary: curation.errorSummary,
    createdAt: curation.createdAt,
  }
  return summary
}
