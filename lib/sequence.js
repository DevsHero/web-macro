// One deadline timer per tab. Paused/empty sequences have no timer at all;
// workflow mutations and completion explicitly wake the scheduler.
function startSequence(tab, { runWorkflow, compareWorkflows, onError }) {
  let timer = null;
  let running = false;
  let stopped = false;
  function schedule(delay = 0) {
    if (stopped || running) return;
    clearTimeout(timer);
    timer = setTimeout(tick, Math.max(0, Math.min(delay, 2147483647)));
    timer.unref();
  }
  const controller = {
    wake() { schedule(); },
    stop() { stopped = true; clearTimeout(timer); timer = null; },
  };
  async function tick() {
    timer = null;
    if (stopped || tab.isDisposing || tab.activeWorkflowId !== null) return;
    const workflows = [...tab.workflows.values()].sort(compareWorkflows);
    let current = workflows.find(w => w.id === tab.sequenceCurrentId && w.enabled && w.pauseReason === null);
    if (!current) {
      const cursor = workflows.findIndex(w => w.id === tab.sequenceCursorId);
      for (let offset = 1; offset <= workflows.length; offset++) {
        const candidate = workflows[(cursor + offset) % workflows.length];
        if (candidate.enabled && candidate.pauseReason === null) { current = candidate; break; }
      }
      tab.sequenceCurrentId = current?.id || null;
      if (!current) return;
      current.nextRunAt = Date.now() + Math.max(100, current.remainingMs ?? current.intervalMs);
    }
    if (current.nextRunAt === null) current.nextRunAt = Date.now() + Math.max(100, current.remainingMs ?? current.intervalMs);
    const remaining = current.nextRunAt - Date.now();
    if (remaining > 0) { schedule(remaining); return; }
    running = true;
    try {
      await runWorkflow(tab, current, { trigger: 'sequence', bypassQueue: true });
      if (!stopped && tab.sequenceTimer === controller) {
        tab.sequenceCursorId = current.id;
        tab.sequenceCurrentId = null;
      }
    } catch (error) { onError(error); }
    finally { running = false; schedule(); }
  }
  tab.sequenceTimer = controller;
  schedule();
}
module.exports = { startSequence };
