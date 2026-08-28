import type { Metadata } from 'next'
import Link from 'next/link'
import { MusearrMark } from '../_components/musearr-mark'
import { PlaylistCuration } from '../_components/playlist-curation'
import { PlaylistIdeas } from '../_components/playlist-ideas'

export const metadata: Metadata = {
  title: 'Playlists',
}

const navigation = ['Home', 'Playlists', 'Discover', 'Library', 'Insights', 'Metadata']

export default function PlaylistsPage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link href="/" aria-label="Musearr home">
          <MusearrMark />
        </Link>
        <nav aria-label="Primary navigation" className="sidebar-nav">
          {navigation.map((item, index) => (
            <Link
              className={item === 'Playlists' ? 'nav-item nav-item--active' : 'nav-item'}
              href={item === 'Playlists' ? '/playlists' : '/'}
              key={item}
            >
              <span className={`nav-glyph nav-glyph--${index}`} aria-hidden="true" />
              {item}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-bottom__label">YOUR SPACE</div>
          <Link className="nav-item" href="/settings">
            <span className="nav-glyph nav-glyph--settings" aria-hidden="true" />
            Settings
          </Link>
        </div>
      </aside>

      <section className="dashboard">
        <header className="topbar">
          <MusearrMark compact />
          <div className="topbar-actions">
            <span className="privacy-pill">Local only</span>
            <a className="avatar" href="/login" aria-label="Sign in to Musearr">
              M
            </a>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="welcome-section" aria-labelledby="playlists-title">
            <div>
              <p className="eyebrow">PLAYLISTS</p>
              <h1 id="playlists-title">Grow a playlist you already love.</h1>
              <p className="welcome-copy">
                Musearr studies the tracks already on a Plex playlist and proposes more from your
                library that fit. Nothing is added until you review and approve it, and it never
                removes or reorders anything.
              </p>
            </div>
          </section>

          <section className="section-block" aria-labelledby="ideas-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">NEW PLAYLIST IDEAS</p>
                <h2 id="ideas-title">Playlists your library is missing</h2>
              </div>
              <span className="quiet-label">From a coverage scan; local AI names them.</span>
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
        </div>
      </section>
    </main>
  )
}
