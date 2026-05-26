# Single PostgreSQL database for all persistent storage

PostgreSQL serves as the single database for all persistent data: `user`, `device`, `notification_setting`, and `notification_log`.

The schema is naturally relational — users have many devices, users have per-channel opt-in settings with foreign key relationships. The `notification_log` is append-only and can be partitioned by `created_at` as volume grows, deferring any split-storage decision until PostgreSQL partitioning is genuinely the bottleneck.

## Considered Options

- **Split storage (PostgreSQL + Cassandra)** — Cassandra's append-only model suits the notification log at very high scale, but introduces two databases to operate from day one before the write volume justifies it.
