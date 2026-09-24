import { describe, expect, it } from 'vitest'
import { resumableProgressFromRun } from './repository.js'

const failedRun = {
  status: 'failed',
  error_summary: 'upstream_unavailable: Plex is temporarily unavailable.',
  cursor: { offset: 400 },
  counts: { importedTracks: 395, skippedTracks: 5 },
  recent: true,
}

describe('resumableProgressFromRun', () => {
  it.each(['upstream_unavailable', 'upstream_response', 'unknown'])('resumes after a recent %s failure', (classification) => {
    expect(resumableProgressFromRun({ ...failedRun, error_summary: `${classification}: summary` })).toEqual({
      offset: 400,
      importedTracks: 395,
      skippedTracks: 5,
    })
  })

  it.each(['configuration', 'authentication'])('starts fresh after a non-retryable %s failure', (classification) => {
    expect(resumableProgressFromRun({ ...failedRun, error_summary: `${classification}: summary` })).toBeNull()
  })

  it('starts fresh after a completed or running run', () => {
    expect(resumableProgressFromRun({ ...failedRun, status: 'completed' })).toBeNull()
    expect(resumableProgressFromRun({ ...failedRun, status: 'running' })).toBeNull()
  })

  it('starts fresh when there is no previous run, it is stale, or it saved no progress', () => {
    expect(resumableProgressFromRun(undefined)).toBeNull()
    expect(resumableProgressFromRun({ ...failedRun, recent: false })).toBeNull()
    expect(resumableProgressFromRun({ ...failedRun, cursor: { offset: 0 } })).toBeNull()
    expect(resumableProgressFromRun({ ...failedRun, cursor: {} })).toBeNull()
    expect(resumableProgressFromRun({ ...failedRun, error_summary: null })).toBeNull()
  })

  it('ignores malformed counts rather than carrying garbage forward', () => {
    expect(resumableProgressFromRun({ ...failedRun, counts: { importedTracks: -3, skippedTracks: 'x' } })).toEqual({
      offset: 400,
      importedTracks: 0,
      skippedTracks: 0,
    })
  })
})
