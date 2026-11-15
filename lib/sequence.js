// One countdown and one execution at a time, in the visible workflow order.
function startSequence(tab, { runWorkflow, compareWorkflows, onError }) {
  let running = false;
  const timer = setInterval(async () => {
    if (running || tab.isDisposing || tab.activeWorkflowId !== null) return;
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
    if (Date.now() < current.nextRunAt) return;
    running = true;
    try {
      await runWorkflow(tab, current, { trigger: 'sequence', bypassQueue: true });
      if (tab.sequenceTimer === timer) {
        tab.sequenceCursorId = current.id;
        tab.sequenceCurrentId = null;
      }
    } catch (error) {
      onError(error);
    } finally { running = false; }
  }, 100);
  timer.unref();
  tab.sequenceTimer = timer;
}

module.exports = { startSequence };
