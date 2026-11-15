# Ubuntu Power Saving validation — 15 November 2026

## Scope and source

Base: `3af3d50a58cb3859a61841705d1b17f0600eb09f` (Mac handoff).
Implementation branch: `work/power-saving-ubuntu`.
Validation worktree: `/home/hero/Documents/GitHub/web-macro-ubuntu-validation`.
The installed service remains in `/home/hero/Documents/GitHub/web-macros` at its
previous release. Its process was not restarted or repointed. At entry the
service had 10 tabs; later read-only health observations showed zero. No test
attached to or controlled that service, its browser, accounts or workflows.
All test runtimes used separate browser contexts/processes and ephemeral ports.

Host: Ubuntu 26.04.1 x64, kernel 7.0.0-43-generic, Node 24.15.0,
12 logical/available CPU threads, 31,127 MiB RAM. Installed browsers detected:
Chrome 157.0.8103.50 and Brave 148.1.90.122. Browser execution below uses Chrome;
Brave was detected, not used for this acceptance campaign. Display and Wayland
session variables exist, but these checks are headless and not human acceptance.
Dependencies were reused from the existing install without mutating it.

## Repairs and observable behavior

- Graphics hooks now follow same-page canvas/context changes and actual WebGL
  context restoration. Partial installation rolls back when a method cannot be
  replaced. Property descriptors and the original bound renderer callback are
  restored; later client replacements are respected.
- On/Off/On updates serialize, including asynchronous module loading. Unsupported
  modules retain controller-only savings and a diagnostic reason.
- Each tab reports graphics compatibility through a change-only page binding.
  Navigation revisions reject old-document messages. Hidden subscribers still
  avoid snapshot builds; this adds no frame-by-frame polling or log stream.
- Start no longer kills an occupied port. Stop uses a private checkout-local
  receipt and token-authenticated loopback request, permitting graceful shutdown
  without POSIX tools or Windows signal emulation. Missing/wrong receipts cannot
  stop another listener. The receipt is not workflow state and is Git-ignored.
  Clean uses Node filesystem calls and retains receipts and saved snapshots.
- The test command uses Node's discovery rather than shell glob expansion.
  Existing sequence tests now isolate the mode switch from enabled interval
  timers, explicitly restore the skipped workflow after Resume All, and wait
  until the next deadline is installed before checking that polling is absent.
  These fixture races were corrected without changing sequence/input semantics.

## Ubuntu-exercised checks

`npm run check`, `npm run build:css`, `git diff --check`, `npm audit` (zero
reported vulnerabilities), and all 30 tests pass. The expanded dashboard check
also exercises global Pause/Reset/Resume in Interval and Sequence modes.

Coverage includes trusted repeated Enter → `@go 0` → Enter, editor focus across
nested/shadow/cross-origin frames, game hotkeys, scaled-iframe pointer coordinates
while Power Saving is enabled, AMD/ESM hooks, real WebGL offscreen passes,
context loss/restoration, rapid toggles, partial-hook rollback, fallback UI,
old-document rejection, bounded queues, hidden dashboards and canvas handle
reuse/release. Desktop and 390-pixel card screenshots were inspected.

Real isolated `npm start`/`npm stop` smoke passed: unauthenticated stop returns
403; authorized stop exits cleanly and removes its receipt; captured owned
Node/browser/renderer descendants are absent afterward. Starting on an unrelated
occupied port fails and leaves that listener alive. No hosted CI was run.

## Same-host controller microbenchmark

Commands use `BENCH_STEP_MS=50` with the maintained benchmark; baseline adds
`--baseline-ref=16a2687`, saving `*-final.json`. Four workflows per tab run four
times. These are wait steps, not game workloads. CPU times are noisy controller
process observations including deferred delivery, not Chrome/GPU/energy savings.

| Scenario | Runs / errors | State builds | Snapshot bytes | Log packets | Controller CPU ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before (`16a2687`) | 96 / 0 | 192 | 5,412,927 | 288 | 179 |
| Optimized | 96 / 0 | 9 | 256,449 | 9 | 49 |
| Power Saving | 96 / 0 | 1 | 29,261 | 0 | 34 |
| Power Saving, 20 tabs | 320 / 0 | 1 | 88,894 | 0 | 67 |

Optimized six-tab payload bytes were 95.3% lower than baseline in this
sample. The 20-tab case is a controller/queue check; it does not establish that
20 games fit a two-core host. Capacity 2/4 scheduler tests are simulations.

## Sustained six-tab component soak

Final run: 180.002 seconds, 36 five-second samples, canonical browser launch
flags, six independent tiny real-WebGL pages and scheduled 50 ms wait workflows,
alternating Interval/Sequence modes. Power Saving toggles every 30 seconds;
the dashboard is hidden for 30 seconds; pause/reset/resume, navigation and a
closed tab are included. The fixture's own game/render loop uses a native
16 ms interval; application rAF/timer APIs are not replaced. This deliberately
measures component behavior and is not a roBrowser game simulation/acceptance.
Selected source content hashes are recorded in `soak-final.json` and match the
code delivered with this report.

| Observation | Result |
| --- | ---: |
| Workflow completions / errors | 829 / 0 |
| Trusted chat submissions | 36 |
| Snapshot delta while hidden | 0 |
| Maximum sampled workflow backlog | 0 |
| Renderer-preparation queue observations | 108; peak queued 0 |
| Preparation queue wait p95 / max | 0.021 / 0.062 ms |
| Controller/harness RSS range | 95.4–119.5 MiB |
| Controller/harness heap range | 25.4–37.6 MiB |
| Sum of sampled browser-descendant RSS | 1,687.5–1,869.8 MiB |
| Controller/harness CPU total | 1,471 ms |
| Sampled browser-descendant CPU total | 12,600 ms |
| Largest 25 ms heartbeat timer drift | 91.7 ms |
| Tracked scanner ElementHandles after shutdown | 1 acquired / 1 disposed / 0 outstanding |

Each surviving page completed more than 11,000 fixture ticks; every offscreen
pass matched its game tick. Queue-wait timings concern short preparations, not
whole workflow/input delivery latency. Zero sampled backlog is specific to this
workload and does not prove overload latency. RSS sums double-count shared
pages and are not unique physical RAM or GPU VRAM. Descendant CPU uses Linux
/proc deltas (100 Hz); short-lived processes between samples and work before
the first sample can be missed. The harness's own diagnostics cost CPU. These
shared-desktop observations do not isolate GPU power or justify a watt saving.
Only scanner-owned ElementHandles were counted; this is not a census of all
DevTools remote objects, nor a proof that long sessions cannot leak.

## Native-rAF limitation and live-game gate

Both preliminary and canonical-launch six-tab rAF soaks completed without
workflow errors, but headless Chrome delivered only about 200 fixture renderer
callbacks per page over 180 seconds. Heartbeats/input continued. These results
are retained as a limitation and are not presented as maintained 60 FPS or proof
that real background games stay active. The separate active-page WebGL check
observed 45 ticks / 3 screen clears / 45 offscreen passes in 750 ms, with trusted
chat and restoration; this is still a fixture.

No authorized, selected, authenticated roBrowser session was exercised. Live
client version/module discovery, actual maps/picking/network behavior, native
multi-game rendering and human acceptance remain UNVERIFIED. The next slice is
one authorized owned game workflow with map/context changes before expanding
claims about background gameplay, quality or whole-browser savings. No personal
credentials or sessions were accessed to fill this gap.

## Windows: reviewed/simulated, not runtime accepted

Windows path candidates with Program Files/LOCALAPPDATA spaces, shell-free
installer child-process arguments and CPU-count fallback branches pass mocked
checks. Start/stop/clean/test scripts now use portable Node APIs. Receipt
validation and graceful stop are exercised on Ubuntu with paths containing
spaces and wrong-owner/unauthenticated cases. Node's documented Windows signal
behavior is why stop uses HTTP rather than `process.kill`/taskkill.
Primary references: [Node process](https://nodejs.org/api/process.html#signal-events),
[Node child process](https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows).
No Windows machine, native browser launch, ACL behavior or performance run was
available. These simulations are not Windows installed/runtime acceptance.

## Retained evidence

Developer-local directory:
`/home/hero/.local/share/web-macro/power-saving-ubuntu-20261115/`.
It contains environment/version metadata, initial failures, focused and final
checks, all raw benchmark JSON, three preliminary soak variants, the final
instrumented soak and source hashes, lifecycle results, UI screenshots, and the
standalone soak/lifecycle harnesses. Raw logs and machine-local receipts are
not committed. The source/report are public; all credentials, configs and
browser profiles retain their existing owners and locations.
