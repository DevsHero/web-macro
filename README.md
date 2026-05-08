# web-macro

web-macro is a production-focused browser macro controller for games and browser workflows that need multi-tab orchestration, reliable background-safe input, and portable JSON configuration snapshots.

## Highlights

- Serial per-tab workflow execution so workflows on the same tab do not overlap.
- Background-safe browser automation with hidden-screen optimization controls.
- Compact dashboard for tabs, workflows, runtime settings, and logs.
- JSON config save, export, import, load, and delete flows for machine portability.
- Runtime defaults moved to port 3005 for the new codebase.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start the controller on the default port:

```bash
npm run start
```

3. Open the dashboard:

```text
http://localhost:3005
```

4. Add a game tab, create workflows, and use Save Snapshot / Export JSON to preserve your setup.

## Scripts

- `npm run start`: start the controller on `PORT` or default `3005`, killing only that target port before boot.
- `npm run dev`: start the controller without changing behavior from `start`.
- `npm run stop`: kill listeners on `PORT` or default `3005`.
- `npm run check`: syntax-check the server, client app, and manifest.
- `npm run clean`: remove local runtime caches and generated browser profile data.

## Project Structure

- `server.js`: backend runtime, workflow scheduler, config storage, and Playwright integration.
- `public/index.html`: dashboard shell and modal markup.
- `public/app.js`: realtime dashboard behavior and workflow editor UI.
- `configs/`: saved JSON snapshots for browser/runtime/workflow state.
- `docs/`: architecture, usage, config portability, and production guidance.

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/USAGE.md`
- `docs/CONFIGS.md`
- `docs/PRODUCTION.md`

## Notes

- This codebase intentionally omits CI/CD per current project scope.
- The original testing instance on port 3006 is not part of this new default runtime.
- Configs are portable JSON files and can be moved between machines directly or through the dashboard export/import flow.

## Screenshot

![Web Macro screenshot](screenshot/screenshot1.png)
![Web Macro screenshot](screenshot/screenshot2.png)
![Web Macro screenshot](screenshot/screenshot3.png)
![Sample use macro in Ragnarok Browser](screenshot/screenshot4.png)

