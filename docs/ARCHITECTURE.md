# Architecture

## Runtime Overview

web-macro is a Node.js application that combines:

- Express for the HTTP dashboard and JSON config import/export routes
- Socket.io for realtime state snapshots and log streaming
- Playwright for browser/tab/runtime control
- A single-page dashboard in `public/` for tab and workflow operations

## Core Backend Concepts

### Browser Runtime

The backend owns one Playwright browser runtime and one browser context at a time. Browser settings include:

- browser type
- launch mode
- executable path
- CDP URL
- hidden-screen optimization flags
- whether workflows may activate tabs

### Tabs

Each managed tab represents one browser page tracked by the controller. A tab owns:

- the Playwright page
- tab-level pause state
- default target position
- workflow map
- a serial workflow queue
- the currently executing workflow id

### Workflows

A workflow contains:

- metadata: name, notes, description
- scheduling: interval and start delay
- execution policy: repeat queue or repeat skip
- tab activation policy
- ordered step list
- runtime counters and error state
- stable sort order used for on-screen order and queue priority

## Serial Queue Model

The scheduler now serializes workflow execution per tab.

Behavior:

- Only one workflow may execute on a given tab at a time.
- If another workflow becomes due on the same tab, it is queued.
- Queue priority follows the visible workflow order on that tab.
- Repeat triggers for the same workflow use the workflow overlap policy:
  - `queue`: keep a pending rerun
  - `skip`: drop the repeat trigger while the previous run is still active or pending

This avoids overlapping clicks and key presses that would corrupt gameplay or browser state.

## Config Storage

Saved snapshots are stored as JSON files in `configs/`.

Each document contains:

- `configName`
- `savedAt`
- `browser`
- `tabs`

Tabs include workflow definitions, browser-independent tab metadata, and workflow order.

## Frontend Overview

The dashboard UI is split into:

- header actions and runtime summary
- config library and snapshot controls
- per-tab workflow cards
- workflow editor modal
- browser settings modal
- live filtered log panel

## Request Surface

### HTTP

- `GET /health`: controller health snapshot
- `GET /api/configs/:configId/export`: export a saved config as JSON
- `POST /api/configs/import`: import a JSON config payload
- static assets from `public/`

### Socket Events

Primary socket operations include:

- tab creation
- workflow save / remove / duplicate / run once / pause
- tab pause/resume
- browser config update
- config save / load / delete
- log clear

## Performance Decisions

- Static assets are served with cache headers, while HTML is served with `no-store`.
- State bursts are coalesced into at most one scheduled broadcast per 100 ms;
  connected clients receive an immediate initial snapshot. No subscribers or only
  hidden dashboards means no snapshot serialization or config scanning.
- Logs retain the latest 500 entries, stream in batches, and replay from that
  bounded history when a slow transport becomes writable. A slow client does not
  make healthy clients receive repeated snapshots. Hidden dashboards fetch current
  state and bounded log history on becoming visible.
- Saved config metadata is cached, checked for external changes on the next scan
  (at most once per five seconds), and immediately invalidated for app writes.
- Sequence uses a deadline timeout, parking entirely when paused/empty. Mutations
  and execution completion wake it; there is no per-tab 100 ms polling loop.
- Scheduled interval ticks coalesce to one pending rerun per workflow; up to 32
  explicit manual runs per tab may queue. Further manual requests return an error
  rather than silently growing memory. Skip policy keeps its original semantics.
- Canvas ranking uses a renderer-side query per frame, scans the main frame once,
  reuses the winning handle, and releases unused/replaced handles. Geometry is
  revalidated every lookup, including dynamically added canvases and scaled frames.
- Dashboard updates replace changed tab cards only. Hidden dashboards/log panels
  avoid DOM rebuilds; runtime text is only changed when its value differs.
- Browser launch args favor reduced background throttling for hidden-screen execution.
- Power Saving suppresses controller log creation entirely and limits visible
  dashboard delivery to one scheduled update per second. It preserves browser
  contexts, workflow states and input timing, and is serialized in browser config.
- The roBrowser adapter recognizes existing AMD modules or an ESM import map.
  It skips only default-framebuffer draw/clear calls inside the renderer, with a
  host/tab-count budget and staggered phases. Offscreen passes and all game loop
  callbacks continue. Unsupported clients retain their normal rendering.
- Short renderer-side input preparations use a round-robin queue per page with
  capacity from `os.availableParallelism()` (fallback: CPU count). Macro waits and
  holds execute outside that queue. CPU-heavy game work stays in Chromium renderer
  processes, scheduled across cores by the OS; extra Node workers would duplicate
  browser connections and add message/heap overhead to this I/O coordinator.
- Per-tab serialization reduces duplicated or conflicting input bursts.
