import type { Metadata } from 'next'
import { AppShell } from '../_components/app-shell'
import { LidarrSettings } from '../_components/lidarr-settings'
import { LocalAiSettings } from '../_components/local-ai-settings'

export const metadata: Metadata = {
  title: 'Settings',
}

export default function SettingsPage() {
  return (
    <AppShell active="Settings">
      <section className="welcome-section" aria-labelledby="settings-title">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1 id="settings-title">How Musearr thinks.</h1>
          <p className="welcome-copy">
            Musearr is deterministic by default. Local AI is an optional layer that talks only to a
            model runtime you host. Configure it here; the environment provides the defaults until you
            save an override.
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

      <section className="section-block" aria-labelledby="lidarr-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LIDARR</p>
            <h2 id="lidarr-title">Acquire tracks that aren&apos;t in your library yet</h2>
          </div>
          <span className="quiet-label">Optional. Point Musearr at a Lidarr you already run.</span>
        </div>
        <LidarrSettings />
      </section>
    </AppShell>
  )
}
