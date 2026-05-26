import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Redis from 'ioredis'
import bcrypt from 'bcryptjs'
import {
  prisma,
  createQueuePublisher,
  createQueueConsumer,
  setupQueues,
  type QueuePublisher,
} from '@notification/shared'
import { createApp, type AppDeps } from './app'
import { createOptInChecker } from './opt-in-checker'
import { createRateLimiter } from './rate-limiter'
import type { EmailNotificationEvent } from '@notification/shared'

const RABBITMQ_URL = 'amqp://guest:guest@localhost:5672'
const REDIS_URL    = 'redis://localhost:6379'

let redis: Redis

// Shared no-op publisher for tests that don't exercise the queue
const noopPublisher: QueuePublisher = {
  publish: async () => {},
  close:   async () => {},
}

beforeAll(async () => {
  redis = new Redis(REDIS_URL)
  await setupQueues(RABBITMQ_URL)
})

afterAll(async () => {
  await redis.quit()
  await prisma.$disconnect()
})

beforeEach(async () => {
  await redis.flushdb()
  await prisma.appCredential.deleteMany()
  await prisma.notificationSetting.deleteMany()
  await prisma.notificationLog.deleteMany()
  await prisma.user.deleteMany()
})

/** Builds a test app using real Redis/Prisma deps + sensible defaults. */
function makeApp(overrides: Partial<AppDeps> = {}): ReturnType<typeof createApp> {
  return createApp({
    prisma,
    redis,
    publisher:    noopPublisher,
    optInChecker: createOptInChecker({ prisma, redis }),
    rateLimiter:  createRateLimiter(redis),
    ...overrides,
  })
}

// ── Seeding helpers ───────────────────────────────────────────────────────────

async function seedAppKey(appKey = 'key-test', secret = 'secret-test') {
  const hashedSecret = await bcrypt.hash(secret, 10)
  await prisma.appCredential.create({ data: { appKey, hashedSecret } })
  return { appKey, secret, hashedSecret }
}

async function seedUser(opts: { email: string; optInEmail?: boolean }) {
  const user = await prisma.user.create({ data: { email: opts.email } })
  if (opts.optInEmail !== undefined) {
    await prisma.notificationSetting.create({
      data: { userId: user.id, channel: 'email', optIn: opts.optInEmail },
    })
  }
  return user
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth middleware (pre-existing)
// ─────────────────────────────────────────────────────────────────────────────

describe('Notification Server', () => {
  it('GET /health returns 200 without auth headers', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('returns 401 when x-app-key header is missing', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'GET', url: '/any',
      headers: { 'x-app-secret': 'x' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when x-app-secret header is missing', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'GET', url: '/any',
      headers: { 'x-app-key': 'x' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('does not return 401 when appKey + appSecret are valid (DB lookup)', async () => {
    const { appKey, secret } = await seedAppKey()
    const app = makeApp()
    const res = await app.inject({
      method: 'GET', url: '/any',
      headers: { 'x-app-key': appKey, 'x-app-secret': secret },
    })
    expect(res.statusCode).not.toBe(401)
  })

  it('returns 401 when appSecret does not match the stored hash', async () => {
    const { appKey } = await seedAppKey('key-wrong', 'correct')
    const app = makeApp()
    const res = await app.inject({
      method: 'GET', url: '/any',
      headers: { 'x-app-key': appKey, 'x-app-secret': 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('succeeds using the Redis cache even when no DB row exists', async () => {
    const secret       = 'cached-secret'
    const hashedSecret = await bcrypt.hash(secret, 10)
    await redis.set('cred:key-cached', hashedSecret, 'EX', 300)
    const app = makeApp()
    const res = await app.inject({
      method: 'GET', url: '/any',
      headers: { 'x-app-key': 'key-cached', 'x-app-secret': secret },
    })
    expect(res.statusCode).not.toBe(401)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/email/send
  // ─────────────────────────────────────────────────────────────────────────

  it('POST /v1/email/send returns 202 and publishes to email queue when opted-in and within rate limit', async () => {
    const { appKey, secret } = await seedAppKey()
    const user               = await seedUser({ email: 'alice@example.com', optInEmail: true })
    const publisher          = await createQueuePublisher(RABBITMQ_URL)
    const consumer           = await createQueueConsumer(RABBITMQ_URL)
    const app = makeApp({ publisher })

    const received = new Promise<EmailNotificationEvent>((resolve) => {
      consumer.consume('email', async (event, ack) => {
        ack()
        resolve(event as EmailNotificationEvent)
      })
    })

    const res = await app.inject({
      method:  'POST',
      url:     '/v1/email/send',
      headers: { 'x-app-key': appKey, 'x-app-secret': secret, 'content-type': 'application/json' },
      payload: {
        user_id:    String(user.id),
        to_address: 'alice@example.com',
        subject:    'Hello',
        content:    '<p>Hello</p>',
      },
    })

    expect(res.statusCode).toBe(202)
    const queued = await received
    expect(queued.channel).toBe('email')
    expect(queued.to_address).toBe('alice@example.com')
    expect(queued.subject).toBe('Hello')

    await publisher.close()
    await consumer.close()
  }, 15_000)

  it('POST /v1/email/send returns 403 for an opted-out user', async () => {
    const { appKey, secret } = await seedAppKey()
    const user               = await seedUser({ email: 'bob@example.com', optInEmail: false })
    const app = makeApp()

    const res = await app.inject({
      method:  'POST',
      url:     '/v1/email/send',
      headers: { 'x-app-key': appKey, 'x-app-secret': secret, 'content-type': 'application/json' },
      payload: {
        user_id:    String(user.id),
        to_address: 'bob@example.com',
        subject:    'Hi',
        content:    'text',
      },
    })

    expect(res.statusCode).toBe(403)
  })

  it('POST /v1/email/send returns 429 when rate limit is exceeded', async () => {
    const { appKey, secret } = await seedAppKey()
    const user               = await seedUser({ email: 'carol@example.com', optInEmail: true })
    // Rate limiter with limit=2 — 3rd request triggers 429
    const app = makeApp({ rateLimiter: createRateLimiter(redis, { limit: 2, windowMs: 60_000 }) })

    const authHeaders = {
      'x-app-key': appKey, 'x-app-secret': secret, 'content-type': 'application/json',
    }
    const body = { user_id: String(user.id), to_address: 'carol@example.com', subject: 'Hi', content: 'text' }

    await app.inject({ method: 'POST', url: '/v1/email/send', headers: authHeaders, payload: body })
    await app.inject({ method: 'POST', url: '/v1/email/send', headers: authHeaders, payload: body })
    const res = await app.inject({ method: 'POST', url: '/v1/email/send', headers: authHeaders, payload: body })

    expect(res.statusCode).toBe(429)
  })
})
