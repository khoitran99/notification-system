import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import amqp, { type GetMessage } from 'amqplib'
import { setupQueues, ALERT_QUEUE } from './setup-queues'
import { createQueuePublisher } from './queue-publisher'
import { createQueueConsumer } from './queue-consumer'
import type { IosNotificationEvent } from './notification-event'

const RABBITMQ_URL = 'amqp://guest:guest@localhost:5672'

const iosEvent: IosNotificationEvent = {
  event_id: 'evt-tracer-001',
  user_id:  'user-1',
  channel:  'ios',
  device_token: 'device-token-abc',
  created_at: new Date('2026-01-01T00:00:00Z'),
  payload: { aps: { alert: 'Hello', badge: 1 } },
}

/** Purge all queues so tests are independent of each other. */
async function purgeAll(): Promise<void> {
  const conn = await amqp.connect(RABBITMQ_URL)
  const ch   = await conn.createChannel()
  const queues = ['ios_pn', 'ios_pn.retry', 'android_pn', 'android_pn.retry',
                  'sms', 'sms.retry', 'email', 'email.retry', ALERT_QUEUE]
  for (const q of queues) await ch.purgeQueue(q)
  await ch.close()
  await conn.close()
}

describe('Queue infrastructure', () => {
  beforeAll(() => setupQueues(RABBITMQ_URL))
  beforeEach(() => purgeAll())

  // ── Behavior 1: publish + consume happy path ─────────────────────────────
  it('publish routes an ios event to ios_pn; consumer receives the deserialized event', async () => {
    const publisher = await createQueuePublisher(RABBITMQ_URL)
    const consumer  = await createQueueConsumer(RABBITMQ_URL)

    const received = await new Promise<IosNotificationEvent>((resolve) => {
      consumer.consume('ios_pn', async (event, ack) => {
        ack()
        resolve(event as IosNotificationEvent)
      })
      publisher.publish(iosEvent)
    })

    expect(received.event_id).toBe('evt-tracer-001')
    expect(received.channel).toBe('ios')
    expect(received.device_token).toBe('device-token-abc')
    expect(received.payload.aps.badge).toBe(1)

    await publisher.close()
    await consumer.close()
  }, 15_000)

  // ── Behavior 2: nack(false) → message lands in retry queue with backoff ──
  it('nack(false) on first attempt routes message to retry queue with ~1 s expiration', async () => {
    const publisher = await createQueuePublisher(RABBITMQ_URL)
    const consumer  = await createQueueConsumer(RABBITMQ_URL)

    const nackCalled = new Promise<void>((resolve) => {
      consumer.consume('ios_pn', async (_event, _ack, nack) => {
        nack(false)
        resolve()
      })
    })

    publisher.publish(iosEvent)
    await nackCalled

    // Allow the ack + sendToQueue to complete
    await new Promise(r => setTimeout(r, 100))

    // Inspect ios_pn.retry via a raw channel (peek, don't requeue)
    const conn = await amqp.connect(RABBITMQ_URL)
    const ch   = await conn.createChannel()
    const raw = await ch.get('ios_pn.retry', { noAck: true })
    const msg  = raw as GetMessage

    expect(msg).toBeTruthy()
    const body = JSON.parse(msg.content.toString()) as IosNotificationEvent
    expect(body.event_id).toBe('evt-tracer-001')

    const expiration = Number(msg.properties.expiration)
    expect(expiration).toBeGreaterThanOrEqual(750)
    expect(expiration).toBeLessThanOrEqual(1250)

    const retryCount = (msg.properties.headers as Record<string, unknown>)['x-retry-count'] as number
    expect(retryCount).toBe(1)

    await ch.close()
    await conn.close()

    await publisher.close()
    await consumer.close()
  }, 15_000)

  // ── Behavior 3: exhausted retries → alert queue ───────────────────────────
  it('after maxRetries nacks the message is routed to the alert queue', async () => {
    const publisher = await createQueuePublisher(RABBITMQ_URL)
    // Use 2 maxRetries and 100 ms delay so the test completes in < 1 s
    const consumer  = await createQueueConsumer(RABBITMQ_URL, { maxRetries: 2, delayMs: () => 100 })

    // Handler always nacks — the wrapper handles retry/alert routing
    let deliveries = 0
    const alertReached = new Promise<void>((resolve) => {
      consumer.consume('ios_pn', async (_event, _ack, nack) => {
        deliveries++
        nack(false)
        if (deliveries >= 3) resolve()   // 3rd delivery → alert path
      })
    })

    publisher.publish(iosEvent)
    await alertReached

    // Brief pause so the ack+sendToQueue on the 3rd delivery flushes
    await new Promise(r => setTimeout(r, 200))

    const conn = await amqp.connect(RABBITMQ_URL)
    const ch   = await conn.createChannel()
    const alertMsg = (await ch.get(ALERT_QUEUE, { noAck: true })) as GetMessage

    expect(alertMsg).toBeTruthy()
    const body = JSON.parse(alertMsg.content.toString()) as IosNotificationEvent
    expect(body.event_id).toBe('evt-tracer-001')

    await ch.close()
    await conn.close()

    await publisher.close()
    await consumer.close()
  }, 15_000)

  // ── Behavior 4: setupQueues is idempotent ─────────────────────────────────
  it('setupQueues can be called multiple times without error', async () => {
    await expect(setupQueues(RABBITMQ_URL)).resolves.toBeUndefined()
    await expect(setupQueues(RABBITMQ_URL)).resolves.toBeUndefined()
  }, 15_000)
})
