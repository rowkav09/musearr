import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), '../migrations')

async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations.')
  }

  const database = postgres(databaseUrl, { max: 1, connect_timeout: 8 })
  try {
    await database`
      CREATE TABLE IF NOT EXISTS musearr_schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT NOW()
      )
    `

    const applied = await database<Array<{ name: string }>>`
      SELECT name FROM musearr_schema_migrations
    `
    const appliedNames = new Set(applied.map((migration) => migration.name))
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort()

    for (const name of migrationFiles) {
      if (appliedNames.has(name)) {
        continue
      }

      const source = await readFile(join(migrationDirectory, name), 'utf8')
      await database.begin(async (transaction) => {
        await transaction.unsafe(source)
        await transaction`INSERT INTO musearr_schema_migrations (name) VALUES (${name})`
      })
      console.info(`Applied migration ${name}`)
    }
  } finally {
    await database.end({ timeout: 5 })
  }
}

migrate().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
