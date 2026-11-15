const path = require('node:path');
const { stopRuntime } = require('../lib/runtime-control');
const port = Number(process.env.PORT || 3005);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exitCode = 1;
} else {
  stopRuntime(path.resolve(__dirname, '..'), port)
    .then(() => console.log('Graceful stop requested for this checkout’s controller.'))
    .catch(error => { console.error(`Cannot stop this checkout’s controller: ${error.message}`); process.exitCode = 1; });
}
