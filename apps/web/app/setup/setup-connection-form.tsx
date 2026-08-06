'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'

type MusicLibrary = { id: string; title: string; type: 'artist' }
type PlexConnection = {
  machineIdentifier: string
  serverName: string
  version: string | null
  musicLibraries: MusicLibrary[]
}
type StartResponse = { pinId: number; authUrl: string; expiresAt: string }
type StatusResponse =
  | { status: 'waiting' }
  | { status: 'connected'; connectionId: string; connection: PlexConnection }
type FormIssue = { detail?: string }

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
  const pollTimer = useRef<number | null>(null)
  const [connection, setConnection] = useState<PlexConnection | null>(null)
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([])
  const [ownerUsername, setOwnerUsername] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [state, setState] = useState<'idle' | 'authorising' | 'saving' | 'complete'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current)
    }
  }, [])

  async function poll(pinId: number, attemptsRemaining = 330): Promise<void> {
    if (attemptsRemaining <= 0) {
      setState('idle')
      setMessage('Plex sign-in expired. Try connecting again.')
      return
    }

    try {
      const response = await fetch(`/api/v1/setup/plex-auth/status/${pinId}`)
      if (!response.ok) throw new Error(await getIssue(response))
      const result = (await response.json()) as StatusResponse

      if (result.status === 'connected') {
        setConnection(result.connection)
        setConnectionId(result.connectionId)
        setSelectedLibraryIds(result.connection.musicLibraries.map((library) => library.id))
        setState('idle')
        setMessage(`Connected to ${result.connection.serverName}.`)
        return
      }

      pollTimer.current = window.setTimeout(() => void poll(pinId, attemptsRemaining - 1), 1800)
    } catch (error) {
      setState('idle')
      setMessage(error instanceof Error ? error.message : 'Musearr could not finish Plex sign-in.')
    }
  }

  async function connectPlex() {
    setState('authorising')
    setMessage('Opening Plex sign-in…')

    try {
      const response = await fetch('/api/v1/setup/plex-auth/start', { method: 'POST' })
      if (!response.ok) throw new Error(await getIssue(response))
      const result = (await response.json()) as StartResponse
      const popup = window.open(result.authUrl, 'musearr-plex-auth', 'popup,width=720,height=760')
      if (!popup) {
        window.location.href = result.authUrl
        return
      }
      setMessage('Approve Musearr in the Plex window. This page will continue automatically.')
      await poll(result.pinId)
    } catch (error) {
      setState('idle')
      setMessage(error instanceof Error ? error.message : 'Musearr could not start Plex sign-in.')
    }
  }

  function toggleLibrary(libraryId: string) {
    setSelectedLibraryIds((current) =>
      current.includes(libraryId)
        ? current.filter((id) => id !== libraryId)
        : [...current, libraryId],
    )
  }

  async function saveSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!connection || !connectionId || selectedLibraryIds.length === 0) {
      setMessage('Connect Plex and choose at least one music library.')
      return
    }

    setState('saving')
    setMessage(null)
    try {
      const response = await fetch('/api/v1/setup/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          plexConnectionId: connectionId,
          ownerUsername,
          ownerPassword,
          selectedLibraryIds,
        }),
      })
      if (!response.ok) throw new Error(await getIssue(response))
      setOwnerPassword('')
      setState('complete')
      setMessage('Your music room is ready. Musearr is preparing the first sync.')
      window.setTimeout(() => router.push('/'), 900)
    } catch (error) {
      setState('idle')
      setMessage(error instanceof Error ? error.message : 'Musearr could not save setup.')
    }
  }

  return (
    <div>
      <div className="setup-card__heading">
        <div className="setup-card__icon" aria-hidden="true">P</div>
        <div>
          <h2>Connect Plex</h2>
          <p>Sign in once. Musearr finds the reachable server automatically.</p>
        </div>
      </div>

      {!connection && (
        <div className="connection-form">
          <button
            className="primary-button"
            disabled={state !== 'idle'}
            onClick={() => void connectPlex()}
            type="button"
          >
            {state === 'authorising' ? 'Waiting for Plex…' : 'Sign in with Plex'}
          </button>
          <span className="field-hint">
            Your Plex token is handled by the local Musearr API and encrypted when setup is saved.
          </span>
        </div>
      )}

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
          </fieldset>

          <div className="owner-fields">
            <label>
              Local owner name
              <input
                autoComplete="username"
                minLength={3}
                onChange={(event) => setOwnerUsername(event.target.value)}
                placeholder="musicroom"
                required
                value={ownerUsername}
              />
            </label>
            <label>
              Local owner password
              <input
                autoComplete="new-password"
                minLength={12}
                onChange={(event) => setOwnerPassword(event.target.value)}
                placeholder="At least 12 characters"
                required
                type="password"
                value={ownerPassword}
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