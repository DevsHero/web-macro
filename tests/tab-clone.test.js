const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { chromium } = require('playwright');

test('Duplicate Tab prompts for URL and copies independent workflows through the dashboard', async () => {
  // Load the actual HTTP/socket handlers without booting the user's browser or
  // registering process shutdown handlers. This runtime has its own headless context.
  const filename = path.resolve(__dirname, '../server.js');
  const source = fs.readFileSync(filename, 'utf8');
  const runtime = new Module(filename, module);
  runtime.filename = filename;
  runtime.paths = Module._nodeModulePaths(path.dirname(filename));
  runtime._compile(source.slice(0, source.indexOf("process.on('SIGINT'")) + `
    module.exports = { server, bindSocketHandlers, createGameTab, tabs,
      setContext(context) { browserContext = context; isBrowserContextClosed = false; browserConfigState.headless = true; }
    };`, filename);
  const api = runtime.exports;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    api.setContext(context);
    api.bindSocketHandlers();
    await new Promise(resolve => api.server.listen(0, '127.0.0.1', resolve));
    const original = await api.createGameTab({ url: 'about:blank', label: 'Source', pausedAll: true, resumeWorkflows: true,
      defaultPosition: { coordinateSystem: 'viewport', mode: 'preset', preset: 'top-left' },
      workflows: [
        { name: 'Chat', enabled: true, intervalSeconds: 500, startDelaySeconds: 5, description: 'chat command', notes: 'keep notes', overlapPolicy: 'skip', tabActivationPolicy: 'background', sortOrder: 1,
          steps: [{ command: 'keyboard', key: 'Enter' }, { command: 'type', text: '@go 0', typingDelayMs: 25 }, { command: 'keyboard', key: 'Enter', holdDurationMs: 100 }] },
        { name: 'Buff', enabled: false, intervalSeconds: 60, sortOrder: 2, steps: [{ command: 'keyboard', key: 'F7' }] },
      ] });
    const dashboard = await context.newPage();
    await dashboard.goto(`http://127.0.0.1:${api.server.address().port}`);
    await dashboard.getByRole('button', { name: 'Duplicate Tab', exact: true }).click();
    await assert.equal(await dashboard.locator('#addTabUrlInput').inputValue(), 'about:blank');
    await dashboard.locator('#addTabUrlInput').fill('http://127.0.0.1:' + api.server.address().port + '/health');
    await dashboard.locator('#confirmAddTabButton').click();
    await dashboard.waitForFunction(() => document.querySelectorAll('[data-tab-card]').length === 2);
    const cloned = [...api.tabs.values()].find(tab => tab.id !== original.id);
    assert.equal(cloned.label, 'Source Copy');
    assert.equal(cloned.pausedAll, true);
    assert.deepEqual(cloned.defaultPosition, api.tabs.get(original.id).defaultPosition);
    assert.equal(cloned.workflows.size, 2);
    const originals = [...api.tabs.get(original.id).workflows.values()];
    [...cloned.workflows.values()].forEach((copy, index) => {
      const initial = originals[index];
      for (const field of ['name', 'enabled', 'sortOrder', 'intervalSeconds', 'startDelaySeconds', 'description', 'notes', 'overlapPolicy', 'tabActivationPolicy']) assert.equal(copy[field], initial[field], field);
      assert.notEqual(copy.id, initial.id);
      assert.equal(copy.runCount, 0);
      assert.equal(copy.errorCount, 0);
      assert.equal(copy.timer, null);
      copy.steps.forEach((step, stepIndex) => {
        const { id, ...definition } = step;
        const { id: originalId, ...originalDefinition } = initial.steps[stepIndex];
        assert.notEqual(id, originalId);
        assert.deepEqual(definition, originalDefinition);
      });
    });
    await cloned.page.waitForURL('**/health');
    [...cloned.workflows.values()][0].steps[1].text = 'changed';
    assert.equal(originals[0].steps[1].text, '@go 0');
    // Add Tab still uses the same dialog with clone state cleared.
    await dashboard.getByRole('button', { name: 'Add New Tab', exact: true }).click();
    assert.equal(await dashboard.locator('#addTabUrlInput').inputValue(), '');
    assert.equal(await dashboard.locator('#confirmAddTabButton').textContent(), 'Create Tab');
    await dashboard.locator('#cancelAddTabButton').click();
  } finally {
    await browser.close();
    await new Promise(resolve => api.server.close(resolve));
  }
});
