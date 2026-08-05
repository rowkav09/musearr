import { ConnectionStatus } from './_components/connection-status'
import { DashboardHome } from './_components/dashboard-home'
import { MusearrMark } from './_components/musearr-mark'

const navigation = ['Home', 'Playlists', 'Discover', 'Library', 'Insights', 'Metadata']

export default function HomePage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <MusearrMark />
        <nav aria-label="Primary navigation" className="sidebar-nav">
          {navigation.map((item, index) => (
            <a className={index === 0 ? 'nav-item nav-item--active' : 'nav-item'} href="#" key={item}>
              <span className={`nav-glyph nav-glyph--${index}`} aria-hidden="true" />
              {item}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-bottom__label">YOUR SPACE</div>
          <a className="nav-item" href="#">
            <span className="nav-glyph nav-glyph--settings" aria-hidden="true" />
            Settings
          </a>
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
          <ConnectionStatus />

          <DashboardHome />
        </div>
      </section>
    </main>
  )
}
