import type { Metadata } from 'next'
import Link from 'next/link'
import { LocalAiSettings } from '../_components/local-ai-settings'
import { MusearrMark } from '../_components/musearr-mark'

export const metadata: Metadata = {
  title: 'Settings',
}

const navigation = ['Home', 'Playlists', 'Discover', 'Library', 'Insights', 'Metadata']

export default function SettingsPage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link href="/" aria-label="Musearr home">
          <MusearrMark />
        </Link>
        <nav aria-label="Primary navigation" className="sidebar-nav">
          {navigation.map((item, index) => (
            <Link className="nav-item" href="/" key={item}>
              <span className={`nav-glyph nav-glyph--${index}`} aria-hidden="true" />
              {item}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-bottom__label">YOUR SPACE</div>
          <Link className="nav-item nav-item--active" href="/settings">
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
          <section className="welcome-section" aria-labelledby="settings-title">
            <div>
              <p className="eyebrow">SETTINGS</p>
              <h1 id="settings-title">How Musearr thinks.</h1>
              <p className="welcome-copy">
                Musearr is deterministic by default. Local AI is an optional layer that talks only to a
                model runtime you host. Configure it here; the environment provides the defaults until
                you save an override.
              </p>
            </div>
          </section>

          <section className="section-block" aria-labelledby="local-ai-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">LOCAL AI</p>
                <h2 id="local-ai-title">Optional, self-hosted, off by default</h2>
              </div>
              <span className="quiet-label">Overrides MUSEARR_LOCAL_AI_* when saved.</span>
            </div>
            <LocalAiSettings />
          </section>
        </div>
      </section>
    </main>
  )
}
