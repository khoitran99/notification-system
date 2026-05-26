import Redis from 'ioredis'
import { prisma } from '@notification/shared'
import { createApp } from './app'

const PORT      = Number(process.env.PORT)      || 3000
const HOST      = process.env.HOST               || '0.0.0.0'
const REDIS_URL = process.env.REDIS_URL          || 'redis://localhost:6379'

async function start(): Promise<void> {
  const redis = new Redis(REDIS_URL)

  const app = createApp({ prisma, redis })

  try {
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`notification-server listening on ${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    await redis.quit()
    process.exit(1)
  }
}

start()
