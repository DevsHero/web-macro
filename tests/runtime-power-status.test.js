const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { chromium } = require('playwright');
const { discoverBrowsers } = require('../browser-discovery');

test('dashboard reports graphics compatibility changes and rejects old-document status', async () => {
  const filename = path.resolve(__dirname, '../server.js');
  const source = fs.readFileSync(filename, 'utf8');
  const runtime = new Module(filename, module);
  runtime.filename = filename;
  runtime.paths = Module._nodeModulePaths(path.dirname(filename));
  runtime._compile(source.slice(0, source.indexOf("process.on('SIGINT'")) + `
    module.exports = { app, server, bindSocketHandlers, createGameTab, tabs, logs, setPowerSaving, runtimePublisher,
      setContext(context) { browserContext = context; isBrowserContextClosed = false; browserConfigState.headless = true; } };
  `, filename);
  const api = runtime.exports;
  const browser = await chromium.launch({ headless: true, executablePath: discoverBrowsers()[0]?.executablePath });
  try {
    const context = await browser.newContext();
    api.setContext(context); api.bindSocketHandlers();
    await new Promise(resolve => api.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${api.server.address().port}`;
    const created = await api.createGameTab({ url: 'about:blank' });
    const tab = api.tabs.get(created.id);
    await api.setPowerSaving(true);
    const dashboard = await context.newPage(); await dashboard.goto(base);
    await dashboard.locator('[data-power-status]').filter({ hasText: 'Controller savings only' }).waitFor();
    await tab.page.setContent(`<canvas width="100" height="100"></canvas><script>
      window.graphics = { bloom: true };
      window.renderer = { gl: document.querySelector('canvas').getContext('webgl'), renderCallbacks: [], _render() {} };
      renderer._renderBound = renderer._render.bind(renderer);
      window.requirejs = name => name === 'Renderer/Renderer' ? renderer : graphics;
      requirejs.defined = () => true;
    </script>`);
    await api.setPowerSaving(true);
    await dashboard.locator('[data-power-status]').filter({ hasText: 'Graphics savings active' }).waitFor();
    const oldRevision = tab.powerFrameEpochs.get(tab.page.mainFrame()) || 0;
    await tab.page.goto(base + '/health');
    await dashboard.locator('[data-power-status]').filter({ hasText: 'Controller savings only' }).waitFor();
    await tab.page.evaluate(revision => __webMacroReportPowerStatus({ enabled: true, adapter: 'robrowser-screen', revision }), oldRevision);
    assert.equal(tab.powerFrameStatuses.get(tab.page.mainFrame()).adapter, 'controller-only');
    assert.equal(api.logs.length, 0, 'diagnostics do not re-enable Power Saving logs');
    await api.setPowerSaving(false);
    await dashboard.locator('[data-power-status]').waitFor({ state: 'detached' });
    for (const executionMode of ['interval', 'sequence']) {
      await api.createGameTab({ url: 'about:blank', executionMode, resumeWorkflows: true,
        workflows: [{ name: `${executionMode} countdown`, enabled: true, intervalSeconds: 60,
          steps: [{ command: 'wait', durationMs: 50 }] }] });
    }
    await dashboard.locator('[data-all-tabs-action="pause"]').click();
    await dashboard.waitForFunction(() => [...document.querySelectorAll('[data-workflow-row]')].length === 2);
    assert.ok([...api.tabs.values()].every(t => [...t.workflows.values()].every(w => w.pauseReason !== null)));
    await dashboard.locator('[data-all-tabs-action="reset"]').click();
    // Reset does not resume paused workflows in either scheduler mode.
    assert.ok([...api.tabs.values()].every(t => [...t.workflows.values()].every(w => w.pauseReason !== null && w.remainingMs === w.intervalMs)));
    await dashboard.locator('[data-all-tabs-action="resume"]').click();
    assert.ok([...api.tabs.values()].every(t => [...t.workflows.values()].every(w => w.pauseReason === null)));
    // Stop the bounded test countdowns before closing the isolated context.
    await dashboard.locator('[data-all-tabs-action="pause"]').click();
  } finally { api.runtimePublisher.close(); await browser.close(); await new Promise(resolve => api.server.close(resolve)); }
});
