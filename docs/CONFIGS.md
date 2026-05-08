# Config Portability

## Format

web-macro stores portable snapshots as JSON files in `configs/`.

Each file contains:

```json
{
  "configName": "example",
  "savedAt": "2026-05-08T00:00:00.000Z",
  "browser": {},
  "tabs": []
}
```

## Exporting

Use the dashboard `Export JSON` action to download the selected config.

This is the preferred machine-transfer flow because it:

- preserves browser runtime settings
- preserves workflow ordering
- preserves per-tab workflow definitions
- keeps the config human-readable for review

## Importing

Use `Import JSON` in the config panel and choose a previously exported snapshot.

Import behavior:

- validates that the payload includes a config name and tab array
- normalizes the browser config to current server defaults
- stores the snapshot in `configs/`
- makes it immediately available in the saved-config list

## Manual Transfer

You can also copy files directly from `configs/` to another machine.

Recommended steps:

1. copy the JSON file
2. move it into the target machine's `configs/` directory
3. start web-macro
4. load the imported snapshot from the dashboard

## Best Practices

- keep config names stable and descriptive
- export before major workflow edits
- keep one known-good recovery snapshot
- prefer JSON transfer over copying browser profile directories
