import type { Metadata } from 'next'
import { AppShell } from '../_components/app-shell'
import { ListeningInsights } from '../_components/listening-insights'

export const metadata: Metadata = { title: 'Insights' }

export default function InsightsPage() {
  return (
    <AppShell active="Insights">
      <section className="welcome-section" aria-labelledby="insights-title">
        <div>
          <p className="eyebrow">INSIGHTS</p>
          <h1 id="insights-title">What you actually listen to.</h1>
          <p className="welcome-copy">
            Built only from your local Plex mirror — play counts, ratings, and (as they arrive)
            day-by-day activity. Nothing leaves this server.
          </p>
        </div>
      </section>

      <section className="section-block" aria-labelledby="listening-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LISTENING</p>
            <h2 id="listening-title">Your all-time picture</h2>
          </div>
          <span className="quiet-label">Refreshed on every library sync.</span>
        </div>
        <ListeningInsights />
      </section>
    </AppShell>
  )
}
