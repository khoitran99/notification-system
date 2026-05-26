import Redis from 'ioredis'
import { prisma, createQueuePublisher, setupQueues } from '@notification/shared'
import { createApp } from './app'
import { createOptInChecker } from './opt-in-checker'
import { createRateLimiter } from './rate-limiter'

const PORT         = Number(process.env.PORT)         || 3000
const HOST         = process.env.HOST                  || '0.0.0.0'
const REDIS_URL    = process.env.REDIS_URL             || 'redis://localhost:6379'
const RABBITMQ_URL = process.env.RABBITMQ_URL          || 'amqp://guest:guest@localhost:5672'

async function start(): Promise<void> {
  await setupQueues(RABBITMQ_URL)

  const redis       = new Redis(REDIS_URL)
  const publisher   = await createQueuePublisher(RABBITMQ_URL)
  const optInChecker = createOptInChecker({ prisma, redis })
  const rateLimiter  = createRateLimiter(redis)

  const app = createApp({ prisma, redis, publisher, optInChecker, rateLimiter })

  try {
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`notification-server listening on ${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    await publisher.close()
    await redis.quit()
    process.exit(1)
  }
}

start()
