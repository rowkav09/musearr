import { describe, expect, it } from 'vitest'
import { getConfig } from './index.js'

describe('getConfig', () => {
  it('normalises the browser origin and defaults proxy trust to false', () => {
    const config = getConfig({ MUSEARR_WEB_ORIGIN: 'https://musearr.local/setup' })

    expect(config.MUSEARR_WEB_ORIGIN).toBe('https://musearr.local')
    expect(config.MUSEARR_TRUST_PROXY).toBe(false)
    expect(config.MUSEARR_RECONCILIATION_INTERVAL_MINUTES).toBe(360)
  })

  it('accepts proxy trust only when it is explicitly enabled', () => {
    const config = getConfig({ MUSEARR_TRUST_PROXY: 'true' })

    expect(config.MUSEARR_TRUST_PROXY).toBe(true)
  })

  it('rejects a non-HTTP browser origin', () => {
    expect(() => getConfig({ MUSEARR_WEB_ORIGIN: 'file:///musearr' })).toThrow()
  })

  it('rejects an unsupported reconciliation interval', () => {
    expect(() => getConfig({ MUSEARR_RECONCILIATION_INTERVAL_MINUTES: '45' })).toThrow()
  })
})
