import amqp, { type ChannelModel, type Channel } from 'amqplib'
import type { NotificationEvent } from './notification-event'
import { ALERT_QUEUE } from './setup-queues'

export type AckFn  = () => void
export type NackFn = (requeue: boolean) => void
export type MessageHandler = (
  event: NotificationEvent,
  ack:   AckFn,
  nack:  NackFn,
) => Promise<void>

export interface QueueConsumer {
  consume(queue: string, handler: MessageHandler): Promise<void>
  close(): Promise<void>
}

export interface ConsumerOptions {
  /**
   * Maximum number of delivery attempts before routing to the alert queue.
   * Counts from 1, so maxRetries=5 means the message is tried 5 times total.
   * Default: 5
   */
  maxRetries?: number
  /**
   * Returns the delay in milliseconds before the next retry for attempt `n`
   * (0-indexed: n=0 is the first retry after the first failure).
   * Default: exponential backoff with ±25 % jitter — 1 s, 2 s, 4 s, 8 s, 16 s.
   */
  delayMs?: (attempt: number) => number
}

function defaultDelayMs(attempt: number): number {
  const base   = Math.pow(2, attempt) * 1000
  const jitter = 1 + (Math.random() - 0.5) * 0.5   // ±25 %
  return Math.round(base * jitter)
}

export async function createQueueConsumer(
  url:     string,
  options?: ConsumerOptions,
): Promise<QueueConsumer> {
  const maxRetries = options?.maxRetries ?? 5
  const delayMs    = options?.delayMs    ?? defaultDelayMs

  const conn:    ChannelModel = await amqp.connect(url)
  const channel: Channel     = await conn.createChannel()

  await channel.prefetch(1)

  return {
    async consume(queue: string, handler: MessageHandler): Promise<void> {
      await channel.consume(queue, async (msg) => {
        if (!msg) return   // consumer cancelled

        const event = JSON.parse(msg.content.toString()) as NotificationEvent

        const ack: AckFn = () => channel.ack(msg)

        const nack: NackFn = (requeue) => {
          if (requeue) {
            channel.nack(msg, false, true)
            return
          }

          // --- Non-requeue path: managed backoff retry -----------------------
          const headers    = (msg.properties.headers ?? {}) as Record<string, unknown>
          const retryCount = (headers['x-retry-count'] as number | undefined) ?? 0

          if (retryCount >= maxRetries) {
            // Exhausted — forward to alert queue, acknowledge original
            channel.sendToQueue(
              ALERT_QUEUE,
              msg.content,
              {
                persistent: true,
                headers:    { ...headers, 'x-retry-count': retryCount },
              },
            )
            channel.ack(msg)
            return
          }

          // Schedule retry: publish to per-channel retry queue with TTL
          const delay      = delayMs(retryCount)
          const retryQueue = `${queue}.retry`

          channel.sendToQueue(
            retryQueue,
            msg.content,
            {
              persistent:  true,
              expiration:  String(delay),
              headers:     { ...headers, 'x-retry-count': retryCount + 1 },
            },
          )
          channel.ack(msg)
        }

        try {
          await handler(event, ack, nack)
        } catch {
          // Handler threw without calling ack/nack — enter the retry path
          nack(false)
        }
      })
    },

    async close(): Promise<void> {
      await channel.close()
      await conn.close()
    },
  }
}
