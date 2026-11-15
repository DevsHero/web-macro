// Synthetic controller benchmark. Uses an isolated headless browser; no game or
// user session is touched. Run: node scripts/performance-benchmark.js [output.json]
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { discoverBrowsers } = require('../browser-discovery');

(async () => {
  const filename = path.resolve(__dirname, '../server.js');
  const baseline = process.argv.find(arg => arg.startsWith('--baseline-ref='))?.split('=')[1];
  const source = baseline ? execFileSync('git', ['show', `${baseline}:server.js`], { cwd: path.dirname(filename), encoding: 'utf8' }) : fs.readFileSync(filename, 'utf8');
  const outputPath = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  const stepMs = Number(process.env.BENCH_STEP_MS || 1);
  const tabCount = Number(process.env.BENCH_TABS || 6);
  const powerSaving = process.argv.includes('--power-saving');
  const runtime = new Module(filename, module);
  runtime.filename = filename;
  runtime.paths = Module._nodeModulePaths(path.dirname(filename));
  runtime._compile('let stateBuilds = 0;\n' + source.slice(0, source.indexOf("process.on('SIGINT'"))
    .replace('function buildState() {', 'function buildState() { stateBuilds++;') + `
    module.exports = { app, server, bindSocketHandlers, createGameTab, tabs, runWorkflow,
      setPower: enabled => typeof setPowerSaving === 'function' ? setPowerSaving(enabled) : Promise.resolve(),
      getBuilds: () => stateBuilds,
      setContext(context) { browserContext = context; isBrowserContextClosed = false; browserConfigState.headless = true; }
    };`, filename);
  const api = runtime.exports;
  const browser = await chromium.launch({ headless: true, executablePath: discoverBrowsers()[0]?.executablePath });
  try {
    const context = await browser.newContext();
    api.setContext(context);
    api.bindSocketHandlers();
    api.app.get('/bench-client', (_req, res) => res.send(`<script src="/socket.io/socket.io.js"></script><script>
      window.metrics = { states: 0, stateBytes: 0, logPackets: 0, logEntries: 0 };
      window.socket = io({ transports: ['websocket'] });
      socket.on('state:snapshot', s => { metrics.states++; metrics.stateBytes += JSON.stringify(s).length; });
      socket.on('log:entry', () => { metrics.logPackets++; metrics.logEntries++; });
      socket.on('logs:batch', entries => { metrics.logPackets++; metrics.logEntries += entries.length; });
    </script>`));
    await new Promise(resolve => api.server.listen(0, '127.0.0.1', resolve));
    for (let tabIndex = 0; tabIndex < tabCount; tabIndex++) await api.createGameTab({ url: 'about:blank', pausedAll: true,
      workflows: Array.from({ length: 4 }, (_, index) => ({ name: `Workflow ${index}`, enabled: false,
        intervalSeconds: 60, notes: 'Benchmark definition '.repeat(8), steps: [{ command: 'wait', durationMs: stepMs }] })) });
    const client = await context.newPage();
    await client.goto(`http://127.0.0.1:${api.server.address().port}/bench-client`);
    await client.waitForFunction(() => window.metrics.states > 0);
    if (powerSaving) await api.setPower(true);
    const initial = api.getBuilds();
    await client.evaluate(() => { for (const key of Object.keys(metrics)) metrics[key] = 0; });
    const cpu = process.cpuUsage();
    const start = performance.now();
    await Promise.all([...api.tabs.values()].map(async tab => {
      for (let repeat = 0; repeat < 4; repeat++) for (const workflow of tab.workflows.values()) {
        await api.runWorkflow(tab, workflow, { trigger: 'benchmark', ignorePause: true });
      }
    }));
    const elapsedMs = performance.now() - start;
    await new Promise(resolve => setTimeout(resolve, powerSaving ? 1200 : 300));
    // Include deferred serialization/log delivery in both versions' CPU totals.
    const usedCpu = process.cpuUsage(cpu);
    const result = { scenario: `${tabCount} tabs x 4 workflows x 4 runs; ${stepMs} ms wait step; one live subscriber`, powerSaving,
      runs: [...api.tabs.values()].reduce((sum, tab) => sum + [...tab.workflows.values()].reduce((n, w) => n + w.runCount, 0), 0),
      errors: [...api.tabs.values()].reduce((sum, tab) => sum + [...tab.workflows.values()].reduce((n, w) => n + w.errorCount, 0), 0),
      elapsedMs: Math.round(elapsedMs), controllerCpuMs: Math.round((usedCpu.user + usedCpu.system) / 1000),
      stateBuilds: api.getBuilds() - initial, ...await client.evaluate(() => metrics) };
    if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => api.server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
