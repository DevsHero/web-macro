const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { browserCandidates } = require('../browser-discovery');
const { createRuntimeControl, stopRuntime } = require('../lib/runtime-control');

test('Windows standard and per-user browser paths preserve spaces', () => {
  const browsers = browserCandidates('win32', { PROGRAMFILES: 'D:\\Program Files', LOCALAPPDATA: 'C:\\Users\\Some User\\AppData\\Local' }, 'C:\\Users\\Some User');
  assert.ok(browsers.find(b => b.type === 'chrome').paths.includes('D:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'));
  assert.ok(browsers.find(b => b.type === 'opera-gx').paths.includes('C:\\Users\\Some User\\AppData\\Local\\Programs\\Opera GX\\opera.exe'));
});

test('CPU fallback and Windows installer spawn do not require a shell', () => {
  for (const count of [0, 2]) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../lib/host-scheduler.js'), 'utf8'), { require: () => ({ cpus: () => Array(count).fill({}) }), module });
    assert.equal(module.exports.createHostScheduler().summary().preparationSlots, count || 1);
  }
  const processStub = { execPath: 'C:\\Program Files\\nodejs\\node.exe' };
  let spawn;
  const requireStub = name => name === 'node:child_process' ? { spawnSync: (...args) => { spawn = args; return { status: 1 }; } } : { discoverBrowsers: () => [] };
  requireStub.resolve = () => 'C:\\Some Project\\node_modules\\playwright\\cli.js';
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../scripts/install-browser.js'), 'utf8'), { require: requireStub, process: processStub, console: { log() {}, error() {} } });
  assert.equal(spawn[0], processStub.execPath);
  assert.equal(spawn[1][0], requireStub.resolve());
  assert.equal(spawn[2].shell, undefined);
  assert.equal(processStub.exitCode, 1);
});

test('local stop requires the matching checkout receipt and never kills port occupants', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web macro control '));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'web macro other '));
  const app = express(); let stopped = 0;
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const control = createRuntimeControl({ app, port, root, shutdown: async () => { stopped++; } });
  try {
    control.started();
    const response = await fetch(`http://127.0.0.1:${port}/api/runtime/stop`, { method: 'POST' });
    assert.equal(response.status, 403);
    await assert.rejects(stopRuntime(other, port));
    fs.mkdirSync(path.join(other, '.cache'));
    fs.writeFileSync(path.join(other, '.cache', `controller-${port}.json`), JSON.stringify({ port, token: '0'.repeat(64) }));
    await assert.rejects(stopRuntime(other, port), /403/);
    assert.equal(stopped, 0);
    await stopRuntime(root, port);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(stopped, 1);
    control.close(); assert.equal(fs.existsSync(path.join(root, '.cache', `controller-${port}.json`)), false);
  } finally { control.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true }); fs.rmSync(other, { recursive: true }); }
});
