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

## Workflow Scheduling Rules

- Workflows on the same tab run one at a time.
- The top workflow in the tab order gets priority when multiple runs are pending.
- Repeat triggers can queue or skip depending on the overlap setting.
- Different tabs may still run independently.

## Saved Snapshots

Use the config panel to:

- save a runtime snapshot
- load a snapshot
- delete a snapshot
- export a snapshot to JSON
- import a snapshot from JSON

`Resume enabled workflows when loading this snapshot` controls whether loaded workflows resume immediately.

## Browser Settings

Use Runtime Settings to adjust:

- browser executable selection
- launch mode
- persistent profile path
- CDP URL
- hidden-screen optimization
- tab activation behavior
- custom launch args

## Recommended Operating Pattern

- Keep background-safe mode enabled unless a workflow explicitly needs tab activation.
- Prefer queue repeat policy for skill rotations or click-heavy workflows.
- Use Run Once after editing click or move steps.
- Export configs before switching machines or cleaning the host environment.
