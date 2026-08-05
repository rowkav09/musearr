import { z } from 'zod'

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().default('postgresql://musearr:musearr@localhost:5432/musearr'),
  MUSEARR_API_HOST: z.string().default('127.0.0.1'),
  MUSEARR_API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  MUSEARR_WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  MUSEARR_ENCRYPTION_KEY: z.string().min(1).optional(),
  MUSEARR_SESSION_SECRET: z.string().min(32).optional(),
})

export type MusearrConfig = z.infer<typeof EnvironmentSchema>

export function getConfig(environment: NodeJS.ProcessEnv = process.env): MusearrConfig {
  return EnvironmentSchema.parse(environment)
}
