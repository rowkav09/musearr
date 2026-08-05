import Link from 'next/link'
import { MusearrMark } from '../_components/musearr-mark'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <main className="setup-shell login-shell">
      <header className="setup-header">
        <Link href="/" aria-label="Musearr home">
          <MusearrMark />
        </Link>
        <p>Private by design. Local by default.</p>
      </header>
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">WELCOME BACK</p>
        <h1 id="login-title">Return to your music room.</h1>
        <p>Use the local owner account created during setup. Musearr never sends these credentials to Plex.</p>
        <LoginForm />
      </section>
    </main>
  )
}
