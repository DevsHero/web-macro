// Collapse bursts into one latest-state update. Slow transports never accumulate
// snapshots; log history is replayed from the bounded server ring when writable.
function createRuntimePublisher({ io, buildState, getLogs, delayMs = 100 }) {
  let timer = null;
  let stateRevision = 0;
  const stateCursors = new WeakMap();
  let closed = false;
  const cursors = new WeakMap();
  function sockets() { return [...io.sockets.sockets.values()].filter(socket => socket.data?.dashboardVisible !== false); }
  function schedule() {
    if (closed || timer || io.engine.clientsCount === 0 || !sockets().length) return;
    timer = setTimeout(flush, typeof delayMs === 'function' ? delayMs() : delayMs);
    timer.unref();
  }
  function flush() {
    timer = null;
    const clients = sockets();
    if (!clients.length) return;
    // Decide once per flush: WebSocket marks itself busy after the first emit.
    // Allow one snapshot plus one log batch together so sustained state changes
    // cannot starve logs, then wait for the entire transport buffer to drain.
    const writable = new Set(clients.filter(socket => socket.conn.transport.writable && !socket.conn.writeBuffer?.length));
    const ready = clients.filter(socket => writable.has(socket) && (stateCursors.get(socket) ?? -1) < stateRevision);
    if (ready.length) {
      const snapshot = buildState();
      for (const socket of ready) { socket.emit('state:snapshot', snapshot); stateCursors.set(socket, stateRevision); }
    }
    const statePending = clients.some(socket => (stateCursors.get(socket) ?? -1) < stateRevision);
    const logs = getLogs();
    let pendingLogs = false;
    for (const socket of clients) {
      const cursor = cursors.get(socket) || 0;
      const entries = logs.filter(entry => entry.id > cursor);
      if (!entries.length) continue;
      if (!writable.has(socket)) { pendingLogs = true; continue; }
      socket.emit('logs:batch', entries);
      cursors.set(socket, entries[entries.length - 1].id);
    }
    if (statePending || pendingLogs) schedule();
  }
  return {
    state(target) {
      if (target) {
        target.emit('state:snapshot', buildState());
        stateCursors.set(target, stateRevision);
        const logs = getLogs();
        cursors.set(target, logs.length ? logs[logs.length - 1].id : 0);
        return;
      }
      stateRevision++;
      schedule();
    },
    log: schedule,
    clear() {
      for (const socket of sockets()) {
        socket.emit('logs:bootstrap', []);
        cursors.set(socket, 0);
      }
    },
    close() { closed = true; clearTimeout(timer); timer = null; },
  };
}
module.exports = { createRuntimePublisher };
