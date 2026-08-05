import Link from 'next/link'
import { MusearrMark } from '../_components/musearr-mark'
import { SetupConnectionForm } from './setup-connection-form'

export default function SetupPage() {
  return (
    <main className="setup-shell">
      <header className="setup-header">
        <Link href="/" aria-label="Return to Musearr home">
          <MusearrMark />
        </Link>
        <p>Private by default · Your Plex token stays on this server</p>
      </header>
      <div className="setup-content">
        <section className="setup-intro" aria-labelledby="setup-title">
          <p className="eyebrow">FIRST THINGS FIRST</p>
          <h1 id="setup-title">Let&apos;s meet your music library.</h1>
          <p>
            Musearr asks Plex for your music metadata and listening information. It never downloads,
            changes, or sends your music anywhere without your say-so.
          </p>
          <ol className="setup-steps" aria-label="Setup steps">
            <li className="setup-step setup-step--current"><span>1</span> Connect Plex</li>
            <li className="setup-step"><span>2</span> Choose music libraries</li>
            <li className="setup-step"><span>3</span> Begin your first sync</li>
          </ol>
        </section>
        <section className="setup-card" aria-label="Plex connection setup">
          <SetupConnectionForm />
        </section>
      </div>
    </main>
  )
}
