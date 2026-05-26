# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a greenfield implementation of a scalable notification system (based on ByteByteGo System Design Interview, Chapter 11). The system delivers **iOS push (APNs)**, **Android push (FCM)**, **SMS**, and **Email** notifications at scale: 10M push/day, 1M SMS/day, 5M email/day.

No build system, language, or framework has been chosen yet. When implementing, update this file with the actual commands.

---

## Architecture

The system is composed of five logical layers that must remain independently scalable:

```
Upstream Services → Notification Servers → Message Queues → Workers → Third-Party Services → Devices
```

### Notification Servers
The central API layer. Responsibilities:
- Authenticate incoming requests (appKey/appSecret); these APIs must never be public.
- Validate recipient contact info (email format, phone number, device token).
- Fetch user settings, device tokens, and templates from **cache first, DB second**.
- Check `notification_setting.opt_in` before queuing — never dispatch to an opted-out user.
- Apply per-user **rate limiting** before enqueuing.
- Publish events to the correct per-channel message queue.

### Message Queues (one per channel)
Four independent queues: `ios_pn`, `android_pn`, `sms`, `email`. Keeping them separate means an outage in one third-party service (e.g., APNs) does not block other channels.

### Workers
Stateless consumers that pull from queues, call the relevant third-party service, and write to the **notification log**. On third-party failure: re-enqueue for retry up to N times, then alert.

### Cache & DB
- **Cache**: user info, device tokens, notification templates — hot path reads must hit cache.
- **DB**: source of truth for users, devices, notification settings, and the notification log.

---

## Data Model

```sql
-- user: one row per account
user_id bigint PK, email varchar, country_code int, phone_number int, created_at timestamp

-- device: one user can have many devices (all receive push notifications)
id bigint PK, device_token varchar, user_id bigint FK, last_logged_in_at timestamp

-- notification_setting: per-user per-channel opt-in flag
user_id bigint, channel varchar -- 'push'|'sms'|'email', opt_in boolean

-- notification_log: append-only delivery record for reliability and analytics
```

---

## Critical Design Constraints

**At-least-once delivery, not exactly-once.** Duplicate suppression is handled by checking a notification event ID before processing — if seen before, discard.

**No data loss.** Every notification event must be persisted to the notification log before the worker acknowledges delivery. A crash between enqueue and delivery is recovered via retry.

**Deduplication at the worker level.** Workers check event IDs against the notification log. Idempotent delivery calls to third-party services are preferred where the API supports it.

**Queue depth is the primary scaling signal.** If queue depth grows, add workers. Notification servers scale independently of workers.

---

## Notification Lifecycle (for event tracking)

```
start → pending → sent → deliver → click
              ↘ error              ↘ unsubscribe
```

An analytics service must integrate at each state transition to capture open rate, click rate, and unsubscribe rate.

---

## Third-Party Integrations

| Channel  | Service          | Notes |
|----------|------------------|-------|
| iOS push | Apple APNs       | Requires device token + JSON payload |
| Android  | Google FCM       | Unavailable in China — use Jpush/PushY as fallback |
| SMS      | Twilio / Nexmo   | Commercial; phone number + country code required |
| Email    | Sendgrid / Mailchimp | Better delivery rate than self-hosted |

The integration layer must be pluggable — third-party services change or become unavailable in certain regions.
