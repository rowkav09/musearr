import { getConfig } from '@musearr/config'
import { buildServer } from './server.js'

const config = getConfig()
const app = buildServer({ config })

async function start(): Promise<void> {
  try {
    await app.listen({ host: config.MUSEARR_API_HOST, port: config.MUSEARR_API_PORT })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

async function stop(signal: string): Promise<void> {
  app.log.info({ signal }, 'Stopping Musearr API')
  await app.close()
}

process.on('SIGINT', () => void stop('SIGINT'))
process.on('SIGTERM', () => void stop('SIGTERM'))

void start()
