# Notification System

A scalable notification system that supports **mobile push notifications (iOS & Android)**, **SMS messages**, and **Email** — capable of handling millions of notifications per day.

> Based on the system design from *System Design Interview* (ByteByteGo, Chapter 11).

---

## Scale Requirements

| Channel              | Volume/day  |
|----------------------|-------------|
| Mobile push (iOS/Android) | 10 million |
| SMS                  | 1 million   |
| Email                | 5 million   |

- **Soft real-time**: notifications delivered as soon as possible; slight delay acceptable under high load.
- **Multi-device**: iOS devices, Android devices, and laptop/desktop.
- **Opt-out**: users can opt out of any notification channel at any time.

---

## Notification Types

### iOS Push Notification
Flow: `Provider → APNs → iOS Device`

The provider sends a notification request to Apple Push Notification Service (APNs) with:
- **Device token** — unique identifier for the target device.
- **Payload** — JSON body containing the notification content.

### Android Push Notification
Flow: `Provider → FCM → Android Device`

Uses Firebase Cloud Messaging (FCM). Alternative services (Jpush, PushY) are used in regions where FCM is unavailable (e.g., China).

### SMS
Flow: `Provider → SMS Service (Twilio/Nexmo) → Device`

Third-party SMS services deliver the message to the end user's phone number.

### Email
Flow: `Provider → Email Service (Sendgrid/Mailchimp) → Inbox`

Commercial email services offer better delivery rates and analytics than self-hosted servers.

---

## Architecture

### High-Level Design

```
Service 1 ─┐
Service 2 ─┤──► Notification Servers ──► [iOS PN Queue]     ──► Workers ──► APNs     ──► iOS
   ...      │         │                  [Android PN Queue]  ──► Workers ──► FCM      ──► Android
Service N ──┘    Cache + DB             [SMS Queue]          ──► Workers ──► SMS Svc  ──► SMS
                                        [Email Queue]        ──► Workers ──► Email Svc──► Email
```

### Component Responsibilities

| Component             | Role |
|-----------------------|------|
| **Notification Servers** | Expose internal APIs; validate input; fetch user/device metadata from cache/DB; route events to message queues. |
| **Cache**             | Stores user info, device tokens, and notification templates for fast access. |
| **DB**                | Persists user info, device settings, notification logs, and settings. |
| **Message Queues**    | One queue per channel (iOS PN, Android PN, SMS, Email). Decouples notification servers from workers; absorbs traffic spikes. |
| **Workers**           | Pull events from queues and forward them to the appropriate third-party service. |
| **Third-Party Services** | APNs, FCM, Twilio/Nexmo, Sendgrid/Mailchimp — actual delivery to end users. |

### Data Model

**`user` table**
| Column        | Type      |
|---------------|-----------|
| user_id       | bigint PK |
| email         | varchar   |
| country_code  | integer   |
| phone_number  | integer   |
| created_at    | timestamp |

**`device` table**
| Column           | Type      |
|------------------|-----------|
| id               | bigint PK |
| device_token     | varchar   |
| user_id          | bigint FK |
| last_logged_in_at| timestamp |

**`notification_setting` table**
| Column  | Type    | Notes |
|---------|---------|-------|
| user_id | bigint  |       |
| channel | varchar | push / email / sms |
| opt_in  | boolean |       |

---

## Key Design Decisions

### Reliability
- Notifications are **persisted to a notification log DB** before delivery — no data loss.
- Workers implement a **retry mechanism**: failed notifications go back to the queue; alerts fire if retries are exhausted.
- **At-least-once delivery** is the contract; a deduplication layer (event ID check) suppresses duplicates on the receiver side.

### Scalability
- Notification servers are **horizontally scaled** (auto-scaling).
- DB and cache are moved **off** the notification servers to scale independently.
- Separate message queues per channel isolate failures — an outage in one third-party service does not affect other channels.

### Rate Limiting
- Per-user frequency caps prevent notification fatigue and reduce the risk of users disabling notifications altogether.

### Security
- Notification server APIs are **internal-only** or require verified client credentials.
- iOS/Android push APIs are secured with an **appKey / appSecret** pair — only authenticated clients may send.

### Notification Templates
- Pre-formatted templates allow consistent, reusable notifications with customizable parameters (item name, date, CTA).
- Benefits: consistent format, reduced error margin, faster authoring.

### User Settings (Opt-Out)
- Before any notification is dispatched, the system checks the `notification_setting` table.
- Users can opt out per channel (push, email, SMS) independently.

### Event Tracking
Notification lifecycle states for analytics:

```
start → pending → sent → deliver → click
                       ↘ error       ↘ unsubscribe
```

Tracked metrics: open rate, click rate, unsubscribe rate, engagement.

---

## Notification Flow (Step-by-Step)

1. A service calls the Notification Server API with the target user(s) and message payload.
2. Notification servers validate the request, then fetch user info, device tokens, and settings from cache/DB.
3. The notification event is published to the appropriate message queue (iOS PN, Android PN, SMS, or Email).
4. Workers pull events from the queue.
5. Workers forward the notification payload to the corresponding third-party service.
6. Third-party service delivers the notification to the end-user device.

---

## Monitoring

- Track **queue depth** — a high number of queued notifications signals under-provisioned workers.
- Analytics service integrates at each lifecycle stage to capture open/click/unsubscribe events.
- Alerts fire when workers exhaust retries on a failed notification.

---

## Third-Party Services Reference

| Service        | Purpose              |
|----------------|----------------------|
| Apple APNs     | iOS push delivery    |
| Google FCM     | Android push delivery|
| Twilio         | SMS delivery         |
| Nexmo          | SMS delivery         |
| Sendgrid       | Email delivery       |
| Mailchimp      | Email delivery       |
