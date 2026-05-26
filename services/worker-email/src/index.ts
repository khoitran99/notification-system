import { prisma, createQueueConsumer, setupQueues, createNotificationLogRepository } from '@notification/shared'
import { createSendgridAdapter } from './channel-adapter'
import { createWorkerPipeline } from './worker-pipeline'

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'
const SENDGRID_KEY = process.env.SENDGRID_API_KEY ?? ''

async function start(): Promise<void> {
  await setupQueues(RABBITMQ_URL)

  const logRepo  = createNotificationLogRepository(prisma)
  const adapter  = createSendgridAdapter(SENDGRID_KEY)
  const pipeline = createWorkerPipeline({ logRepo, adapter })
  const consumer = await createQueueConsumer(RABBITMQ_URL)

  console.log('worker-email: consuming from email queue')
  await consumer.consume('email', (event, ack, nack) => pipeline.run(event, ack, nack))
}

start().catch((err) => {
  console.error('worker-email failed to start', err)
  process.exit(1)
})
