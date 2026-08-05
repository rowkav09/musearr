import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <main className="error-page">
      <p className="eyebrow">NOT FOUND</p>
      <h1>There&apos;s no music here yet.</h1>
      <p>This page does not exist in your Musearr library.</p>
      <Link className="primary-button" href="/">Return home</Link>
    </main>
  )
}
