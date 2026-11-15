const os = require('node:os');

// Only short renderer/protocol preparation runs here. Never hold a slot during
// a macro's delay, key hold, movement or navigation; those retain their timing.
function createHostScheduler({ parallelism = os.availableParallelism?.() || os.cpus().length || 1 } = {}) {
  const limit = Math.max(1, Math.floor(parallelism));
  const queues = new Map();
  const ready = [];
  const busy = new Set();
  let active = 0;
  function drain() {
    while (active < limit && ready.length) {
      const key = ready.shift();
      const queue = queues.get(key);
      const job = queue.shift();
      active++;
      busy.add(key);
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
        active--;
        busy.delete(key);
        if (queue.length) ready.push(key);
        else queues.delete(key);
        drain();
      });
    }
  }
  return {
    run(key, task) {
      return new Promise((resolve, reject) => {
        let queue = queues.get(key);
        if (!queue) { queue = []; queues.set(key, queue); }
        if (!queue.length && !busy.has(key)) ready.push(key);
        queue.push({ task, resolve, reject });
        drain();
      });
    },
    summary() { return { availableCpus: limit, preparationSlots: limit, active, queued: [...queues.values()].reduce((n, q) => n + q.length, 0) }; },
  };
}
const hostScheduler = createHostScheduler();
module.exports = { createHostScheduler, hostScheduler };
