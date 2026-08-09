'use client'

import { useEffect } from 'react'

export default function PlexCompletePage() {
  useEffect(() => {
    window.opener?.postMessage(
      { type: 'musearr:plex-auth-complete' },
      window.location.origin,
    )

    window.close()
  }, [])

  return (
    <main className="setup-shell">
      <section className="setup-card">
        <h1>Plex connected</h1>
        <p>You can close this window and return to Musearr.</p>
      </section>
    </main>
  )
}
