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
- Logs are capped in memory.
- Browser launch args favor reduced background throttling for hidden-screen execution.
- Per-tab serialization reduces duplicated or conflicting input bursts.
