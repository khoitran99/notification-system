import amqp, { type ChannelModel, type Channel } from 'amqplib'
import type { NotificationEvent } from './notification-event'
import { exchangeFor } from './setup-queues'

export interface QueuePublisher {
  publish(event: NotificationEvent): Promise<void>
  close(): Promise<void>
}

export async function createQueuePublisher(url: string): Promise<QueuePublisher> {
  const conn:    ChannelModel = await amqp.connect(url)
  const channel: Channel     = await conn.createChannel()

  return {
    async publish(event: NotificationEvent): Promise<void> {
      const exchange   = exchangeFor(event.channel)
      const routingKey = exchange                          // routing key == queue name
      const body       = Buffer.from(JSON.stringify(event))
      channel.publish(exchange, routingKey, body, { persistent: true, contentType: 'application/json' })
    },

    async close(): Promise<void> {
      await channel.close()
      await conn.close()
    },
  }
}
