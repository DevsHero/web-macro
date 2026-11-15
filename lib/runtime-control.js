const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Local launcher receipt only, not workflow state. It never identifies an owner
// by port alone, and stop never sends a signal to an arbitrary listener/PID.
function createRuntimeControl({ app, port, root, shutdown }) {
  const file = path.join(root, '.cache', `controller-${port}.json`);
  const token = crypto.randomBytes(32).toString('hex');
  app.post('/api/runtime/stop', (req, res) => {
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!loopback || req.headers.authorization !== `Bearer ${token}`) return res.sendStatus(403);
    res.once('finish', () => { void shutdown('local stop'); });
    res.json({ ok: true });
  });
  return {
    started(address) {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${token}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({ port, token, host: address?.address === '::1' ? '::1' : '127.0.0.1' }), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, file);
    },
    close() {
      try { if (JSON.parse(fs.readFileSync(file, 'utf8')).token === token) fs.unlinkSync(file); }
      catch (_) { /* A missing/stale receipt cannot authorize a different process. */ }
    },
  };
}
async function stopRuntime(root, port) {
  const file = path.join(root, '.cache', `controller-${port}.json`);
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (receipt.port !== port || !/^[a-f0-9]{64}$/.test(receipt.token)) throw new Error('Invalid local controller receipt.');
  const host = receipt.host || '127.0.0.1';
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('Controller stop requires a loopback address.');
  const response = await fetch(`http://${host === '::1' ? '[::1]' : host}:${port}/api/runtime/stop`, {
    method: 'POST', headers: { authorization: `Bearer ${receipt.token}` }, signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Controller refused stop (${response.status}); no process was killed.`);
  if ((await response.json()).ok !== true) throw new Error('Listener did not confirm a controller stop.');
}
module.exports = { createRuntimeControl, stopRuntime };
