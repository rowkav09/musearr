'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type MusicLibrary = { id: string; title: string; type: 'artist' }
type PlexConnection = {
  machineIdentifier: string
  serverName: string
  version: string | null
  musicLibraries: MusicLibrary[]
}

type FormIssue = { detail?: string }

const initialForm = {
  baseUrl: '',
  token: '',
  ownerUsername: '',
  ownerPassword: '',
}

async function getIssue(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as FormIssue
    return body.detail ?? 'Musearr could not complete that request.'
  } catch {
    return 'Musearr could not complete that request.'
  }
}

export function SetupConnectionForm() {
  const router = useRouter()
  const [form, setForm] = useState(initialForm)
  const [connection, setConnection] = useState<PlexConnection | null>(null)
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([])
  const [state, setState] = useState<'idle' | 'testing' | 'saving' | 'complete'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    if (field === 'baseUrl' || field === 'token') {
      setConnection(null)
      setSelectedLibraryIds([])
    }
    setMessage(null)
  }

  async function testConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('testing')
    setMessage(null)

    try {
      const response = await fetch('/api/v1/setup/test-plex', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseUrl: form.baseUrl, token: form.token }),
      })
      if (!response.ok) {
        throw new Error(await getIssue(response))
      }
      const result = (await response.json()) as PlexConnection
      setConnection(result)
      setSelectedLibraryIds(result.musicLibraries.map((library) => library.id))
      setMessage(`Connected to ${result.serverName}. Choose the music libraries Musearr should understand.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Musearr could not reach Plex.')
    } finally {
      setState('idle')
    }
  }

  function toggleLibrary(libraryId: string) {
    setSelectedLibraryIds((current) =>
      current.includes(libraryId)
        ? current.filter((id) => id !== libraryId)
        : [...current, libraryId],
    )
    setMessage(null)
  }

  async function saveSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!connection || selectedLibraryIds.length === 0) {
      setMessage('Choose at least one Plex music library before continuing.')
      return
    }

    setState('saving')
    setMessage(null)
    try {
      const response = await fetch('/api/v1/setup/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, selectedLibraryIds }),
      })
      if (!response.ok) {
        throw new Error(await getIssue(response))
      }
      setForm((current) => ({ ...current, token: '', ownerPassword: '' }))
      setState('complete')
      setMessage('Your music room is ready. Your first sync has been queued; Musearr will show its recorded status on the dashboard.')
      window.setTimeout(() => router.push('/'), 900)
    } catch (error) {
      setState('idle')
      setMessage(error instanceof Error ? error.message : 'Musearr could not save this connection.')
    }
  }

  return (
    <div>
      <div className="setup-card__heading">
        <div className="setup-card__icon" aria-hidden="true">P</div>
        <div>
          <h2>Connect Plex</h2>
          <p>Test the connection before Musearr stores it.</p>
        </div>
      </div>

      <form className="connection-form" onSubmit={testConnection}>
        <label>
          Plex server address
          <input
            autoComplete="url"
            inputMode="url"
            onChange={(event) => updateField('baseUrl', event.target.value)}
            placeholder="http://plex.local:32400"
            required
            type="url"
            value={form.baseUrl}
          />
          <span className="field-hint">Use the server address available from this Musearr host.</span>
        </label>
        <label>
          Plex token
          <input
            autoComplete="off"
            onChange={(event) => updateField('token', event.target.value)}
            placeholder="Your Plex token"
            required
            type="password"
            value={form.token}
          />
          <span className="field-hint">Encrypted at rest; never returned to this browser.</span>
        </label>
        <button className="secondary-button" disabled={state !== 'idle'} type="submit">
          {state === 'testing' ? 'Testing connection…' : 'Test connection'}
        </button>
      </form>

      {connection && (
        <form className="connection-form connection-form--complete" onSubmit={saveSetup}>
          <div className="verified-server">
            <span className="verified-server__check" aria-hidden="true">✓</span>
            <span>
              <strong>{connection.serverName}</strong>
              <small>{connection.version ? `Plex Media Server ${connection.version}` : 'Plex Media Server'}</small>
            </span>
          </div>
          <fieldset>
            <legend>Music libraries to include</legend>
            {connection.musicLibraries.length === 0 ? (
              <p className="empty-library-note">Plex did not return a music library for this token.</p>
            ) : (
              <div className="library-options">
                {connection.musicLibraries.map((library) => (
                  <label className="library-option" key={library.id}>
                    <input
                      checked={selectedLibraryIds.includes(library.id)}
                      onChange={() => toggleLibrary(library.id)}
                      type="checkbox"
                    />
                    <span>{library.title}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="owner-fields">
            <label>
              Local owner name
              <input
                autoComplete="username"
                minLength={3}
                onChange={(event) => updateField('ownerUsername', event.target.value)}
                placeholder="musicroom"
                required
                value={form.ownerUsername}
              />
            </label>
            <label>
              Local owner password
              <input
                autoComplete="new-password"
                minLength={12}
                onChange={(event) => updateField('ownerPassword', event.target.value)}
                placeholder="At least 12 characters"
                required
                type="password"
                value={form.ownerPassword}
              />
            </label>
          </div>
          <button className="primary-button" disabled={state !== 'idle'} type="submit">
            {state === 'saving' ? 'Saving securely…' : state === 'complete' ? 'All set' : 'Save and begin'}
          </button>
        </form>
      )}

      {message && <p className={connection ? 'form-message form-message--success' : 'form-message'} role="status">{message}</p>}
    </div>
  )
}
