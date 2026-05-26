import amqp from 'amqplib'

export const CHANNELS = ['ios_pn', 'android_pn', 'sms', 'email'] as const
export type QueueChannel = typeof CHANNELS[number]

export const ALERT_QUEUE = 'notification.alerts'

/** Channel → exchange name mapping */
export function exchangeFor(channel: string): QueueChannel {
  const map: Record<string, QueueChannel> = {
    ios:     'ios_pn',
    android: 'android_pn',
    sms:     'sms',
    email:   'email',
  }
  const result = map[channel]
  if (!result) throw new Error(`Unknown channel: ${channel}`)
  return result
}

/**
 * Assert the full RabbitMQ topology.
 * Idempotent — safe to call at every service startup.
 *
 * Per channel:
 *   exchange  {ch}       (direct) → queue {ch}       (main)
 *   exchange  {ch}.dlx   (direct) → queue {ch}.retry  (TTL → back to main)
 * Plus:
 *   queue notification.alerts  (receives messages exhausted after 5 retries)
 */
export async function setupQueues(url: string): Promise<void> {
  const conn    = await amqp.connect(url)
  const channel = await conn.createChannel()

  for (const ch of CHANNELS) {
    // Main exchange + queue
    await channel.assertExchange(ch, 'direct', { durable: true })
    await channel.assertQueue(ch, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange':    `${ch}.dlx`,
        'x-dead-letter-routing-key': `${ch}.retry`,
      },
    })
    await channel.bindQueue(ch, ch, ch)

    // DLX exchange + retry queue (messages expire back into main)
    await channel.assertExchange(`${ch}.dlx`, 'direct', { durable: true })
    await channel.assertQueue(`${ch}.retry`, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange':    ch,
        'x-dead-letter-routing-key': ch,
      },
    })
    await channel.bindQueue(`${ch}.retry`, `${ch}.dlx`, `${ch}.retry`)
  }

  // Alert queue — final destination after exhausting retries
  await channel.assertQueue(ALERT_QUEUE, { durable: true })

  await channel.close()
  await conn.close()
}
