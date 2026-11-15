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
    module.exports = { server, bindSocketHandlers, createGameTab, tabs, logs, serializeTabForConfig, addLog, emitState, runWorkflow, buildState, normalizeBrowserConfig,
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
    // All and individual controls operate on the same workflow states, including
    // legacy tab-paused workflows and manually paused/disabled workflows.
    const card = dashboard.locator(`[data-tab-card][data-tab-id="${original.id}"]`);
    await card.getByRole('button', { name: 'Resume All', exact: true }).click();
    await card.getByRole('button', { name: 'Pause All', exact: true }).waitFor();
    assert.ok(originals.every(w => w.enabled && w.pauseReason === null));
    const chatRow = card.locator(`[data-workflow-row][data-workflow-id="${originals[0].id}"]`);
    await chatRow.getByRole('button', { name: 'Pause', exact: true }).click();
    await chatRow.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    assert.equal(originals[0].enabled, false);
    assert.equal(originals[1].enabled, true);
    await card.getByRole('button', { name: 'Pause All', exact: true }).click();
    await card.getByRole('button', { name: 'Resume All', exact: true }).waitFor();
    assert.ok(originals.every(w => !w.enabled && w.pauseReason !== null));
    // A child can resume directly after All paused the tab.
    await chatRow.getByRole('button', { name: 'Resume', exact: true }).click();
    await card.getByRole('button', { name: 'Pause All', exact: true }).waitFor();
    assert.equal(originals[0].enabled, true);
    assert.equal(originals[1].enabled, false);
    originals[1].remainingMs = 1234;
    const previousDeadline = originals[0].nextRunAt;
    await card.getByRole('button', { name: 'Reset All Countdowns', exact: true }).click();
    await dashboard.getByText('All countdowns reset to their full intervals.', { exact: true }).waitFor();
    assert.ok(originals[0].nextRunAt > previousDeadline);
    assert.equal(originals[1].remainingMs, originals[1].intervalMs);
    assert.equal(originals[1].enabled, false);
    assert.equal(originals[1].timer, null);
    assert.equal(originals[1].nextRunAt, null);
    await card.getByRole('button', { name: 'Pause All', exact: true }).click();
    await card.getByRole('button', { name: 'Resume All', exact: true }).waitFor();
    await card.getByRole('button', { name: 'Resume All', exact: true }).click();
    await card.getByRole('button', { name: 'Pause All', exact: true }).waitFor();
    assert.ok(originals.every(w => w.enabled && w.pauseReason === null));
    await dashboard.evaluate(id => { window.__stableCard = document.querySelector(`[data-tab-card][data-tab-id="${id}"]`); }, cloned.id);
    await card.getByRole('button', { name: 'Pause All', exact: true }).click();
    await card.getByRole('button', { name: 'Resume All', exact: true }).waitFor();
    assert.equal(await dashboard.evaluate(id => document.querySelector(`[data-tab-card][data-tab-id="${id}"]`) === window.__stableCard, cloned.id), true, 'an unrelated tab retains its DOM and scroll state');
    // Runtime counters in a preserved card still update when another card changes.
    const clonedWorkflow = [...cloned.workflows.values()][0];
    clonedWorkflow.runCount = 7;
    api.tabs.get(original.id).label = 'Source updated';
    api.emitState();
    await dashboard.locator(`[data-tab-id="${cloned.id}"] [data-workflow-id="${clonedWorkflow.id}"] [data-runtime-role="runs"]`).getByText('Runs 7', { exact: true }).waitFor();
    assert.equal(await dashboard.evaluate(() => window.__stableCard.isConnected), true);
    await card.getByRole('button', { name: 'Resume All', exact: true }).click();
    await card.getByRole('button', { name: 'Pause All', exact: true }).waitFor();
    // Add Tab still uses the same dialog with clone state cleared.
    await dashboard.getByRole('button', { name: 'Add New Tab', exact: true }).click();
    assert.equal(await dashboard.locator('#addTabUrlInput').inputValue(), '');
    assert.equal(await dashboard.locator('#confirmAddTabButton').textContent(), 'Create Tab');
    await dashboard.locator('#cancelAddTabButton').click();
    await card.getByRole('button', { name: 'Pause All', exact: true }).click();
    await card.getByRole('button', { name: 'Resume All', exact: true }).waitFor();
    const sequenced = await api.createGameTab({ url: 'about:blank', resumeWorkflows: true, workflows: [
      { name: 'Bottom', sortOrder: 2, enabled: true, intervalSeconds: 1, steps: [{ command: 'wait', durationMs: 80 }] },
      { name: 'Top', sortOrder: 1, enabled: true, intervalSeconds: 2, steps: [{ command: 'wait', durationMs: 80 }] },
      { name: 'Skipped', sortOrder: 3, enabled: false, intervalSeconds: 1, steps: [{ command: 'wait', durationMs: 80 }] },
    ] });
    const seqCard = dashboard.locator(`[data-tab-card][data-tab-id="${sequenced.id}"]`);
    await seqCard.getByRole('button', { name: 'Mode: Interval', exact: true }).click();
    await seqCard.getByRole('button', { name: 'Mode: Sequence', exact: true }).waitFor();
    const sequenceTab = api.tabs.get(sequenced.id);
    assert.equal(api.serializeTabForConfig(sequenceTab).executionMode, 'sequence');
    const deadline = Date.now() + 10000;
    const starts = () => api.logs.filter(log => log.tabId === sequenced.id && log.action === 'workflow.start');
    while (starts().length < 4 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(starts().slice(0, 4).map(log => log.workflowName), ['Top', 'Bottom', 'Top', 'Bottom']);
    const events = api.logs.filter(log => log.tabId === sequenced.id && ['workflow.start', 'workflow.complete'].includes(log.action));
    for (let index = 1; index < events.length; index++) assert.notEqual(events[index].action, events[index - 1].action);
    assert.ok([...sequenceTab.workflows.values()].every(w => w.timer === null && w.resumeTimer === null));
    await seqCard.getByRole('button', { name: 'Pause All', exact: true }).click();
    await seqCard.getByRole('button', { name: 'Resume All', exact: true }).waitFor();
    const count = starts().length;
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(starts().length, count);
    await seqCard.getByRole('button', { name: 'Mode: Sequence', exact: true }).click();
    await seqCard.getByRole('button', { name: 'Mode: Interval', exact: true }).waitFor();
    assert.equal(sequenceTab.sequenceTimer, null);
    // Header controls are explicit actions across all tabs, including mixed states
    // and a Sequence tab. Repeated Pause must never toggle a tab back on.
    await seqCard.getByRole('button', { name: 'Mode: Interval', exact: true }).click();
    await seqCard.getByRole('button', { name: 'Mode: Sequence', exact: true }).waitFor();
    const globalControls = dashboard.getByRole('group', { name: 'All tabs controls' });
    async function globalAction(name) {
      await globalControls.getByRole('button', { name, exact: true }).click();
      await dashboard.waitForFunction(() => [...document.querySelectorAll('[data-all-tabs-action]')].every(button => !button.disabled));
    }
    const everyWorkflow = () => [...api.tabs.values()].flatMap(tab => [...tab.workflows.values()]);
    await globalAction('Resume All Tabs');
    assert.ok(everyWorkflow().every(w => w.enabled && w.pauseReason === null));
    await globalAction('Pause All Tabs');
    await globalAction('Pause All Tabs');
    assert.ok(everyWorkflow().every(w => !w.enabled && w.pauseReason !== null));
    for (const workflow of everyWorkflow()) workflow.remainingMs = 123;
    await globalAction('Reset All Countdowns');
    assert.ok(everyWorkflow().every(w => !w.enabled && w.remainingMs === w.intervalMs && w.nextRunAt === null));
    assert.equal(sequenceTab.sequenceCursorId, null);
    await globalAction('Resume All Tabs');
    await globalAction('Resume All Tabs');
    assert.ok(everyWorkflow().every(w => w.enabled && w.pauseReason === null));
    await globalAction('Reset All Countdowns');
    assert.ok(everyWorkflow().every(w => w.enabled && w.pauseReason === null && w.remainingMs === w.intervalMs));
    assert.ok([...sequenceTab.workflows.values()].every(w => w.timer === null && w.resumeTimer === null));
    await globalAction('Pause All Tabs');
    // Log bursts do not rebuild the hidden panel; opening it shows current data.
    await dashboard.evaluate(() => {
      window.__logMutations = 0;
      new MutationObserver(records => { window.__logMutations += records.length; }).observe(document.querySelector('#logConsole'), { childList: true, subtree: true });
    });
    for (let index = 0; index < 100; index++) api.addLog(`Performance log ${index}`);
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(await dashboard.evaluate(() => window.__logMutations), 0);
    await dashboard.getByRole('button', { name: 'Show Logs', exact: true }).click();
    await dashboard.getByText('Performance log 99', { exact: true }).waitFor();
    // A hidden dashboard parks DOM work and refreshes when visible again.
    await dashboard.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.__tabMutations = 0;
      new MutationObserver(records => { window.__tabMutations += records.length; }).observe(document.querySelector('#tabsGrid'), { childList: true, subtree: true });
    });
    sequenceTab.label = 'Updated while hidden';
    api.emitState();
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(await dashboard.evaluate(() => window.__tabMutations), 0);
    await dashboard.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await seqCard.getByRole('heading', { name: 'Updated while hidden', exact: true }).waitFor();
    const managedPages = [...api.tabs.values()].map(tab => tab.page);
    const ids = everyWorkflow().map(workflow => workflow.id);
    await dashboard.getByRole('button', { name: 'Power Saving: Off', exact: true }).click();
    await dashboard.getByRole('button', { name: 'Power Saving: On', exact: true }).waitFor();
    assert.equal(api.buildState().browserConfig.powerSaving, true);
    assert.equal(api.normalizeBrowserConfig({}).powerSaving, false, 'older snapshots remain compatible');
    assert.equal(await dashboard.getByRole('button', { name: 'Logs Off (Power Saving)', exact: true }).isDisabled(), true);
    api.addLog('This log must not be recorded');
    assert.equal(api.logs.length, 0);
    const manual = [...sequenceTab.workflows.values()][0];
    const runsBefore = manual.runCount;
    await api.runWorkflow(sequenceTab, manual, { trigger: 'manual', ignorePause: true });
    assert.equal(manual.runCount, runsBefore + 1);
    assert.equal(api.logs.length, 0);
    const savedSteps = manual.steps;
    const errorsBefore = manual.errorCount;
    manual.steps = [{ command: 'invalid-test-step' }];
    await api.runWorkflow(sequenceTab, manual, { trigger: 'manual', ignorePause: true });
    assert.equal(manual.errorCount, errorsBefore + 1);
    assert.match(manual.lastError, /Unsupported command/);
    assert.equal(api.logs.length, 0, 'errors remain visible in workflow state without a log stream');
    manual.steps = savedSteps;
    assert.deepEqual([...api.tabs.values()].map(tab => tab.page), managedPages, 'mode toggles do not restart browser sessions');
    assert.deepEqual(everyWorkflow().map(workflow => workflow.id), ids);
    await dashboard.getByRole('button', { name: 'Power Saving: On', exact: true }).click();
    await dashboard.getByRole('button', { name: 'Power Saving: Off', exact: true }).waitFor();
    assert.equal(api.buildState().browserConfig.powerSaving, false);
    api.addLog('Logging resumed');
    assert.equal(api.logs.at(-1).message, 'Logging resumed');
  } finally {
    await browser.close();
    await new Promise(resolve => api.server.close(resolve));
  }
});
