import type { Metadata } from 'next'
import { Acquisitions } from '../_components/acquisitions'
import { AppShell } from '../_components/app-shell'
import { PlaylistBuilder } from '../_components/playlist-builder'
import { PlaylistCuration } from '../_components/playlist-curation'
import { PlaylistIdeas } from '../_components/playlist-ideas'

export const metadata: Metadata = {
  title: 'Playlists',
}

export default function PlaylistsPage() {
  return (
    <AppShell active="Playlists">
      <section className="welcome-section" aria-labelledby="playlists-title">
        <div>
          <p className="eyebrow">PLAYLISTS</p>
          <h1 id="playlists-title">Grow a playlist you already love.</h1>
          <p className="welcome-copy">
            Musearr studies the tracks already on a Plex playlist and proposes more from your library
            that fit. Nothing is added until you review and approve it, and it never removes or
            reorders anything.
          </p>
        </div>
      </section>

      <section className="section-block" aria-labelledby="build-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BUILD A PLAYLIST</p>
            <h2 id="build-title">Start from a track you love</h2>
          </div>
          <span className="quiet-label">Deterministic plan; optional Lidarr + Plex publish.</span>
        </div>
        <PlaylistBuilder />
      </section>

      <section className="section-block" aria-labelledby="acq-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACQUISITIONS</p>
            <h2 id="acq-title">Builds in progress</h2>
          </div>
          <span className="quiet-label">Requested → downloading → imported → matched.</span>
        </div>
        <Acquisitions />
      </section>

      <section className="section-block" aria-labelledby="ideas-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">NEW PLAYLIST IDEAS</p>
            <h2 id="ideas-title">Playlists your library is missing</h2>
          </div>
          <span className="quiet-label">A coverage scan; local AI names them, then curates ~40 tracks.</span>
        </div>
        <PlaylistIdeas />
      </section>

      <section className="section-block" aria-labelledby="curation-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR PLAYLISTS</p>
            <h2 id="curation-title">Suggest additions, then apply the ones you want</h2>
          </div>
          <span className="quiet-label">Deterministic by default; local AI re-rank optional.</span>
        </div>
        <PlaylistCuration />
      </section>
    </AppShell>
  )
}
