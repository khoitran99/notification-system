import { describe, it, expect } from 'vitest'
import {
  isIosEvent,
  isAndroidEvent,
  isSmsEvent,
  isEmailEvent,
} from './notification-event'
import type { NotificationEvent } from './notification-event'

// Fixtures ─────────────────────────────────────────────────────────────────

const base = {
  event_id: 'evt-001',
  user_id: 'usr-1',
  created_at: new Date(),
}

const iosEvent: NotificationEvent = {
  ...base,
  channel: 'ios',
  device_token: 'apns-token-abc',
  payload: { aps: { alert: { title: 'Hello', body: 'World' }, badge: 1 } },
}

const androidEvent: NotificationEvent = {
  ...base,
  channel: 'android',
  device_token: 'fcm-token-xyz',
  payload: { notification: { title: 'Hello', body: 'World' } },
}

const smsEvent: NotificationEvent = {
  ...base,
  channel: 'sms',
  phone_number: '9001234567',
  country_code: 1,
  body: 'Your code is 1234',
}

const emailEvent: NotificationEvent = {
  ...base,
  channel: 'email',
  to_address: 'user@example.com',
  subject: 'Welcome',
  content: '<p>Hello!</p>',
}

// ── isIosEvent ─────────────────────────────────────────────────────────────

describe('isIosEvent', () => {
  it('returns true for ios Notification Events', () => {
    expect(isIosEvent(iosEvent)).toBe(true)
  })

  it('returns false for non-ios Notification Events', () => {
    expect(isIosEvent(androidEvent)).toBe(false)
    expect(isIosEvent(smsEvent)).toBe(false)
    expect(isIosEvent(emailEvent)).toBe(false)
  })

  it('narrows to device_token and ApsPayload after guard', () => {
    if (isIosEvent(iosEvent)) {
      expect(iosEvent.device_token).toBe('apns-token-abc')
      expect(iosEvent.payload.aps.badge).toBe(1)
    } else {
      throw new Error('guard should have narrowed')
    }
  })
})

// ── isAndroidEvent ─────────────────────────────────────────────────────────

describe('isAndroidEvent', () => {
  it('returns true for android Notification Events', () => {
    expect(isAndroidEvent(androidEvent)).toBe(true)
  })

  it('returns false for non-android Notification Events', () => {
    expect(isAndroidEvent(iosEvent)).toBe(false)
    expect(isAndroidEvent(smsEvent)).toBe(false)
    expect(isAndroidEvent(emailEvent)).toBe(false)
  })

  it('narrows to device_token and FcmPayload after guard', () => {
    if (isAndroidEvent(androidEvent)) {
      expect(androidEvent.device_token).toBe('fcm-token-xyz')
      expect(androidEvent.payload.notification?.title).toBe('Hello')
    } else {
      throw new Error('guard should have narrowed')
    }
  })
})

// ── isSmsEvent ─────────────────────────────────────────────────────────────

describe('isSmsEvent', () => {
  it('returns true for sms Notification Events', () => {
    expect(isSmsEvent(smsEvent)).toBe(true)
  })

  it('returns false for non-sms Notification Events', () => {
    expect(isSmsEvent(iosEvent)).toBe(false)
    expect(isSmsEvent(androidEvent)).toBe(false)
    expect(isSmsEvent(emailEvent)).toBe(false)
  })

  it('narrows to phone_number, country_code, body after guard', () => {
    if (isSmsEvent(smsEvent)) {
      expect(smsEvent.phone_number).toBe('9001234567')
      expect(smsEvent.country_code).toBe(1)
      expect(smsEvent.body).toBe('Your code is 1234')
    } else {
      throw new Error('guard should have narrowed')
    }
  })
})

// ── isEmailEvent ───────────────────────────────────────────────────────────

describe('isEmailEvent', () => {
  it('returns true for email Notification Events', () => {
    expect(isEmailEvent(emailEvent)).toBe(true)
  })

  it('returns false for non-email Notification Events', () => {
    expect(isEmailEvent(iosEvent)).toBe(false)
    expect(isEmailEvent(androidEvent)).toBe(false)
    expect(isEmailEvent(smsEvent)).toBe(false)
  })

  it('narrows to to_address, subject, content after guard', () => {
    if (isEmailEvent(emailEvent)) {
      expect(emailEvent.to_address).toBe('user@example.com')
      expect(emailEvent.subject).toBe('Welcome')
      expect(emailEvent.content).toBe('<p>Hello!</p>')
    } else {
      throw new Error('guard should have narrowed')
    }
  })
})
