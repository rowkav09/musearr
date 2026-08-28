'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'

type LidarrStatus = {
  configured: boolean
  baseUrl: string | null
  instanceName: string | null
  version: string | null
  rootFolderPath: string | null
  qualityProfileId: number | null
  metadataProfileId: number | null
  lastCheckedAt: string | null
}

type NamedId = { id: number; name: string }
type RootFolder = { id: number; path: string; freeSpaceBytes: number | null }

type TestResult = {
  version: string
  instanceName: string | null
  rootFolders: RootFolder[]
  qualityProfiles: NamedId[]
  metadataProfiles: NamedId[]
}

type ViewState = 'loading' | 'ready' | 'signed_out' | 'forbidden' | 'unavailable'

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail ?? 'Musearr could not complete that request.'
  } catch {
    return 'Musearr could not complete that request.'
  }
}

function formatDate(value: string | null): string {
  if (!value) return 'never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'recently' : date.toLocaleString()
}

export function LidarrSettings() {
  const [view, setView] = useState<ViewState>('loading')
  const [status, setStatus] = useState<LidarrStatus | null>(null)

  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [test, setTest] = useState<TestResult | null>(null)
  const [rootFolderPath, setRootFolderPath] = useState('')
  const [qualityProfileId, setQualityProfileId] = useState<number | ''>('')
  const [metadataProfileId, setMetadataProfileId] = useState<number | ''>('')
  const [busy, setBusy] = useState<'idle' | 'testing' | 'saving'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('/api/v1/settings/lidarr', { signal: controller.signal })
        if (response.ok) {
          const payload = (await response.json()) as LidarrStatus
          setStatus(payload)
          if (payload.baseUrl) setBaseUrl(payload.baseUrl)
          setView('ready')
        } else if (response.status === 401) {
          setView('signed_out')
        } else if (response.status === 403) {
          setView('forbidden')
        } else {
          setView('unavailable')
        }
      } catch {
        if (!controller.signal.aborted) setView('unavailable')
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  async function runTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('testing')
    setMessage(null)
    setOk(false)
    try {
      const response = await fetch('/api/v1/settings/lidarr/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() }),
      })
      if (!response.ok) throw new Error(await readDetail(response))
      const result = (await response.json()) as TestResult
      setTest(result)
      setRootFolderPath(status?.rootFolderPath ?? result.rootFolders[0]?.path ?? '')
      setQualityProfileId(status?.qualityProfileId ?? result.qualityProfiles[0]?.id ?? '')
      setMetadataProfileId(status?.metadataProfileId ?? result.metadataProfiles[0]?.id ?? '')
      setMessage(`Connected to ${result.instanceName ?? 'Lidarr'} ${result.version}. Choose the profiles and save.`)
      setOk(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Musearr could not reach Lidarr.')
    } finally {
      setBusy('idle')
    }
  }

  async function save() {
    setBusy('saving')
    setMessage(null)
    try {
      const response = await fetch('/api/v1/settings/lidarr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          ...(rootFolderPath ? { rootFolderPath } : {}),
          ...(qualityProfileId === '' ? {} : { qualityProfileId }),
          ...(metadataProfileId === '' ? {} : { metadataProfileId }),
        }),
      })
      if (!response.ok) throw new Error(await readDetail(response))
      const payload = (await response.json()) as LidarrStatus
      setStatus(payload)
      setApiKey('')
      setTest(null)
      setMessage('Saved. Playlist generation can now acquire missing tracks through Lidarr.')
      setOk(true)
    } catch (error) {
      setOk(false)
      setMessage(error instanceof Error ? error.message : 'Musearr could not save the connection.')
    } finally {
      setBusy('idle')
    }
  }

  if (view === 'loading') {
    return (
      <div className="connection-banner" aria-live="polite">
        <span className="status-dot" />
        <span>Loading Lidarr settings…</span>
      </div>
    )
  }
  if (view === 'signed_out') {
    return (
      <div className="empty-intelligence">
        <strong>Sign in to manage Lidarr.</strong>
        <Link className="secondary-button" href="/login">
          Sign in
        </Link>
      </div>
    )
  }
  if (view === 'forbidden') {
    return (
      <div className="empty-intelligence">
        <strong>Owner only.</strong>
        <span>Integrations can only be changed by the local owner account.</span>
      </div>
    )
  }
  if (view === 'unavailable' || !status) {
    return (
      <div className="connection-banner connection-banner--warning" role="status">
        <span className="status-dot status-dot--warning" />
        <span>Waiting for the local Musearr service.</span>
      </div>
    )
  }

  return (
    <div className="settings-panel">
      <div className="settings-status-row">
        <span className={`source-pill source-pill--${status.configured ? 'on' : 'off'}`}>
          {status.configured ? 'Connected' : 'Not connected'}
        </span>
        {status.configured && status.instanceName && (
          <span className="source-pill source-pill--environment">
            {status.instanceName} {status.version ?? ''}
          </span>
        )}
        {status.configured && (
          <span className="quiet-label">Last checked {formatDate(status.lastCheckedAt)}</span>
        )}
      </div>

      {status.configured && (
        <p className="field-hint">
          Root folder <code>{status.rootFolderPath ?? '—'}</code>. Re-test and save below to change the
          connection or profiles.
        </p>
      )}

      <form className="connection-form" onSubmit={runTest}>
        <label>
          Lidarr URL
          <input
            autoComplete="url"
            inputMode="url"
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="http://lidarr:8686"
            required
            type="url"
            value={baseUrl}
          />
          <span className="field-hint">An address this Musearr container can reach.</span>
        </label>
        <label>
          API key
          <input
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={status.configured ? 'Enter to change' : 'Lidarr → Settings → General'}
            required
            type="password"
            value={apiKey}
          />
          <span className="field-hint">Encrypted at rest; never returned to this browser.</span>
        </label>
        <button className="secondary-button" disabled={busy !== 'idle'} type="submit">
          {busy === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
      </form>

      {test && (
        <form
          className="connection-form connection-form--complete"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label>
            Root folder
            <select onChange={(event) => setRootFolderPath(event.target.value)} value={rootFolderPath}>
              {test.rootFolders.map((folder) => (
                <option key={folder.id} value={folder.path}>
                  {folder.path}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quality profile
            <select
              onChange={(event) => setQualityProfileId(Number(event.target.value))}
              value={qualityProfileId}
            >
              {test.qualityProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Metadata profile
            <select
              onChange={(event) => setMetadataProfileId(Number(event.target.value))}
              value={metadataProfileId}
            >
              {test.metadataProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" disabled={busy !== 'idle'} type="submit">
            {busy === 'saving' ? 'Saving…' : 'Save connection'}
          </button>
        </form>
      )}

      {message && (
        <p className={`form-message ${ok ? 'form-message--success' : ''}`.trim()} role="status">
          {message}
        </p>
      )}
    </div>
  )
}
