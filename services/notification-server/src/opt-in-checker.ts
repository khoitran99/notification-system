import type Redis from 'ioredis'
import type { PrismaClient } from '@notification/shared'
import type { Channel } from '@notification/shared'

const OPT_IN_TTL = 5 * 60   // 5 minutes
const cacheKey   = (userId: string, channel: Channel) => `optin:${userId}:${channel}`

export interface OptInChecker {
  isOptedIn(userId: string, channel: Channel): Promise<boolean>
}

export function createOptInChecker(deps: { prisma: PrismaClient; redis: Redis }): OptInChecker {
  const { prisma, redis } = deps

  return {
    async isOptedIn(userId, channel): Promise<boolean> {
      const key    = cacheKey(userId, channel)
      const cached = await redis.get(key)
      if (cached !== null) return cached === '1'

      const setting = await prisma.notificationSetting.findUnique({
        where: { userId_channel: { userId: BigInt(userId), channel } },
      })

      const optIn = setting?.optIn ?? false
      await redis.set(key, optIn ? '1' : '0', 'EX', OPT_IN_TTL)
      return optIn
    },
  }
}
