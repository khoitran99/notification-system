# Notification System

A system that delivers notifications to users across multiple channels on behalf of upstream services. It handles authentication, opt-in enforcement, rate limiting, queuing, delivery, and retry.

## Language

### Core entities

**Notification Event**:
The unit of work that crosses the queue boundary — published by the Notification Server, consumed by a Worker. Carries an `event_id` (for deduplication), channel, recipient info, and channel-specific payload.
_Avoid_: message, task, job, notification request

**Channel**:
A delivery mechanism — exactly one of `ios`, `android`, `sms`, or `email`. Each channel has its own dedicated queue and Worker service. Channels are fully isolated: a failure in one does not affect others.
_Avoid_: type, medium, transport

**Device Token**:
A unique identifier for a mobile device registered with APNs (iOS) or FCM (Android). One User may have many Device Tokens across multiple devices. Required to deliver push notifications.
_Avoid_: push token, registration token, device ID

### Services

**Notification Server**:
The single API-layer service. Authenticates callers, validates recipient data, checks Opt-in status, applies Rate Limiting, then publishes Notification Events to the appropriate channel queue.
_Avoid_: API server, gateway, dispatcher, producer

**Worker**:
A stateless microservice dedicated to one Channel. Consumes Notification Events from its queue, calls the corresponding third-party service (APNs / FCM / Twilio / Sendgrid), and writes to the Notification Log before acknowledging delivery.
_Avoid_: consumer, processor, handler, agent

### Delivery concepts

**Opt-in**:
A per-user, per-channel boolean stored in `notification_setting`. The Notification Server checks Opt-in before enqueuing — a Notification Event is never published for an opted-out user.
_Avoid_: subscription, preference, consent, opt-out flag

**Rate Limit**:
A per-user cap on Notification Event frequency enforced by the Notification Server via a Redis sliding window counter. Prevents notification fatigue. Applied after Opt-in check, before enqueue.
_Avoid_: throttle, frequency cap, quota

**Notification Log**:
An append-only table recording every delivery attempt. Written by Workers before acknowledging a Notification Event. The source of truth for deduplication (event ID check) and analytics (open rate, click rate, unsubscribe rate).
_Avoid_: audit log, event log, delivery log

**Dead Letter**:
A Notification Event that has exhausted all 5 retry attempts and been removed from the active queue. Triggers a developer alert. Stored in RabbitMQ's dead-letter exchange (DLX).
_Avoid_: failed notification, poison message, undeliverable

### Lifecycle states

A Notification Event transitions through: `start → pending → sent → deliver → click / unsubscribe`, with `error` reachable from `pending` or `sent`. The Analytics service integrates at each transition.

---

## Example dialogue

> **Dev**: "If a user unsubscribes, do we still process the Notification Event that's already in the queue?"
>
> **Domain expert**: "Yes — the Opt-in check happens at enqueue time in the Notification Server. Once a Notification Event is in the queue, the Worker delivers it. The unsubscribe is captured in the Notification Log as an `unsubscribe` lifecycle state, and future events for that user on that Channel won't be enqueued."
>
> **Dev**: "What happens if APNs is down for an hour?"
>
> **Domain expert**: "The iOS Worker retries with exponential backoff — up to 5 attempts. Events that exhaust retries become Dead Letters and alert us. The other Workers — Android, SMS, Email — are unaffected because each Channel has its own queue."
>
> **Dev**: "Can we replay Dead Letters once APNs recovers?"
>
> **Domain expert**: "Not automatically. Dead Letters require manual intervention — we inspect them, decide if they're still valid, and re-publish them as new Notification Events if so."
