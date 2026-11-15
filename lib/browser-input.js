const { hostScheduler } = require('./host-scheduler');

async function waitForPageReady(page) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
  } catch (_error) {
    // Ignore slow page loads.
  }
}

// This module owns cached handles. Release every discarded candidate and drop
// the cache on page/frame lifecycle changes instead of retaining remote objects.
const canvasCaches = new WeakMap();
function canvasCache(page) {
  let cache = canvasCaches.get(page);
  if (cache) return cache;
  cache = { target: null, generation: 0, pending: null };
  const invalidate = () => {
    cache.generation++;
    if (cache.target) void cache.target.canvasHandle.dispose().catch(() => {});
    cache.target = null;
  };
  page.on('framenavigated', invalidate);
  page.on('frameattached', invalidate);
  page.on('framedetached', invalidate);
  page.on('close', invalidate);
  canvasCaches.set(page, cache);
  return cache;
}

async function locateGameCanvas(page) {
  const cache = canvasCache(page);
  if (cache.pending) return cache.pending;
  cache.pending = findGameCanvas(page, cache);
  try { return await cache.pending; }
  finally { cache.pending = null; }
}

async function findGameCanvas(page, cache) {
  if (!cache.target) await waitForPageReady(page);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const generation = cache.generation;
    let best = null;
    const created = [];
    try {
      // Rank in the renderer in one call, then acquire just one candidate per
      // frame. frames() already includes the main frame. Revalidate every lookup
      // so a new/larger canvas wins immediately, even during map transitions.
      for (const frame of page.frames()) {
        if (frame.isDetached()) continue;
        const cachedFrame = cache.target && (cache.target.frame || page.mainFrame());
        const previous = cachedFrame === frame ? cache.target.canvasHandle : null;
        let rank;
        try {
          rank = await hostScheduler.run(page, () => frame.locator('canvas').evaluateAll((nodes, previous) => {
            let index = -1, area = 0;
            nodes.forEach((node, i) => {
              const box = node.getBoundingClientRect();
              if (box.width >= 2 && box.height >= 2 && box.width * box.height > area) {
                index = i; area = box.width * box.height;
              }
            });
            return { index, cached: index >= 0 && nodes[index] === previous };
          }, previous));
        } catch (error) { if (frame.isDetached() || generation !== cache.generation) continue; throw error; }
        if (rank.index < 0) continue;
        const handle = rank.cached ? previous : await frame.locator('canvas').nth(rank.index).elementHandle();
        if (!handle) continue;
        if (handle !== previous) created.push(handle);
        // Compare page-relative geometry to retain correct selection across
        // transformed/scaled iframes as well as ordinary pages.
        const box = await handle.boundingBox();
        if (box && box.width >= 2 && box.height >= 2 && (!best || box.width * box.height > best.area)) {
          best = { area: box.width * box.height, canvasHandle: handle, frame: frame === page.mainFrame() ? null : frame };
        }
      }
      if (generation !== cache.generation) { best = null; continue; }
      if (cache.target && cache.target.canvasHandle !== best?.canvasHandle) await cache.target.canvasHandle.dispose().catch(() => {});
      cache.target = best ? { frame: best.frame, canvasHandle: best.canvasHandle } : null;
      if (cache.target) return cache.target;
    } finally {
      for (const handle of created) if (handle !== cache.target?.canvasHandle) await handle.dispose().catch(() => {});
    }
    await page.waitForTimeout(180);
  }
  return null;
}

// Follow the actual focused frame chain, including open shadow roots. Never
// use remembered focus from an inactive iframe or require document.hasFocus().
async function hasFocusedEditable(page) {
  let frame = page.mainFrame();
  while (frame) {
    const state = await hostScheduler.run(page, () => frame.evaluate(() => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return { editable: Boolean(active && (active.matches('input, textarea, select') || active.isContentEditable)),
        childFrame: active?.tagName === 'IFRAME' || active?.tagName === 'FRAME' };
    }));
    if (state.editable) return true;
    if (!state.childFrame) return false;
    const active = await frame.evaluateHandle(() => {
      let node = document.activeElement;
      while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
      return node;
    });
    try { frame = await active.asElement()?.contentFrame(); }
    finally { await active.dispose(); }
  }
  return false;
}

async function pressMacroKey(page, key, holdDurationMs = 0, { preserveEditableFocus = true } = {}) {
  if (!(preserveEditableFocus && await hasFocusedEditable(page))) {
    const target = await locateGameCanvas(page);
    if (target) await hostScheduler.run(page, () => target.canvasHandle.evaluate(node => {
      if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
      node.focus();
    }));
  }
  // A trusted key event goes to the existing focused editor/canvas. Element.press
  // would focus the canvas again and add another protocol roundtrip.
  await page.keyboard.press(key, { delay: holdDurationMs });
}

// Each run starts with game keys. After typing, keep subsequent keys in the
// editor until an explicit focus-changing action. Resetting this per run also
// handles chat left open by a command response (for example a server cooldown).
function createWorkflowInput(page) {
  let preserveEditableFocus = false;

  return {
    pressKey(key, holdDurationMs = 0) {
      return pressMacroKey(page, key, holdDurationMs, { preserveEditableFocus });
    },
    async typeText(text, { clearFirst = false, typingDelayMs = 0 } = {}) {
      preserveEditableFocus = true;
      if (clearFirst) {
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(30);
        await page.keyboard.press('Delete');
        await page.waitForTimeout(30);
      }
      if (text) {
        await page.keyboard.type(text, { delay: typingDelayMs || 0 });
      }
    },
    resetFocus() {
      preserveEditableFocus = false;
    },
  };
}

module.exports = { waitForPageReady, locateGameCanvas, pressMacroKey, createWorkflowInput };
