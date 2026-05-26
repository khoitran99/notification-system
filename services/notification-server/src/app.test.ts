import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Redis from 'ioredis'
import bcrypt from 'bcryptjs'
import { prisma } from '@notification/shared'
import { createApp } from './app'

const REDIS_URL = 'redis://localhost:6379'

let redis: Redis

beforeAll(async () => {
  redis = new Redis(REDIS_URL)
})

afterAll(async () => {
  await redis.quit()
  await prisma.$disconnect()
})

beforeEach(async () => {
  // Wipe any auth-related Redis keys and DB rows between tests
  await redis.flushdb()
  await prisma.appCredential.deleteMany()
})

// ── Behavior 1: health check bypasses auth ───────────────────────────────────
describe('Notification Server', () => {
  it('GET /health returns 200 without auth headers', async () => {
    const app = createApp({ prisma, redis })
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  // ── Behavior 2: missing x-app-key → 401 ─────────────────────────────────
  it('returns 401 when x-app-key header is missing', async () => {
    const app = createApp({ prisma, redis })
    const res = await app.inject({
      method:  'GET',
      url:     '/any-protected-route',
      headers: { 'x-app-secret': 'some-secret' },
    })

    expect(res.statusCode).toBe(401)
  })

  // ── Behavior 3: missing x-app-secret → 401 ──────────────────────────────
  it('returns 401 when x-app-secret header is missing', async () => {
    const app = createApp({ prisma, redis })
    const res = await app.inject({
      method:  'GET',
      url:     '/any-protected-route',
      headers: { 'x-app-key': 'some-key' },
    })

    expect(res.statusCode).toBe(401)
  })

  // ── Behavior 4: valid credentials pass auth ───────────────────────────────
  it('does not return 401 when appKey + appSecret are valid (DB lookup)', async () => {
    const secret       = 'super-secret-123'
    const hashedSecret = await bcrypt.hash(secret, 10)
    await prisma.appCredential.create({
      data: { appKey: 'key-valid', hashedSecret },
    })

    const app = createApp({ prisma, redis })
    const res = await app.inject({
      method:  'GET',
      url:     '/any-protected-route',
      headers: { 'x-app-key': 'key-valid', 'x-app-secret': secret },
    })

    expect(res.statusCode).not.toBe(401)
  })

  // ── Behavior 5: wrong secret → 401 ───────────────────────────────────────
  it('returns 401 when appSecret does not match the stored hash', async () => {
    const hashedSecret = await bcrypt.hash('correct-secret', 10)
    await prisma.appCredential.create({
      data: { appKey: 'key-wrong-secret', hashedSecret },
    })

    const app = createApp({ prisma, redis })
    const res = await app.inject({
      method:  'GET',
      url:     '/any-protected-route',
      headers: { 'x-app-key': 'key-wrong-secret', 'x-app-secret': 'wrong-secret' },
    })

    expect(res.statusCode).toBe(401)
  })

  // ── Behavior 6: Redis cache — no DB row needed after cache is warm ────────
  it('succeeds using the Redis cache even when no DB row exists', async () => {
    const secret       = 'cached-secret'
    const hashedSecret = await bcrypt.hash(secret, 10)

    // Seed Redis directly — no DB row
    await redis.set('cred:key-cached', hashedSecret, 'EX', 300)

    const app = createApp({ prisma, redis })
    const res = await app.inject({
      method:  'GET',
      url:     '/any-protected-route',
      headers: { 'x-app-key': 'key-cached', 'x-app-secret': secret },
    })

    expect(res.statusCode).not.toBe(401)
  })
})
