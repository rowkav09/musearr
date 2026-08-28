'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type ProviderName = 'none' | 'ollama'

type LocalAiStatus = {
  enabled: boolean
  provider: ProviderName
  model: string | null
  baseUrl: string | null
  keepAliveSeconds: number | null
  autoStart: boolean
  source: 'environment' | 'database'
  reachable: boolean | null
}

type KeepAliveMode = 'default' | 'unload' | 'resident' | 'custom'

type FormModel = {
  enabled: boolean
  provider: ProviderName
  baseUrl: string
  model: string
  keepAliveMode: KeepAliveMode
  keepAliveCustom: string
  autoStart: boolean
}

type ViewState = 'loading' | 'ready' | 'signed_out' | 'forbidden' | 'unavailable'
type SaveState = 'idle' | 'saving' | 'saved' | 'failed'
type TestState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'done'; reachable: boolean }
  | { phase: 'error'; detail: string }

function statusToForm(status: LocalAiStatus): FormModel {
  const keepAlive = status.keepAliveSeconds
  const keepAliveMode: KeepAliveMode =
    keepAlive === null ? 'default' : keepAlive === 0 ? 'unload' : keepAlive === -1 ? 'resident' : 'custom'
  return {
    enabled: status.enabled,
    provider: status.provider,
    baseUrl: status.baseUrl ?? '',
    model: status.model ?? '',
    keepAliveMode,
    keepAliveCustom: keepAliveMode === 'custom' ? String(keepAlive) : '',
    autoStart: status.autoStart,
  }
}

/** Returns the numeric keep_alive, or a validation error string. */
function resolveKeepAlive(form: FormModel): { value: number | null } | { error: string } {
  switch (form.keepAliveMode) {
    case 'default':
      return { value: null }
    case 'unload':
      return { value: 0 }
    case 'resident':
      return { value: -1 }
    case 'custom': {
      const trimmed = form.keepAliveCustom.trim()
      if (trimmed === '') {
        return { value: null }
      }
      const parsed = Number.parseInt(trimmed, 10)
      if (!Number.isInteger(parsed) || String(parsed) !== trimmed || parsed < 1 || parsed > 86_400) {
        return { error: 'Keep-alive seconds must be a whole number between 1 and 86400.' }
      }
      return { value: parsed }
    }
  }
}

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail ?? 'Musearr could not complete that request.'
  } catch {
    return 'Musearr could not complete that request.'
  }
}

export function LocalAiSettings() {
  const [view, setView] = useState<ViewState>('loading')
  const [status, setStatus] = useState<LocalAiStatus | null>(null)
  const [form, setForm] = useState<FormModel | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [test, setTest] = useState<TestState>({ phase: 'idle' })

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('/api/v1/settings/local-ai', { signal: controller.signal })
        if (response.ok) {
          const payload = (await response.json()) as LocalAiStatus
          setStatus(payload)
          setForm(statusToForm(payload))
          setView('ready')
          return
        }
        if (response.status === 401) {
          setView('signed_out')
          return
        }
        if (response.status === 403) {
          setView('forbidden')
          return
        }
        setView('unavailable')
      } catch {
        if (!controller.signal.aborted) {
          setView('unavailable')
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  function patchForm(patch: Partial<FormModel>) {
    setForm((current) => (current ? { ...current, ...patch } : current))
    setSaveState('idle')
    setMessage(null)
    setTest({ phase: 'idle' })
  }

  async function save() {
    if (!form) {
      return
    }
    const keepAlive = resolveKeepAlive(form)
    if ('error' in keepAlive) {
      setSaveState('failed')
      setMessage(keepAlive.error)
      return
    }

    setSaveState('saving')
    setMessage(null)
    try {
      const response = await fetch('/api/v1/settings/local-ai', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: form.enabled,
          provider: form.provider,
          baseUrl: form.baseUrl.trim() === '' ? null : form.baseUrl.trim(),
          model: form.model.trim() === '' ? null : form.model.trim(),
          keepAliveSeconds: keepAlive.value,
          autoStart: form.autoStart,
        }),
      })
      if (!response.ok) {
        throw new Error(await readDetail(response))
      }
      const payload = (await response.json()) as LocalAiStatus
      setStatus(payload)
      setForm(statusToForm(payload))
      setSaveState('saved')
      setMessage('Saved. This override now takes precedence over the environment.')
    } catch (error) {
      setSaveState('failed')
      setMessage(error instanceof Error ? error.message : 'Musearr could not save these settings.')
    }
  }

  async function revertToEnvironment() {
    setSaveState('saving')
    setMessage(null)
    try {
      const response = await fetch('/api/v1/settings/local-ai', { method: 'DELETE' })
      if (!response.ok) {
        throw new Error(await readDetail(response))
      }
      const payload = (await response.json()) as LocalAiStatus
      setStatus(payload)
      setForm(statusToForm(payload))
      setSaveState('saved')
      setMessage('Override cleared. Local AI now follows the MUSEARR_LOCAL_AI_* environment values.')
    } catch (error) {
      setSaveState('failed')
      setMessage(error instanceof Error ? error.message : 'Musearr could not clear the override.')
    }
  }

  async function runTest() {
    if (!form) {
      return
    }
    if (form.provider !== 'ollama') {
      setTest({ phase: 'done', reachable: false })
      return
    }
    if (form.baseUrl.trim() === '' || form.model.trim() === '') {
      setTest({ phase: 'error', detail: 'Enter an endpoint URL and model before testing.' })
      return
    }

    setTest({ phase: 'testing' })
    try {
      const response = await fetch('/api/v1/settings/local-ai/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          baseUrl: form.baseUrl.trim(),
          model: form.model.trim(),
        }),
      })
      if (!response.ok) {
        throw new Error(await readDetail(response))
      }
      const payload = (await response.json()) as { reachable: boolean }
      setTest({ phase: 'done', reachable: payload.reachable })
    } catch (error) {
      setTest({
        phase: 'error',
        detail: error instanceof Error ? error.message : 'Musearr could not reach that endpoint.',
      })
    }
  }

  if (view === 'loading') {
    return (
      <div className="connection-banner" aria-live="polite">
        <span className="status-dot" />
        <span>Loading Local AI settings…</span>
      </div>
    )
  }

  if (view === 'signed_out') {
    return (
      <div className="empty-intelligence">
        <strong>Sign in to manage Local AI.</strong>
        <span>These settings are available to the local owner account.</span>
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
        <span>Local AI settings can only be changed by the local owner account.</span>
      </div>
    )
  }

  if (view === 'unavailable' || !form || !status) {
    return (
      <div className="connection-banner connection-banner--warning" role="status">
        <span className="status-dot status-dot--warning" />
        <span>Waiting for the local Musearr service.</span>
        <span className="banner-detail">Start the API and PostgreSQL, then refresh.</span>
      </div>
    )
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(statusToForm(status))
  const incompleteOllama =
    form.enabled && form.provider === 'ollama' && (form.baseUrl.trim() === '' || form.model.trim() === '')

  return (
    <div className="settings-panel">
      <div className="settings-status-row">
        <span className={`source-pill source-pill--${status.source}`}>
          {status.source === 'database' ? 'Saved override' : 'From environment'}
        </span>
        <span className={`source-pill source-pill--${status.enabled ? 'on' : 'off'}`}>
          {status.enabled ? 'Enabled' : 'Disabled'}
        </span>
        {status.source === 'database' && (
          <button
            className="linkish-button"
            disabled={saveState === 'saving'}
            onClick={() => void revertToEnvironment()}
            type="button"
          >
            Revert to environment defaults
          </button>
        )}
      </div>

      <form
        className="connection-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label className="settings-toggle">
          <input
            checked={form.enabled}
            onChange={(event) => patchForm({ enabled: event.target.checked })}
            type="checkbox"
          />
          <span>
            Enable Local AI
            <span className="field-hint">
              Off by default. When disabled, every ranking and playlist decision stays fully
              deterministic.
            </span>
          </span>
        </label>

        <label>
          Provider
          <select
            onChange={(event) => patchForm({ provider: event.target.value as ProviderName })}
            value={form.provider}
          >
            <option value="none">None</option>
            <option value="ollama">Ollama</option>
          </select>
          <span className="field-hint">Musearr only talks to a model runtime you host yourself.</span>
        </label>

        <label>
          Endpoint URL
          <input
            autoComplete="url"
            inputMode="url"
            onChange={(event) => patchForm({ baseUrl: event.target.value })}
            placeholder="http://localhost:11434"
            type="url"
            value={form.baseUrl}
          />
          <span className="field-hint">Your Ollama server address. HTTP(S), no credentials.</span>
        </label>

        <label>
          Model
          <input
            autoComplete="off"
            onChange={(event) => patchForm({ model: event.target.value })}
            placeholder="qwen2.5:3b"
            value={form.model}
          />
          <span className="field-hint">
            A model you have pulled on that server. See docs/LOCAL_AI.md for suggestions.
          </span>
        </label>

        <label>
          Keep model loaded
          <select
            onChange={(event) => patchForm({ keepAliveMode: event.target.value as KeepAliveMode })}
            value={form.keepAliveMode}
          >
            <option value="default">Provider default</option>
            <option value="unload">Unload after each call</option>
            <option value="resident">Keep resident</option>
            <option value="custom">Custom (seconds)</option>
          </select>
          <span className="field-hint">
            Maps to Ollama&apos;s <code>keep_alive</code>. &ldquo;Keep resident&rdquo; trades memory for
            a faster first suggestion.
          </span>
        </label>

        {form.keepAliveMode === 'custom' && (
          <label>
            Keep-alive seconds
            <input
              inputMode="numeric"
              onChange={(event) => patchForm({ keepAliveCustom: event.target.value })}
              placeholder="300"
              value={form.keepAliveCustom}
            />
            <span className="field-hint">Whole seconds, 1–86400. Leave blank for the provider default.</span>
          </label>
        )}

        <label className="settings-toggle">
          <input
            checked={form.autoStart}
            onChange={(event) => patchForm({ autoStart: event.target.checked })}
            type="checkbox"
          />
          <span>
            Auto-start the model runtime
            <span className="field-hint">
              Stored for a future capability that would launch the runtime on boot. Nothing acts on it
              yet.
            </span>
          </span>
        </label>

        {incompleteOllama && (
          <p className="form-message" role="status">
            Local AI is enabled but the endpoint or model is blank, so it will stay inactive until both
            are set.
          </p>
        )}

        <div className="settings-actions">
          <button
            className="secondary-button"
            disabled={test.phase === 'testing'}
            onClick={() => void runTest()}
            type="button"
          >
            {test.phase === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
          <button className="primary-button" disabled={!dirty || saveState === 'saving'} type="submit">
            {saveState === 'saving' ? 'Saving…' : 'Save settings'}
          </button>
        </div>

        {test.phase === 'done' && (
          <p
            className={`form-message ${test.reachable ? 'form-message--success' : ''}`.trim()}
            role="status"
          >
            {test.reachable
              ? 'Reachable. Musearr got a response from that endpoint.'
              : 'Not reachable. Check the URL, that Ollama is running, and that this host can see it.'}
          </p>
        )}
        {test.phase === 'error' && (
          <p className="form-message" role="status">
            {test.detail}
          </p>
        )}
        {message && (
          <p
            className={`form-message ${saveState === 'saved' ? 'form-message--success' : ''}`.trim()}
            role="status"
          >
            {message}
          </p>
        )}
      </form>

      <div className="settings-usage">
        <p className="eyebrow">WHAT LOCAL AI IS USED FOR</p>
        <ul>
          <li>
            <strong>Playlist generation gap suggestions.</strong> When a generated playlist needs
            tracks that are not in your library, Local AI proposes candidates — but only after the
            deterministic MusicBrainz/ListenBrainz source, and only as a top-up. Every failure
            (disabled, unreachable, unparseable) falls back to what the deterministic pipeline
            returned.
          </li>
          <li>
            <strong>Recommendation reason wording.</strong> After the deterministic ranker picks
            your Daily Mix and writes a factual reason for each track, Local AI can reword that one
            sentence in warmer prose using the same facts. The picks, the order, and the structured
            reasons never change; reworded lines are marked &ldquo;in its own words&rdquo;.
          </li>
        </ul>
        <p className="field-hint">
          Ranking, track selection, and the daily brief stay fully deterministic and never call a
          model.
        </p>
      </div>
    </div>
  )
}
