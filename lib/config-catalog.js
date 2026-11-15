const fs = require('node:fs');
const path = require('node:path');

// Directory polling detects external JSON edits without re-reading every saved
// snapshot on every workflow event. App writes invalidate this immediately.
function createConfigCatalog(directory, { now = Date.now, ttlMs = 5000 } = {}) {
  let nextScan = 0;
  let entries = [];
  const files = new Map();
  return {
    invalidate() { nextScan = 0; },
    list() {
      if (now() < nextScan) return entries;
      fs.mkdirSync(directory, { recursive: true });
      const names = fs.readdirSync(directory, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name);
      const present = new Set(names);
      for (const name of files.keys()) if (!present.has(name)) files.delete(name);
      entries = names.map(name => {
        const id = name.replace(/\.json$/i, '');
        try {
          const filename = path.join(directory, name);
          const stat = fs.statSync(filename);
          const signature = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
          if (files.get(name)?.signature === signature) return files.get(name).entry;
          const document = JSON.parse(fs.readFileSync(filename, 'utf8'));
          const entry = { id, name: document.configName || id, savedAt: document.savedAt || null };
          files.set(name, { signature, entry });
          return entry;
        } catch (_) { files.delete(name); return { id, name: id, savedAt: null }; }
      }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      nextScan = now() + ttlMs;
      return entries;
    },
  };
}
module.exports = { createConfigCatalog };
