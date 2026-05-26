# Microservices with per-channel worker decomposition

We are building the notification system as microservices from day one, decomposed as one `notification-server` service plus four independent worker services (`worker-ios`, `worker-android`, `worker-sms`, `worker-email`), each owning its own message queue.

This directly enforces the core channel-isolation constraint: an outage in one third-party service (e.g., APNs) causes only that worker's queue to back up, leaving SMS, email, and Android delivery unaffected. Each worker service can also be scaled independently based on its own queue depth.

## Considered Options

- **Single worker service** — simpler to deploy, but a single crashing or overloaded worker blocks all channels simultaneously, negating the value of separate queues.
- **Finer-grained services** (e.g., separate user-service, template-service) — introduces distributed data ownership problems before the domain is stable enough to justify it.
