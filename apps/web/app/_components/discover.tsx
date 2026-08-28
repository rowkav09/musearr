'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type Kind = 'daily_mix' | 'forgotten_favourites' | 'hidden_gems' | 'recently_added'

type Recommendation = {
  runId: string
  createdAt: string
  trackId: string
  trackTitle: string
  artistName: string
  albumTitle: string
  rank: number
  summary: string
  summaryPhrasing: 'deterministic' | 'local_ai'
}

type ViewState = 'loading' | 'ready' | 'signed_out' | 'unavailable'

const KINDS: Array<{ kind: Kind; title: string; blurb: string }> = [
  { kind: 'daily_mix', title: 'Daily Mix', blurb: 'A little familiar, a little unexpected.' },
  {
    kind: 'forgotten_favourites',
    title: 'Forgotten favourites',
    blurb: 'Loved once, not played in a long while.',
  },
  { kind: 'hidden_gems', title: 'Hidden gems', blurb: 'In your library, barely touched.' },
  { kind: 'recently_added', title: 'Recently added', blurb: 'New arrivals worth a proper listen.' },
]

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail ?? 'Musearr could not complete that request.'
  } catch {
    return 'Musearr could not complete that request.'
  }
}

export function Discover() {
  const [view, setView] = useState<ViewState>('loading')
  const [byKind, setByKind] = useState<Record<string, Recommendation[]>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/v1/recommendations', signal ? { signal } : {})
    if (response.status === 401) {
      setView('signed_out')
      return
    }
    if (!response.ok) {
      setView('unavailable')
      return
    }
    const payload = (await response.json()) as { recommendations: Recommendation[] & { kind: Kind }[] }
    const grouped: Record<string, Recommendation[]> = {}
    for (const item of payload.recommendations as Array<Recommendation & { kind: Kind }>) {
      ;(grouped[item.kind] ??= []).push(item)
    }
    setByKind(grouped)
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

  async function generate(kind: Kind) {
    setBusy(kind)
    setMessage(null)
    try {
      const response = await fetch('/api/v1/recommendations/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, limit: 20 }),
      })
      if (!response.ok) throw new Error(await readDetail(response))
      setMessage('Generating locally; refresh in a moment.')
      window.setTimeout(() => void load(), 2_000)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Musearr could not queue that.')
    } finally {
      setBusy(null)
    }
  }

  if (view === 'loading') {
    return (
      <div className="connection-banner" aria-live="polite">
        <span className="status-dot" />
        <span>Loading your recommendations…</span>
      </div>
    )
  }
  if (view === 'signed_out') {
    return (
      <div className="empty-intelligence">
        <strong>Sign in to see recommendations.</strong>
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
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {KINDS.map(({ kind, title, blurb }) => {
        const items = (byKind[kind] ?? []).slice(0, 8)
        return (
          <section className="discover-kind" key={kind}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{title.toUpperCase()}</p>
                <span className="quiet-label">{blurb}</span>
              </div>
              <button
                className="chip"
                disabled={busy === kind}
                onClick={() => void generate(kind)}
                type="button"
              >
                {busy === kind ? 'Queueing…' : items.length > 0 ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {items.length === 0 ? (
              <p className="field-hint">Nothing generated yet.</p>
            ) : (
              <ol className="recommendation-list">
                {items.map((item) => (
                  <li className="recommendation-row" key={`${item.runId}-${item.rank}`}>
                    <span className="recommendation-rank">{String(item.rank).padStart(2, '0')}</span>
                    <div className="recommendation-song">
                      <strong>{item.trackTitle}</strong>
                      <span>
                        {item.artistName} · {item.albumTitle}
                      </span>
                    </div>
                    <p>
                      {item.summary}
                      {item.summaryPhrasing === 'local_ai' && (
                        <span className="reason-phrasing"> · in its own words</span>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )
      })}
    </div>
  )
}
