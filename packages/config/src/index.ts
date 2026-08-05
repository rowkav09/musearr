import { z } from 'zod'

const HttpOriginSchema = z
  .string()
  .trim()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      context.addIssue({ code: 'custom', message: 'Expected an HTTP(S) origin without credentials.' })
    }
  })
  .transform((value) => new URL(value).origin)

const EnvironmentBooleanSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true')

const reconciliationIntervals = [15, 30, 60, 120, 180, 240, 360, 480, 720, 1_440] as const

const ReconciliationIntervalSchema = z
  .coerce
  .number()
  .int()
  .refine((value) => reconciliationIntervals.includes(value as (typeof reconciliationIntervals)[number]), {
    message: `Choose one of: ${reconciliationIntervals.join(', ')} minutes.`,
  })

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().default('postgresql://musearr:musearr@localhost:5432/musearr'),
  MUSEARR_API_HOST: z.string().default('127.0.0.1'),
  MUSEARR_API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  MUSEARR_WEB_ORIGIN: HttpOriginSchema.default('http://localhost:3000'),
  MUSEARR_TRUST_PROXY: EnvironmentBooleanSchema,
  MUSEARR_RECONCILIATION_INTERVAL_MINUTES: ReconciliationIntervalSchema.default(360),
  MUSEARR_PLEX_WEBHOOK_SECRET: z.string().min(32).max(256).optional(),
  MUSEARR_ENCRYPTION_KEY: z.string().min(1).optional(),
  MUSEARR_SESSION_SECRET: z.string().min(32).optional(),
})

export type MusearrConfig = z.infer<typeof EnvironmentSchema>

export function getConfig(environment: NodeJS.ProcessEnv = process.env): MusearrConfig {
  return EnvironmentSchema.parse(environment)
}
