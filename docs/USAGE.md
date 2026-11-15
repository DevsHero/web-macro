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

If the Chromium postinstall downloader does not support your OS, install with
`npm ci --ignore-scripts && npm run build:css` and select an existing supported
browser. The local service starts Node directly; the upstream npm start/stop
scripts kill listeners on the selected port.

## Recommended Operating Pattern

- Keep background-safe mode enabled unless a workflow explicitly needs tab activation.
- Prefer queue repeat policy for skill rotations or click-heavy workflows.
- Use Run Once after editing click or move steps.
- Export configs before switching machines or cleaning the host environment.
