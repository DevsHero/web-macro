# Usage Guide

## Start the App

```bash
npm install
npm run start
```

Open:

```text
http://localhost:3005
```

## Typical Workflow

1. Click `Add New Game Tab`.
2. Wait for the target game page to load.
3. Click `Add Workflow` on the tab card.
4. Define steps such as keyboard, move, click, focus, and wait.
5. Save the workflow.
6. Use `Run Once` for immediate validation.
7. Leave the workflow enabled for recurring execution.

## Duplicate a Tab

Click **Duplicate Tab** on a tab card, enter the destination URL (prefilled with the
source URL), then confirm **Duplicate Tab**. Leave the URL blank for an empty tab.
All workflows, their order, steps, timing, notes, execution policies, and default
target position are copied with fresh IDs and reset execution counters. The new
tab starts paused; log in or prepare the page, then choose **Resume All**.
The original tab and saved snapshots are unchanged.

## Execution Modes

Use the **Mode: Interval / Mode: Sequence** button on each tab to switch modes.
Interval keeps independent countdowns for workflows and serializes due runs.
Sequence counts down one enabled workflow at a time in the displayed top-to-bottom
order, executes all its steps, then starts the next workflow's countdown. It loops
back to the top after the last workflow and skips paused workflows. The workflow's
start delay applies to its first turn; subsequent turns use its interval.

Switching modes clears pending runs and waits for any current execution to finish.
Pause/Resume and individual controls work in both modes. Reset All Countdowns
starts a sequence from the top with full intervals. Run Once remains a manual
execution. The selected mode is preserved in snapshots and duplicated tabs; older
snapshots default to Interval.

## Control All Tabs

**Power Saving: On/Off** in the top menu applies immediately without closing tabs
or logging out. It clears and disables controller logs and reduces dashboard
updates to once per second while visible. Save a snapshot to retain this choice.

For compatible roBrowser clients (RequireJS or ESM/import maps), it disables
optional post-processing and reduces screen-only WebGL redraws to an automatic
2–12 FPS budget based on available host CPUs and tab count. Game tick/events,
offscreen texture generation, picking, network traffic and macro delays remain
active. Input briefly restores full drawing. Turning the mode off restores the
previous graphics settings. Generic or bundled clients without accessible modules
receive controller savings only; their game APIs and frame loop stay unchanged.
Each tab card reports graphics compatibility, including controller-only fallback
reasons. Status updates are event-driven and old-document reports are ignored.
Canvas/context replacement, context restoration and rapid toggles restore owned
hooks before reattaching; clients that reject hooks retain controller savings.

CPU scheduling is automatic. Short canvas/focus preparations share a fair queue
with one slot per available CPU thread (including supported host/container quotas).
Tabs take turns; delays and held keys never occupy these slots. Chromium renderer
processes perform game work across CPU cores under the OS scheduler. This does
not pin a tab to a core or guarantee zero delay if 20 games exceed a small host's
capacity. There are no per-user thread settings.

The top menu has **Pause All Tabs**, **Resume All Tabs**, and **Reset All Countdowns**.
These actions apply to every workflow in every managed tab, in both execution modes.
Pause and Resume are explicit actions: clicking Pause twice keeps everything paused.
Resume includes individually paused workflows. Reset restores full intervals while
preserving pause states and restarts Sequence tabs from the top. Current executions
finish normally. Per-tab and individual controls remain available.

## Pause, Resume, and Reset Countdowns

Pause All pauses every workflow in that tab. Resume All resumes every workflow,
including workflows paused individually. Individual Pause and Resume buttons
always work, including after Pause All. They share the same workflow state;
there is no separate tab lock. All uses the same pause/resume colors as workflows.

Reset All Countdowns restarts every workflow countdown in that tab from its full
interval. Running workflows keep running; paused workflows stay paused with their
full interval ready for Resume. Pending queued runs are cleared. A currently
executing run finishes normally; it is not interrupted.

## Workflow Scheduling Rules

- Workflows on the same tab run one at a time.
- The top workflow in the tab order gets priority when multiple runs are pending.
- Repeat triggers can queue or skip depending on the overlap setting.
- Different tabs may still run independently.

## Chat and Keyboard Focus

Each workflow run starts with keyboard steps targeting the game canvas. After a
Type Text step, keyboard steps keep focus in the active input, textarea, select,
or contenteditable editor, including editors inside iframes and open shadow roots.
Explicit focus, click, move, or navigate steps restore game-key targeting.
The next run starts with game keys again, so chat left open by a server response
does not consume the opening Enter.

For roBrowser chat, use `Enter` → `Type Text: @go 0` → `Enter`. The last Enter
submits to the chat editor; extra Enter steps or longer delays are unnecessary.
If another workflow needs to leave an active chat editor and cast game hotkeys,
add an explicit `Focus: canvas` step first.

## Saved Snapshots

Use the config panel to:

- save a runtime snapshot
- load a snapshot
- delete a snapshot
- export a snapshot to JSON
- import a snapshot from JSON

`Resume enabled workflows when loading this snapshot` controls whether loaded workflows resume immediately.

## Browser Settings

Open **Browser Settings** to choose an installed browser by name, then click
**Apply Browser Settings**. No executable path is needed for detected browsers.
The scan checks standard system and per-user install locations on Windows,
macOS and Linux for Chrome, Edge, Brave, Chromium, Opera and Opera GX. It does
not crawl the disk or start browsers. Only available executables are listed;
Playwright's bundled Chromium appears if it is installed. Use **Scan again**
after installing a browser. Portable/nonstandard installs can use **Custom
browser…** and supply a path under **Advanced settings**.

Firefox and Safari are not supported by the current Chromium controller.
Detected Chromium-based browsers still require a working compatible install;
detection does not guarantee that a specific browser version will launch.
Without a configured browser, startup selects the first detected supported
browser. An explicitly selected missing executable reports an error instead
of silently switching browsers. Review old snapshots' browser settings when
moving them between operating systems.

Turn **Headless** off to see the browser and log in yourself. Applying browser
settings recreates the browser and its managed tabs. Advanced settings retain
launch mode, isolated persistent profile path, CDP connection, hidden-screen
optimization, tab activation behavior and custom launch arguments.

Click **Add New Tab**, enter a URL (or leave it empty), then **Create Tab**.
Creation disables repeat clicks while the request is running and retains the
dialog and input if the request fails. The tab is acknowledged before the
website finishes loading; the card shows Loading or a navigation error separately.
A headless-mode notice explains why no desktop window opens, with a shortcut to
turn window visibility on in Browser Settings.

### Local Ubuntu installation

The user service supplies `HOST=127.0.0.1`, `BROWSER_TYPE=chrome`,
`BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome`, and `BROWSER_HEADLESS=false`.
The service starts with the graphical desktop session and uses its display
credentials; it does not reuse a personal Chrome profile. Without a desktop
display, visible mode reports an actionable error instead of hiding the browser.
These environment variables set startup defaults; dashboard changes apply to
the current runtime. Save/export a snapshot and load it again after a restart
to restore changed settings and workflows.

The installer checks for an available supported browser before downloading
Chromium. On Ubuntu 26.04, install Chrome, Brave or another supported browser
using your OS installer, then run `npm ci` normally. Browser tests reuse the
same detected executable. `npm start`, `npm stop` and `npm run clean` use Node
without POSIX shell tools. Stop uses a private `.cache/controller-PORT.json`
receipt and token-authenticated loopback request for this checkout only. It does
not kill arbitrary port listeners. Set the same `PORT` when starting/stopping a
nondefault instance. Keep the receipt private; it is ignored by Git and removed
on graceful shutdown. For an older running release without a receipt, use its
original terminal or service manager. Start/stop on native Windows still needs
verification on a Windows machine.

## Recommended Operating Pattern

- Keep background-safe mode enabled unless a workflow explicitly needs tab activation.
- Prefer queue repeat policy for skill rotations or click-heavy workflows.
- Use Run Once after editing click or move steps.
- Export configs before switching machines or cleaning the host environment.
