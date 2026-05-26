import type { PrismaClient } from './generated/prisma'
import { NotificationStatus } from './generated/prisma'
import type { NotificationEvent } from './notification-event'

export { NotificationStatus }

export interface LogEntry {
  id:        bigint
  eventId:   string
  userId:    bigint
  channel:   string
  status:    NotificationStatus
  createdAt: Date
}

export interface NotificationLogRepository {
  /** Returns the first log entry for the given eventId, or null if not found. */
  findByEventId(eventId: string): Promise<LogEntry | null>
  /** Appends a new log entry for the event. */
  record(event: NotificationEvent, status: NotificationStatus): Promise<void>
}

export function createNotificationLogRepository(prisma: PrismaClient): NotificationLogRepository {
  return {
    async findByEventId(eventId): Promise<LogEntry | null> {
      const row = await prisma.notificationLog.findFirst({ where: { eventId } })
      if (!row) return null
      return {
        id:        row.id,
        eventId:   row.eventId,
        userId:    row.userId,
        channel:   row.channel,
        status:    row.status,
        createdAt: row.createdAt,
      }
    },

    async record(event, status): Promise<void> {
      await prisma.notificationLog.create({
        data: {
          eventId: event.event_id,
          userId:  BigInt(event.user_id),
          channel: event.channel,
          status,
        },
      })
    },
  }
}
