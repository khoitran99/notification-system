import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify'
import type Redis from 'ioredis'
import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@notification/shared'

export interface AppDeps {
  prisma: PrismaClient
  redis:  Redis
}

const CACHE_TTL_SECONDS = 5 * 60   // 5 minutes
const CACHE_KEY = (appKey: string) => `cred:${appKey}`

async function resolveHashedSecret(
  appKey: string,
  { prisma, redis }: AppDeps,
): Promise<string | null> {
  // Cache-first lookup
  const cached = await redis.get(CACHE_KEY(appKey))
  if (cached !== null) return cached

  // DB fallback
  const cred = await prisma.appCredential.findUnique({ where: { appKey } })
  if (!cred) return null

  await redis.set(CACHE_KEY(appKey), cred.hashedSecret, 'EX', CACHE_TTL_SECONDS)
  return cred.hashedSecret
}

export function createApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: true })

  // ── Health check (no auth) ─────────────────────────────────────────────────
  app.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok' })
  })

  // ── Auth hook for all other routes ────────────────────────────────────────
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.routeOptions.url === '/health') return

    const appKey    = request.headers['x-app-key']
    const appSecret = request.headers['x-app-secret']

    if (!appKey || !appSecret || Array.isArray(appKey) || Array.isArray(appSecret)) {
      return reply.status(401).send({ error: 'Missing or invalid credentials' })
    }

    const hashedSecret = await resolveHashedSecret(appKey, deps)
    if (!hashedSecret) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(appSecret, hashedSecret)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }
  })

  return app
}
