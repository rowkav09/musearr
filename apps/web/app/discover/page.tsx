import type { Metadata } from 'next'
import { AppShell } from '../_components/app-shell'
import { Discover } from '../_components/discover'

export const metadata: Metadata = { title: 'Discover' }

export default function DiscoverPage() {
  return (
    <AppShell active="Discover">
      <section className="welcome-section" aria-labelledby="discover-title">
        <div>
          <p className="eyebrow">DISCOVER</p>
          <h1 id="discover-title">Your library, rediscovered.</h1>
          <p className="welcome-copy">
            Four explainable takes on your own collection — every pick comes with a factual reason.
            Deterministic by default; local AI only rewords the reason when it is enabled.
          </p>
        </div>
      </section>

      <section className="section-block" aria-labelledby="mixes-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MIXES</p>
            <h2 id="mixes-title">Generated locally, on demand</h2>
          </div>
          <span className="quiet-label">Never a black box.</span>
        </div>
        <Discover />
      </section>
    </AppShell>
  )
}
