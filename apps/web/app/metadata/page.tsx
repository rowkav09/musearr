import type { Metadata } from 'next'
import { AppShell } from '../_components/app-shell'
import { LibraryMetadata } from '../_components/library-metadata'

export const metadata: Metadata = { title: 'Metadata' }

export default function MetadataPage() {
  return (
    <AppShell active="Metadata">
      <section className="welcome-section" aria-labelledby="metadata-title">
        <div>
          <p className="eyebrow">METADATA</p>
          <h1 id="metadata-title">How complete is your library?</h1>
          <p className="welcome-copy">
            Musearr&apos;s suggestions are only as good as the metadata behind them. This is a
            read-only view of what your local Plex mirror is missing — Musearr never writes back to
            Plex.
          </p>
        </div>
      </section>

      <section className="section-block" aria-labelledby="health-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LIBRARY HEALTH</p>
            <h2 id="health-title">Coverage and gaps</h2>
          </div>
          <span className="quiet-label">Recalculated on every library sync.</span>
        </div>
        <LibraryMetadata />
      </section>
    </AppShell>
  )
}
