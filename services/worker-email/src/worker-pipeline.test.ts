import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest'
import { prisma, createNotificationLogRepository, NotificationStatus } from '@notification/shared'
import { createWorkerPipeline } from './worker-pipeline'
import type { ChannelAdapter } from './channel-adapter'
import type { EmailNotificationEvent } from '@notification/shared'

const emailEvent: EmailNotificationEvent = {
  event_id:   'evt-email-001',
  user_id:    '42',
  channel:    'email',
  to_address: 'alice@example.com',
  subject:    'Hello',
  content:    '<p>Hello</p>',
  created_at: new Date('2026-01-01T00:00:00Z'),
}

const successAdapter: ChannelAdapter = {
  send: vi.fn().mockResolvedValue({ success: true, providerMessageId: 'sg-msg-001' }),
}

afterAll(() => prisma.$disconnect())

beforeEach(async () => {
  await prisma.notificationLog.deleteMany()
  await prisma.notificationSetting.deleteMany()
  await prisma.user.deleteMany()
  vi.clearAllMocks()
})

// ── Behavior 4: happy path ────────────────────────────────────────────────────
describe('WorkerPipeline', () => {
  it('calls the adapter and records a sent log entry on success', async () => {
    // NotificationLog has a FK to User — seed the user first
    const user  = await prisma.user.create({ data: { email: 'alice@example.com' } })
    const event = { ...emailEvent, user_id: String(user.id) }

    const logRepo  = createNotificationLogRepository(prisma)
    const pipeline = createWorkerPipeline({ logRepo, adapter: successAdapter })

    const ack  = vi.fn()
    const nack = vi.fn()
    await pipeline.run(event, ack, nack)

    expect(successAdapter.send).toHaveBeenCalledOnce()
    expect(ack).toHaveBeenCalledOnce()
    expect(nack).not.toHaveBeenCalled()

    const log = await prisma.notificationLog.findFirst({ where: { eventId: event.event_id } })
    expect(log?.status).toBe(NotificationStatus.sent)
  })

  // ── Behavior 5: duplicate suppression ────────────────────────────────────
  it('acks and discards without calling the adapter when event_id is already logged', async () => {
    // Pre-seed a log entry for this event
    await prisma.user.create({ data: { id: BigInt(42), email: 'alice@example.com' } })
    await prisma.notificationLog.create({
      data: {
        eventId: emailEvent.event_id,
        userId:  BigInt(emailEvent.user_id),
        channel: 'email',
        status:  NotificationStatus.sent,
      },
    })

    const logRepo  = createNotificationLogRepository(prisma)
    const pipeline = createWorkerPipeline({ logRepo, adapter: successAdapter })

    const ack  = vi.fn()
    const nack = vi.fn()
    await pipeline.run(emailEvent, ack, nack)

    expect(successAdapter.send).not.toHaveBeenCalled()
    expect(ack).toHaveBeenCalledOnce()
    expect(nack).not.toHaveBeenCalled()
  })

  // ── Behavior 6: adapter failure → nack ───────────────────────────────────
  it('nacks and writes no sent entry when the adapter throws', async () => {
    const failAdapter: ChannelAdapter = {
      send: vi.fn().mockRejectedValue(new Error('Sendgrid 500')),
    }

    const logRepo  = createNotificationLogRepository(prisma)
    const pipeline = createWorkerPipeline({ logRepo, adapter: failAdapter })

    const ack  = vi.fn()
    const nack = vi.fn()
    await pipeline.run(emailEvent, ack, nack)

    expect(ack).not.toHaveBeenCalled()
    expect(nack).toHaveBeenCalledOnce()

    const log = await prisma.notificationLog.findFirst({
      where: { eventId: emailEvent.event_id, status: 'sent' },
    })
    expect(log).toBeNull()
  })
})
