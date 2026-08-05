'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type SetupStatus = {
  phase: 'unconfigured' | 'configured'
  plexServer: { name: string; machineIdentifier: string; lastSeenAt: string | null } | null
}

export function ConnectionStatus() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadStatus() {
      try {
        const response = await fetch('/api/v1/setup/status', { signal: controller.signal })
        if (!response.ok) {
          setUnavailable(true)
          return
        }
        setStatus((await response.json()) as SetupStatus)
      } catch {
        if (!controller.signal.aborted) {
          setUnavailable(true)
        }
      }
    }

    void loadStatus()
    return () => controller.abort()
  }, [])

  if (unavailable) {
    return (
      <div className="connection-banner connection-banner--warning" role="status">
        <span className="status-dot status-dot--warning" />
        <span>Waiting for the local Musearr service.</span>
        <span className="banner-detail">Start the API and PostgreSQL, then refresh.</span>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="connection-banner" aria-live="polite">
        <span className="status-dot" />
        <span>Checking your music room…</span>
      </div>
    )
  }

  if (status.phase === 'configured' && status.plexServer) {
    return (
      <div className="connection-banner connection-banner--connected" role="status">
        <span className="status-dot status-dot--connected" />
        <span>Connected to {status.plexServer.name}</span>
        <span className="banner-detail">Your library is ready for its first sync.</span>
      </div>
    )
  }

  return (
    <div className="connection-banner connection-banner--accent" role="status">
      <span className="status-dot status-dot--accent" />
      <span>Your music story starts with Plex.</span>
      <Link href="/setup">Connect your library</Link>
    </div>
  )
}
