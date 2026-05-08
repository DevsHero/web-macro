# Production Guidance

## Scope

This project is prepared as a production-oriented local operations tool, not a CI/CD-driven SaaS service.

## Applied Practices

- default runtime isolated to port `3005`
- target-port kill behavior scoped only to the chosen port
- portable JSON config storage
- capped in-memory logging
- cache-aware static asset serving
- hidden-screen runtime optimization controls
- serial per-tab workflow scheduling to avoid conflicting input
- cleaner repository by excluding runtime caches and profile data

## Resource Usage Guidance

### Browser

- Use ephemeral contexts unless you specifically need persistent profiles.
- Keep hidden-screen optimization enabled for background workflows.
- Avoid unnecessary extra tabs in the same runtime.

### Workflows

- Prefer queue repeat policy for long or multi-step workflows.
- Use skip only for idempotent short actions where missing one interval is acceptable.
- Keep click and move durations minimal but deterministic.

### Logs

- Use filtered logs during debugging.
- Clear logs after noisy experiments to reduce UI churn.

## Codebase Standards

- Keep transport payloads JSON-only and small.
- Preserve workflow ordering explicitly when saving or exporting configs.
- Treat browser profile data as local runtime state, not source-controlled assets.
- Keep environment-specific values in env vars where possible.

## Recommended Future Enhancements

These are optional follow-ups for a later phase:

- split `server.js` into runtime, scheduler, config, and transport modules
- replace Tailwind CDN with a local build pipeline for fully self-contained frontend assets
- add automated tests for scheduler and config import/export flows
- add structured logging sinks for longer-term observability
- add schema validation for imported configs

## No CI/CD

CI/CD is intentionally not included in the current scope.
The codebase and docs are organized so it can be added later without changing the runtime model.
