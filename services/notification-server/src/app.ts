import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify'
import type Redis from 'ioredis'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import type { PrismaClient, QueuePublisher } from '@notification/shared'
import type { OptInChecker } from './opt-in-checker'
import type { RateLimiter } from './rate-limiter'

export interface AppDeps {
  prisma:       PrismaClient
  redis:        Redis
  publisher:    QueuePublisher
  optInChecker: OptInChecker
  rateLimiter:  RateLimiter
}

const CACHE_TTL_SECONDS = 5 * 60
const CACHE_KEY = (appKey: string) => `cred:${appKey}`

async function resolveHashedSecret(appKey: string, { prisma, redis }: AppDeps): Promise<string | null> {
  const cached = await redis.get(CACHE_KEY(appKey))
  if (cached !== null) return cached

  const cred = await prisma.appCredential.findUnique({ where: { appKey } })
  if (!cred) return null

  await redis.set(CACHE_KEY(appKey), cred.hashedSecret, 'EX', CACHE_TTL_SECONDS)
  return cred.hashedSecret
}

export function createApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false })

  // ── Health check (no auth) ───────────────────────────────────────────────
  app.get('/health', async (_req, reply) => reply.send({ status: 'ok' }))

  // ── Auth hook for all other routes ───────────────────────────────────────
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.routeOptions.url === '/health') return

    const appKey    = request.headers['x-app-key']
    const appSecret = request.headers['x-app-secret']

    if (!appKey || !appSecret || Array.isArray(appKey) || Array.isArray(appSecret)) {
      return reply.status(401).send({ error: 'Missing or invalid credentials' })
    }

    const hashedSecret = await resolveHashedSecret(appKey, deps)
    if (!hashedSecret) return reply.status(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(appSecret, hashedSecret)
    if (!valid) return reply.status(401).send({ error: 'Invalid credentials' })
  })

  // ── POST /v1/email/send ──────────────────────────────────────────────────
  app.post('/v1/email/send', async (request, reply) => {
    const { user_id, to_address, subject, content, event_id } =
      request.body as {
        user_id:    string
        to_address: string
        subject:    string
        content:    string
        event_id?:  string
      }

    // Opt-in check
    const optedIn = await deps.optInChecker.isOptedIn(user_id, 'email')
    if (!optedIn) return reply.status(403).send({ error: 'User has opted out of email notifications' })

    // Rate limit check
    const { allowed } = await deps.rateLimiter.check(user_id, 'email')
    if (!allowed) return reply.status(429).send({ error: 'Rate limit exceeded' })

    // Enqueue
    const eventId = event_id ?? randomUUID()
    await deps.publisher.publish({
      event_id:   eventId,
      user_id,
      channel:    'email',
      to_address,
      subject,
      content,
      created_at: new Date(),
    })

    return reply.status(202).send({ event_id: eventId })
  })

  return app
}
