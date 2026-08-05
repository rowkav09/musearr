import Link from 'next/link'
import { ConnectionStatus } from './_components/connection-status'
import { MusearrMark } from './_components/musearr-mark'

const navigation = ['Home', 'Playlists', 'Discover', 'Library', 'Insights', 'Metadata']

const mixes = [
  { name: 'Daily Mix', note: 'A little familiar, a little unexpected', hue: 'rose' },
  { name: 'Forgotten Favourites', note: 'Albums you used to know by heart', hue: 'violet' },
  { name: 'Hidden Gems', note: 'The overlooked corners of your library', hue: 'teal' },
]

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
            <Link className="avatar" href="/setup" aria-label="Open setup">
              M
            </Link>
          </div>
        </header>

        <div className="dashboard-content">
          <ConnectionStatus />

          <section className="welcome-section" aria-labelledby="welcome-title">
            <div>
              <p className="eyebrow">WELCOME HOME</p>
              <h1 id="welcome-title">Music that remembers you.</h1>
              <p className="welcome-copy">
                Connect Plex and Musearr will turn your collection into a living, private listening
                companion—one thoughtful recommendation at a time.
              </p>
              <Link className="primary-button" href="/setup">
                Connect Plex <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="hero-art__sun" />
              <div className="hero-art__arc hero-art__arc--one" />
              <div className="hero-art__arc hero-art__arc--two" />
              <div className="hero-art__orb hero-art__orb--one" />
              <div className="hero-art__orb hero-art__orb--two" />
              <div className="hero-art__line" />
            </div>
          </section>

          <section className="section-block" aria-labelledby="mixes-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">STARTING SOON</p>
                <h2 id="mixes-title">Your mixes will live here</h2>
              </div>
              <span className="quiet-label">Built from your library, never a black box.</span>
            </div>
            <div className="mix-grid">
              {mixes.map((mix, index) => (
                <article className="mix-card" key={mix.name}>
                  <div className={`mix-art mix-art--${mix.hue}`} aria-hidden="true">
                    <span className="mix-art__number">0{index + 1}</span>
                    <span className="mix-art__shape mix-art__shape--one" />
                    <span className="mix-art__shape mix-art__shape--two" />
                  </div>
                  <div className="mix-card__copy">
                    <h3>{mix.name}</h3>
                    <p>{mix.note}</p>
                    <span className="card-pending">Waiting for your library</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="promise-grid" aria-label="What Musearr will do">
            <article className="promise-card">
              <span className="promise-icon promise-icon--spark" aria-hidden="true">✦</span>
              <h2>Rediscover the good stuff</h2>
              <p>Find the albums that mattered, then slipped quietly out of rotation.</p>
            </article>
            <article className="promise-card">
              <span className="promise-icon promise-icon--wave" aria-hidden="true">≈</span>
              <h2>See the shape of your taste</h2>
              <p>Follow your listening rituals, favourite eras, and appetite for something new.</p>
            </article>
            <article className="promise-card">
              <span className="promise-icon promise-icon--shield" aria-hidden="true">◒</span>
              <h2>Keep it personal</h2>
              <p>Your library and listening history stay on the server you control.</p>
            </article>
          </section>
        </div>
      </section>
    </main>
  )
}
