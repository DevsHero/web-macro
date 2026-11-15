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
- Log history is bounded automatically; hiding the log panel avoids rebuilding its DOM.
- State/log streaming pauses while the dashboard is hidden; automation continues.

## Reproducible Controller Benchmark

Run `npm run benchmark` for six isolated headless tabs, four workflows per tab,
and 96 total executions. It reports successful/error counts, controller CPU time,
state builds, snapshot bytes, and log packet/entry counts. No game session is used.
Use `BENCH_STEP_MS=50 npm run benchmark` for the sustained variant.

To compare with the previous scheduler/transport implementation:

```bash
BENCH_STEP_MS=50 node scripts/performance-benchmark.js --baseline-ref=16a2687
BENCH_STEP_MS=50 npm run benchmark
BENCH_STEP_MS=50 npm run benchmark -- --power-saving
BENCH_TABS=20 BENCH_STEP_MS=50 npm run benchmark -- --power-saving
```

This measures controller overhead, not game rendering/GPU load or whole-machine
speed. It is a local synthetic check, not an Ubuntu or live multi-game acceptance
run. Timing varies with the host; packet/build counts are the stronger evidence.
Input hold times, click settling, game rendering settings, and workflow ordering
are preserved. When a workflow cannot keep up with its interval, Queue retains
one scheduled rerun instead of accumulating every missed tick.

Local macOS sample (2026-11-15, 50 ms variant):

| Metric | Before (`16a2687`) | Optimized | Power Saving |
| --- | ---: | ---: | ---: |
| Completed executions / errors | 96 / 0 | 96 / 0 | 96 / 0 |
| State builds / packets | 192 | 9 | 1 |
| Snapshot bytes | 5,412,927 | 255,099 | 28,397 |
| Log packets / retained entries | 288 / 288 | 9 / 288 | 0 / 0 |
| Controller CPU time, including final delivery | 140 ms | 57 ms | 28 ms |

The snapshot payload fell by 95.3% in this sample. CPU timings are illustrative,
not a guarantee of whole-machine improvement or game frame rate.
The Power Saving 20-tab variant completed 320 executions with zero errors and
one 86,014-byte snapshot (99 ms controller CPU in this local sample).

Power Saving additionally tests real WebGL screen-pass suppression with active
game-style ticks, heartbeat timers, offscreen texture passes and repeated trusted
chat input. Scheduler tests emulate 2- and 4-slot capacity across 20 tabs. These
fixtures verify the adapter and queue, not a live authenticated roBrowser session
or physical CPU affinity on a 2-core Ubuntu host.

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
