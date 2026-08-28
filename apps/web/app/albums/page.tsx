import type { Metadata } from 'next'
import { AlbumBrowser } from '../_components/album-browser'
import { AppShell } from '../_components/app-shell'

export const metadata: Metadata = { title: 'Albums' }

export default function AlbumsPage() {
  return (
    <AppShell active="Albums">
      <section className="welcome-section" aria-labelledby="albums-title">
        <div>
          <p className="eyebrow">ALBUMS</p>
          <h1 id="albums-title">Your collection, album by album.</h1>
          <p className="welcome-copy">
            Every album in the synced Plex libraries, with the play counts and ratings Musearr has
            mirrored. Read-only.
          </p>
        </div>
      </section>

      <section className="section-block" aria-labelledby="album-list-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BROWSE</p>
            <h2 id="album-list-title">Sorted by how much you play them</h2>
          </div>
          <span className="quiet-label">Top 60; search to narrow.</span>
        </div>
        <AlbumBrowser />
      </section>
    </AppShell>
  )
}
