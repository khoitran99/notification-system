import type { NotificationEvent, NotificationLogRepository } from '@notification/shared'
import { NotificationStatus } from '@notification/shared'
import type { ChannelAdapter } from './channel-adapter'
import type { AckFn, NackFn } from '@notification/shared'

export interface WorkerPipeline {
  run(event: NotificationEvent, ack: AckFn, nack: NackFn): Promise<void>
}

export interface WorkerPipelineDeps {
  logRepo: NotificationLogRepository
  adapter: ChannelAdapter
}

export function createWorkerPipeline({ logRepo, adapter }: WorkerPipelineDeps): WorkerPipeline {
  return {
    async run(event, ack, nack): Promise<void> {
      // 1. Deduplication — if this event was already processed, ack and discard
      const existing = await logRepo.findByEventId(event.event_id)
      if (existing) {
        ack()
        return
      }

      // 2. Delegate to channel adapter
      if (event.channel !== 'email') {
        // This pipeline is email-only; nack unexpected channels
        nack(false)
        return
      }

      try {
        await adapter.send(event)
      } catch {
        // Adapter failure — nack so the message enters the DLX retry path
        nack(false)
        return
      }

      // 3. Record delivery and ack
      await logRepo.record(event, NotificationStatus.sent)
      ack()
    },
  }
}
