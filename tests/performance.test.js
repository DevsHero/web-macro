const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { createRuntimePublisher } = require('../lib/runtime-publisher');
const { createConfigCatalog } = require('../lib/config-catalog');
const { startSequence } = require('../lib/sequence');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('publisher collapses bursts, skips work without clients and bounds slow-client backlog', async () => {
  const clients = new Map();
  const io = { sockets: { sockets: clients }, engine: { get clientsCount() { return clients.size; } } };
  let builds = 0;
  let logs = [];
  const publisher = createRuntimePublisher({ io, buildState: () => ({ revision: ++builds }), getLogs: () => logs, delayMs: 5 });
  const events = [];
  const socket = { conn: { transport: { writable: true } }, emit: (event, value) => events.push({ event, value }) };
  try {
    for (let i = 0; i < 1000; i++) publisher.state();
    await wait(20);
    assert.equal(builds, 0);
    clients.set('client', socket);
    publisher.state(socket);
    events.length = 0;
    logs = Array.from({ length: 450 }, (_, i) => ({ id: i + 1 }));
    for (let i = 0; i < 1000; i++) { publisher.state(); publisher.log(); }
    await wait(25);
    assert.equal(events.filter(e => e.event === 'state:snapshot').length, 1);
    assert.equal(events.filter(e => e.event === 'logs:batch').length, 1);
    assert.equal(events.find(e => e.event === 'logs:batch').value.length, 450);
    events.length = 0;
    socket.conn.transport.writable = false;
    logs = Array.from({ length: 500 }, (_, i) => ({ id: i + 1000 }));
    for (let i = 0; i < 1000; i++) publisher.state();
    await wait(20);
    assert.equal(events.length, 0);
    assert.equal(builds, 2);
    socket.conn.transport.writable = true;
    await wait(20);
    assert.equal(events.filter(e => e.event === 'state:snapshot').length, 1);
    const replay = events.find(e => e.event === 'logs:batch').value;
    assert.equal(replay.length, 500);
    assert.equal(replay.at(-1).id, 1499);
    // A blocked dashboard must not cause repeat snapshots to healthy clients.
    const healthyEvents = [];
    const healthy = { conn: { transport: { writable: true } }, emit: (event, value) => healthyEvents.push({ event, value }) };
    clients.set('healthy', healthy);
    publisher.state(healthy);
    healthyEvents.length = 0;
    socket.conn.transport.writable = false;
    publisher.state();
    await wait(30);
    assert.equal(healthyEvents.filter(e => e.event === 'state:snapshot').length, 1);
    await wait(25);
    assert.equal(healthyEvents.filter(e => e.event === 'state:snapshot').length, 1);
    socket.conn.transport.writable = true;
    await wait(20);
    logs = [];
    publisher.clear();
    assert.deepEqual(events.at(-1), { event: 'logs:bootstrap', value: [] });
  } finally { publisher.close(); }
});

test('sustained state updates cannot starve logs or bypass a buffered transport', async () => {
  const events = [];
  const socket = { conn: { transport: { writable: true }, writeBuffer: [] }, emit(event) {
    events.push(event);
    this.conn.transport.writable = false;
  } };
  const io = { sockets: { sockets: new Map([['client', socket]]) }, engine: { clientsCount: 1 } };
  let logs = [{ id: 1 }];
  const publisher = createRuntimePublisher({ io, buildState: () => ({}), getLogs: () => logs, delayMs: 5 });
  try {
    publisher.state();
    await wait(20);
    assert.deepEqual(events, ['state:snapshot', 'logs:batch']);
    socket.conn.transport.writable = true;
    socket.conn.writeBuffer.push('pending packet');
    logs = [{ id: 2 }];
    publisher.state();
    await wait(20);
    assert.equal(events.length, 2);
    socket.conn.writeBuffer.length = 0;
    await wait(20);
    assert.deepEqual(events, ['state:snapshot', 'logs:batch', 'state:snapshot', 'logs:batch']);
  } finally { publisher.close(); }
});

test('saved catalog caches metadata, refreshes external edits and invalidates app writes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'web-macro-catalog-'));
  let now = 100;
  const catalog = createConfigCatalog(directory, { now: () => now, ttlMs: 10 });
  const file = path.join(directory, 'test.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ configName: 'First' }));
    const first = catalog.list();
    assert.equal(first[0].name, 'First');
    for (let i = 0; i < 100; i++) assert.equal(catalog.list(), first);
    fs.writeFileSync(file, JSON.stringify({ configName: 'Changed externally' }));
    assert.equal(catalog.list(), first);
    now += 11;
    assert.equal(catalog.list()[0].name, 'Changed externally');
    fs.writeFileSync(file, JSON.stringify({ configName: 'App write' }));
    catalog.invalidate();
    assert.equal(catalog.list()[0].name, 'App write');
    fs.unlinkSync(file);
    catalog.invalidate();
    assert.deepEqual(catalog.list(), []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('sequence parks without polling and wakes when a workflow is resumed', async () => {
  let comparisons = 0;
  let runs = 0;
  const workflows = new Map([['a', { id: 'a', enabled: false, pauseReason: 'manual', remainingMs: 100 }], ['b', { id: 'b', enabled: false, pauseReason: 'manual' }]]);
  const tab = { workflows, activeWorkflowId: null };
  startSequence(tab, { compareWorkflows: () => { comparisons++; return 0; }, onError: error => { throw error; },
    runWorkflow: async (_tab, workflow) => { runs++; workflow.remainingMs = 5000; workflow.nextRunAt = null; } });
  try {
    await wait(30);
    const initial = comparisons;
    await wait(220);
    assert.equal(comparisons, initial, 'paused sequences must not keep sorting/polling');
    workflows.get('a').enabled = true;
    workflows.get('a').pauseReason = null;
    tab.sequenceTimer.wake();
    const deadline = Date.now() + 1000;
    while (!runs && Date.now() < deadline) await wait(10);
    assert.equal(runs, 1);
    const sleeping = comparisons;
    await wait(200);
    assert.equal(comparisons, sleeping, 'long countdown uses its deadline, not a 100 ms poll');
  } finally { tab.sequenceTimer.stop(); }
});

test('missed scheduled intervals coalesce; explicit manual queue rejects overload', () => {
  const filename = path.resolve(__dirname, '../server.js');
  const source = fs.readFileSync(filename, 'utf8');
  const runtime = new Module(filename, module);
  runtime.filename = filename;
  runtime.paths = Module._nodeModulePaths(path.dirname(filename));
  runtime._compile(source.slice(0, source.indexOf("process.on('SIGINT'")) + '\nmodule.exports = { enqueueWorkflowRun, runtimePublisher };', filename);
  const workflow = { id: 'workflow-1', name: 'Slow', sortOrder: 1, queuedRuns: 0 };
  const tab = { id: 1, workflows: new Map([[workflow.id, workflow]]), workflowQueue: [] };
  try {
    for (let i = 0; i < 10000; i++) runtime.exports.enqueueWorkflowRun(tab, workflow, { trigger: 'scheduled' }, 'Pending');
    assert.equal(tab.workflowQueue.length, 1);
    assert.equal(workflow.queuedRuns, 1);
    for (let i = 0; i < 32; i++) runtime.exports.enqueueWorkflowRun(tab, workflow, { trigger: 'manual', ignorePause: true }, 'Manual');
    assert.throws(() => runtime.exports.enqueueWorkflowRun(tab, workflow, { ignorePause: true }, 'Overload'), error => error.statusCode === 429);
    assert.equal(tab.workflowQueue.length, 33);
  } finally { runtime.exports.runtimePublisher.close(); }
});

test('switching modes during an initial-delay run cannot resurrect an interval timer', async () => {
  const filename = path.resolve(__dirname, '../server.js');
  const source = fs.readFileSync(filename, 'utf8');
  const runtime = new Module(filename, module);
  runtime.filename = filename;
  runtime.paths = Module._nodeModulePaths(path.dirname(filename));
  runtime._compile(source.slice(0, source.indexOf("process.on('SIGINT'")) + '\nmodule.exports = { createTabRecord, upsertWorkflowOnTab, startWorkflow, setTabExecutionMode, disposeTabRuntime, runtimePublisher };', filename);
  const api = runtime.exports;
  const page = { on() {}, isClosed: () => false, url: () => 'about:blank', waitForTimeout: wait };
  const tab = api.createTabRecord(page);
  try {
    api.upsertWorkflowOnTab(tab.id, { name: 'Slow initial run', enabled: false, intervalSeconds: 10, steps: [{ command: 'wait', durationMs: 150 }] });
    const workflow = [...tab.workflows.values()][0];
    api.startWorkflow(tab, workflow, 100);
    const deadline = Date.now() + 1000;
    while (!workflow.activeRuns && Date.now() < deadline) await wait(10);
    assert.equal(workflow.activeRuns, 1);
    api.setTabExecutionMode(tab.id, 'sequence');
    while (workflow.activeRuns && Date.now() < deadline) await wait(10);
    assert.equal(workflow.runCount, 1);
    assert.equal(workflow.timer, null);
    assert.equal(workflow.resumeTimer, null);
    assert.equal(tab.executionMode, 'sequence');
  } finally { api.disposeTabRuntime(tab); api.runtimePublisher.close(); }
});

test('hidden dashboard subscribers do not trigger state builds', async () => {
  let builds = 0;
  const socket = { data: { dashboardVisible: false }, conn: { transport: { writable: true } }, emit() {} };
  const io = { sockets: { sockets: new Map([['client', socket]]) }, engine: { clientsCount: 1 } };
  const publisher = createRuntimePublisher({ io, buildState: () => { builds++; return {}; }, getLogs: () => [], delayMs: 5 });
  try {
    for (let i = 0; i < 1000; i++) { publisher.state(); publisher.log(); }
    await wait(20);
    assert.equal(builds, 0);
    socket.data.dashboardVisible = true;
    publisher.state(socket);
    assert.equal(builds, 1);
  } finally { publisher.close(); }
});
