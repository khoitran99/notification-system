import type Redis from 'ioredis'
import type { Channel } from '@notification/shared'

export interface RateLimitResult {
  allowed:   boolean
  remaining: number
}

export interface RateLimiter {
  check(userId: string, channel: Channel): Promise<RateLimitResult>
}

export interface RateLimiterOptions {
  /** Size of the sliding window in milliseconds. Default: 60 000 (1 min) */
  windowMs?: number
  /** Maximum requests allowed per window. Default: 100 */
  limit?: number
}

/**
 * Atomically slides the window, increments, and returns the allow/remaining
 * result.  Uses a Lua script so the three Redis operations are one round-trip
 * and cannot interleave.
 */
const SCRIPT = `
local key       = KEYS[1]
local now       = tonumber(ARGV[1])
local windowMs  = tonumber(ARGV[2])
local limit     = tonumber(ARGV[3])
local cutoff    = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, now .. '-' .. math.random(1, 1e9))
  redis.call('PEXPIRE', key, windowMs)
  return { 1, limit - count - 1 }
else
  return { 0, 0 }
end
`

export function createRateLimiter(redis: Redis, opts?: RateLimiterOptions): RateLimiter {
  const windowMs = opts?.windowMs ?? 60_000
  const limit    = opts?.limit    ?? 100

  return {
    async check(userId, channel): Promise<RateLimitResult> {
      const key = `rate:${userId}:${channel}`
      const now = Date.now()
      const result = await redis.eval(SCRIPT, 1, key, String(now), String(windowMs), String(limit)) as [number, number]
      return { allowed: result[0] === 1, remaining: result[1] }
    },
  }
}
