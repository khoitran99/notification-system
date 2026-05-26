# Monorepo with pnpm workspaces

All five services and shared packages live in a single repository managed with pnpm workspaces.

The notification event payload type is the load-bearing reason — it crosses the queue boundary between `notification-server` and every worker service. A monorepo lets this type live in a `packages/shared` workspace imported directly by all services; changes are atomic and TypeScript catches mismatches at compile time. A polyrepo would require either duplicating the type (drift) or publishing a versioned npm package (adds a publish cycle to every schema change at a stage when the payload shape is still evolving).

## Considered Options

- **Polyrepo with a published `@notification/types` package** — viable once the schema stabilises, but adds friction during early development when the event payload changes frequently.
