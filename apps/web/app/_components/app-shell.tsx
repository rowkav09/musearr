import Link from 'next/link'
import type { ReactNode } from 'react'
import { MusearrMark } from './musearr-mark'

const NAV: Array<{ label: string; href: string }> = [
  { label: 'Home', href: '/' },
  { label: 'Playlists', href: '/playlists' },
  { label: 'Discover', href: '/discover' },
  { label: 'Albums', href: '/albums' },
  { label: 'Insights', href: '/insights' },
  { label: 'Metadata', href: '/metadata' },
]

/** The dashboard chrome — sidebar, top bar — shared by every signed-in page. */
export function AppShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link href="/" aria-label="Musearr home">
          <MusearrMark />
        </Link>
        <nav aria-label="Primary navigation" className="sidebar-nav">
          {NAV.map((item, index) => (
            <Link
              className={item.label === active ? 'nav-item nav-item--active' : 'nav-item'}
              href={item.href}
              key={item.label}
            >
              <span className={`nav-glyph nav-glyph--${index}`} aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-bottom__label">YOUR SPACE</div>
          <Link className={active === 'Settings' ? 'nav-item nav-item--active' : 'nav-item'} href="/settings">
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
        <div className="dashboard-content">{children}</div>
      </section>
    </main>
  )
}
