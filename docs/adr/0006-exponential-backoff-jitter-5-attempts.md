# Exponential backoff with jitter, capped at 5 retry attempts

When a worker fails to deliver to a third-party service, it re-enqueues the notification event using exponential backoff (1s → 2s → 4s → 8s → 16s) with ±25% jitter on each delay. After 5 failed attempts the event is dead-lettered and a developer alert fires.

The jitter is load-critical: when a third-party service (e.g. APNs) recovers from an outage, all queued retries become eligible simultaneously. Without jitter they hit the recovering service in a single burst, which can immediately knock it back down. Spreading retries randomly absorbs this thundering herd.

RabbitMQ's dead-letter exchange (DLX) implements this natively via per-message TTL — no custom timer logic in workers.

## Considered Options

- **Fixed delay** — simpler, but no thundering herd protection when a third-party recovers from a mass failure.
- **Unlimited retries** — dangerous for permanently invalid targets (e.g. a revoked device token) that would retry forever.
