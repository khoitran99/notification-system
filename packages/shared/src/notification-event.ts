// ── Payload shapes ──────────────────────────────────────────────────────────

export type ApsPayload = {
  aps: {
    alert?: string | { title?: string; body?: string; subtitle?: string }
    badge?: number
    sound?: string
    'content-available'?: 1
    'mutable-content'?: 1
    category?: string
  }
  [key: string]: unknown
}

export type FcmPayload = {
  notification?: { title?: string; body?: string; image?: string }
  data?: Record<string, string>
  android?: {
    priority?: 'normal' | 'high'
    ttl?: string
    notification?: { channelId?: string; icon?: string; color?: string }
  }
}

// ── Base ────────────────────────────────────────────────────────────────────

type Base = {
  event_id: string
  user_id: string
  created_at: Date
}

// ── Per-channel event types ──────────────────────────────────────────────────

export type IosNotificationEvent = Base & {
  channel: 'ios'
  device_token: string
  payload: ApsPayload
}

export type AndroidNotificationEvent = Base & {
  channel: 'android'
  device_token: string
  payload: FcmPayload
}

export type SmsNotificationEvent = Base & {
  channel: 'sms'
  phone_number: string
  country_code: number
  body: string
}

export type EmailNotificationEvent = Base & {
  channel: 'email'
  to_address: string
  subject: string
  content: string
}

// ── Discriminated union ──────────────────────────────────────────────────────

export type NotificationEvent =
  | IosNotificationEvent
  | AndroidNotificationEvent
  | SmsNotificationEvent
  | EmailNotificationEvent

export type Channel = NotificationEvent['channel']

// ── Type guards ──────────────────────────────────────────────────────────────

export const isIosEvent = (e: NotificationEvent): e is IosNotificationEvent =>
  e.channel === 'ios'

export const isAndroidEvent = (
  e: NotificationEvent,
): e is AndroidNotificationEvent => e.channel === 'android'

export const isSmsEvent = (e: NotificationEvent): e is SmsNotificationEvent =>
  e.channel === 'sms'

export const isEmailEvent = (
  e: NotificationEvent,
): e is EmailNotificationEvent => e.channel === 'email'
