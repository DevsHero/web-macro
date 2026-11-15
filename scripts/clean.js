const fs = require('node:fs');
const path = require('node:path');
// Do not delete saved configs or controller stop receipts; a running instance
// must remain stoppable. Only the historical disposable browser caches are reset.
for (const directory of ['user_data', 'opera_profile']) {
  fs.rmSync(path.resolve(__dirname, '..', directory), { recursive: true, force: true });
}
