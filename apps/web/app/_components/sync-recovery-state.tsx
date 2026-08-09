'use client'

import { useCallback, useEffect, useState } from 'react'

type SyncRun = {
  id: string
  librarySectionId: string | null
  libraryTitle: string | null
  kind: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  counts: { importedTracks: number; skippedTracks: number }
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  failure: { classification: 'configuration' | 'authentication' | 'upstream_unavailable' | 'upstream_response' | 'unknown'; summary: string } | null
}

type SyncState = 'loading' | 'ready' | 'unavailable'

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function statusLabel(status: SyncRun['status']) {
  switch (status) {
    case 'queued':
      return 'Sync queued'
    case 'running':
      return 'Sync in progress'
    case 'completed':
      return 'Library up to date'
    case 'failed':
      return 'Sync needs attention'
    case 'cancelled':
      return 'Sync was cancelled'
  }
}

export function SyncRecoveryState() {
  const [runs, setRuns] = useState<SyncRun[]>([])
  const [state, setState] = useState<SyncState>('loading')
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)

  const loadRuns = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/v1/sync-runs', signal ? { signal } : undefined)
      if (!response.ok) throw new Error('Sync activity is unavailable.')
      const payload = (await response.json()) as { runs: SyncRun[] }
      setRuns(payload.runs)
      setState('ready')
    } catch {
      if (signal?.aborted) return
      setState('unavailable')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRuns(controller.signal)
    return () => controller.abort()
  }, [loadRuns])

  async function retry(run: SyncRun) {
    if (!run.librarySectionId) return
    setRetryingId(run.id)
    setRetryError(null)
    try {
      const response = await fetch('/api/v1/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ librarySectionId: run.librarySectionId }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null
        throw new Error(body?.detail ?? 'Musearr could not queue another sync.')
      }
      await loadRuns()
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : 'Musearr could not queue another sync.')
    } finally {
      setRetryingId(null)
    }
  }

  const latest = runs[0]
  const live = latest?.status === 'queued' || latest?.status === 'running'

  return (
    <article className="insight-card insight-card--green sync-recovery" aria-live={live ? 'polite' : undefined}>
      <p className="eyebrow">LIBRARY CARE</p>
      {state === 'loading' && <><h2>Checking sync activity</h2><p className="insight-card__copy">Musearr is loading the recorded status of your library syncs.</p></>}
      {state === 'unavailable' && <><h2>Sync activity unavailable</h2><p className="insight-card__copy">Musearr could not load recorded sync activity. Refresh this page to try again.</p></>}
      {state === 'ready' && !latest && <><h2>No sync activity yet</h2><p className="insight-card__copy">Musearr has not recorded a library sync. Start one after choosing a music library in setup.</p></>}
      {state === 'ready' && latest && (
        <>
          <h2>{statusLabel(latest.status)}</h2>
          <p className="insight-card__copy">{latest.libraryTitle ? `${latest.libraryTitle}: ` : ''}{copyFor(latest)}</p>
          {latest.status === 'failed' && latest.librarySectionId && <button className="primary-button sync-recovery__button" disabled={retryingId === latest.id} onClick={() => void retry(latest)} type="button">{retryingId === latest.id ? 'Queueing sync…' : 'Try this library again'}</button>}
          {latest.status === 'failed' && !latest.librarySectionId && <p className="sync-recovery__note">This run is not tied to a selectable library, so Musearr cannot retry it here.</p>}
          {retryError && <p className="sync-recovery__error" role="alert">{retryError}</p>}
        </>
      )}
    </article>
  )
}

function copyFor(run: SyncRun) {
  if (run.status === 'queued') return `Queued ${formatDate(run.createdAt)}. Musearr will update this card when the recorded status changes.`
  if (run.status === 'running') return run.startedAt ? `Started ${formatDate(run.startedAt)}. Musearr is importing this library now.` : 'Musearr has recorded this library as running.'
  if (run.status === 'completed') {
    const finished = run.finishedAt ? `Completed ${formatDate(run.finishedAt)}.` : 'Completed.'
    return `${finished} Imported ${run.counts.importedTracks} tracks and skipped ${run.counts.skippedTracks}.`
  }
  if (run.status === 'failed') return run.failure?.summary ?? 'Musearr recorded this sync as failed. Review your Plex connection and try the library again.'
  return run.finishedAt ? `Cancelled ${formatDate(run.finishedAt)}.` : 'Musearr recorded this sync as cancelled.'
}
