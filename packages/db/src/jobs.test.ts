import { describe, expect, it, vi } from 'vitest'
import {
  dailyBriefCron,
  reconciliationCron,
  scheduleDailyBrief,
  scheduleLibraryReconciliation,
} from './jobs.js'

describe('reconciliation scheduling', () => {
  it.each([
    [15, '*/15 * * * *'],
    [60, '0 */1 * * *'],
    [360, '0 */6 * * *'],
    [1_440, '0 0 * * *'],
  ])('maps %i minutes to a durable UTC cron schedule', (minutes, cron) => {
    expect(reconciliationCron(minutes)).toBe(cron)
  })

  it('rejects an interval that cannot be represented by the product schedule', () => {
    expect(() => reconciliationCron(45)).toThrow('Unsupported reconciliation interval')
  })

  it('upserts one named UTC schedule for the reconciliation queue', async () => {
    const schedule = vi.fn().mockResolvedValue(undefined)

    await scheduleLibraryReconciliation({ schedule }, 360)

    expect(schedule).toHaveBeenCalledWith(
      'library.reconcile',
      '0 */6 * * *',
      { trigger: 'scheduled' },
      { key: 'default', tz: 'UTC' },
    )
  })
})

describe('daily briefing scheduling', () => {
  it('maps a configured local time to a durable cron schedule', () => {
    expect(dailyBriefCron('08:00')).toBe('0 8 * * *')
    expect(dailyBriefCron('19:45')).toBe('45 19 * * *')
    expect(() => dailyBriefCron('8:00')).toThrow('Unsupported daily briefing time')
  })

  it('upserts one timezone-aware schedule for daily briefing generation', async () => {
    const schedule = vi.fn().mockResolvedValue(undefined)

    await scheduleDailyBrief({ schedule }, '07:30', 'Europe/London')

    expect(schedule).toHaveBeenCalledWith(
      'daily-brief.generate',
      '30 7 * * *',
      { trigger: 'scheduled' },
      { key: 'default', tz: 'Europe/London' },
    )
  })
})
