import sgMail from '@sendgrid/mail'
import type { EmailNotificationEvent } from '@notification/shared'

export interface ChannelAdapter {
  send(event: EmailNotificationEvent): Promise<{ success: boolean; providerMessageId?: string }>
}

export function createSendgridAdapter(apiKey: string): ChannelAdapter {
  if (apiKey) sgMail.setApiKey(apiKey)

  return {
    async send(event): Promise<{ success: boolean; providerMessageId?: string }> {
      const [response] = await sgMail.send({
        to:      event.to_address,
        from:    process.env.SENDGRID_FROM_EMAIL ?? 'noreply@notification.local',
        subject: event.subject,
        html:    event.content,
      })

      return {
        success:           response.statusCode >= 200 && response.statusCode < 300,
        providerMessageId: response.headers['x-message-id'] as string | undefined,
      }
    },
  }
}
