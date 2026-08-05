'use client'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="error-page">
      <p className="eyebrow">A QUIET INTERRUPTION</p>
      <h1>Musearr lost the thread.</h1>
      <p>Nothing in your music library was changed. Try opening this page again.</p>
      <button className="primary-button" onClick={reset} type="button">Try again</button>
    </main>
  )
}
