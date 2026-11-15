// Runs in each managed frame, not the dashboard. No timer/rAF replacement, CPU
// throttling, page freezing, network blocking, resolution change or input hooks.
async function installPowerSaving(policy) {
  const key = '__webMacroPowerSaving';
  if (window[key]) return window[key].update(policy);
  const state = { enabled: false, fps: 6, phase: 0, adapter: 'controller-only' };
  let restore = [];
  let attempt = null;
  let retry = null;
  let retries = 0;
  let roPossible = false;
  let boostUntil = 0;
  const boost = () => {
    if (!state.enabled) return;
    boostUntil = performance.now() + 250;
    if (roPossible && !restore.length && !attempt) void update(state);
  };
  window.addEventListener('keydown', boost, true);
  window.addEventListener('pointermove', boost, true);
  window.addEventListener('pointerdown', boost, true);

  async function modules() {
    const amd = window.requirejs || window.require;
    if (typeof amd === 'function' && typeof amd.defined === 'function') {
      roPossible = true;
      const get = name => amd.defined(name) ? amd(name) : amd.defined(`${name}.js`) ? amd(`${name}.js`) : null;
      const renderer = get('Renderer/Renderer');
      if (renderer) return { renderer, graphics: get('Preferences/Graphics') };
    }
    // Import only a recognized roBrowser map, never guess paths on other sites.
    const maps = [...document.querySelectorAll('script[type="importmap"]')];
    const recognized = maps.some(node => {
      try { const imports = JSON.parse(node.textContent).imports; return imports?.['Renderer/'] && imports?.['Engine/'] && imports?.['Preferences/']; }
      catch (_) { return false; }
    });
    if (!recognized) return null;
    roPossible = true;
    const [renderer, graphics] = await Promise.all([import('Renderer/Renderer.js'), import('Preferences/Graphics.js')]);
    return { renderer: renderer.default, graphics: graphics.default };
  }
  function replace(object, name, replacement) {
    const original = object[name];
    object[name] = replacement;
    restore.push(() => { if (object[name] === replacement) object[name] = original; });
  }
  async function apply() {
    if (!state.enabled || restore.length) return;
    let found;
    try { found = await modules(); } catch (_) { return; }
    if (!state.enabled || !found) return;
    const { renderer, graphics } = found;
    if (!renderer || typeof renderer._render !== 'function' || !Array.isArray(renderer.renderCallbacks)) return;
    const gl = renderer.gl;
    if (!gl || typeof gl.drawElements !== 'function') return;
    if (graphics) {
      for (const name of ['bloom', 'blur', 'fxaaEnabled', 'vibranceEnabled', 'cartoonEnabled', 'casEnabled']) {
        if (name in graphics) replace(graphics, name, false);
      }
    }
    // Keep offscreen passes: they may generate textures cached for later use.
    // Only screen presentation is skipped. Entity updates, picking, game events,
    // cleanup, network processing and all WebGL resource/state calls still run.
    let framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    let inFrame = false;
    let decision = null;
    let lastBucket = -1;
    const bind = gl.bindFramebuffer;
    replace(gl, 'bindFramebuffer', function(target, buffer) {
      if (target === gl.FRAMEBUFFER || target === gl.DRAW_FRAMEBUFFER) framebuffer = buffer;
      return bind.call(this, target, buffer);
    });
    const present = () => {
      if (!state.enabled || !inFrame || framebuffer !== null) return true;
      if (decision !== null) return decision;
      const now = performance.now();
      const bucket = Math.floor(now * state.fps / 1000 + state.phase);
      decision = now < boostUntil || bucket !== lastBucket;
      if (decision) lastBucket = bucket;
      return decision;
    };
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'clear', 'blitFramebuffer']) {
      if (typeof gl[name] !== 'function') continue;
      const original = gl[name];
      replace(gl, name, function() { if (present()) return original.apply(this, arguments); });
    }
    const originalRender = renderer._render;
    function render() {
      inFrame = true;
      decision = null;
      try { return originalRender.apply(this, arguments); }
      finally { inFrame = false; }
    }
    replace(renderer, '_render', render);
    // An already-bound callback otherwise keeps calling the old method until
    // the next map. The pending old frame switches to this bound method itself.
    const bound = render.bind(renderer);
    renderer._renderBound = bound;
    restore.push(() => { if (renderer._render === render) renderer._renderBound = originalRender.bind(renderer); });
    state.adapter = 'robrowser-screen';
  }
  async function update(next) {
    state.enabled = Boolean(next.enabled);
    state.fps = Math.max(2, Math.min(12, Number(next.fps) || 6));
    state.phase = Number(next.phase) || 0;
    clearTimeout(retry);
    retry = null;
    if (!state.enabled) {
      if (attempt) await attempt;
      restore.reverse().forEach(fn => fn());
      restore = [];
      state.adapter = 'off';
      return { ...state };
    }
    state.adapter = restore.length ? 'robrowser-screen' : 'controller-only';
    if (!attempt) attempt = apply().finally(() => { attempt = null; });
    await attempt;
    // Bounded startup retries support iframe/module loading without idle polling.
    if (!restore.length && (roPossible || window.ROConfig || window.ROBrowser) && retries++ < 10) retry = setTimeout(() => { void update(state); }, 1000);
    return { ...state };
  }
  window[key] = { update, status: () => ({ ...state }) };
  window.addEventListener('robrowser-ready', () => { retries = 0; void update(state); });
  const watch = () => {
    new MutationObserver(records => {
      if (!state.enabled || restore.length || attempt) return;
      if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches('canvas') || node.querySelector('canvas'))))) void update(state);
    }).observe(document.documentElement, { subtree: true, childList: true });
    void update(state);
  };
  if (document.documentElement) watch();
  else document.addEventListener('DOMContentLoaded', watch, { once: true });
  return update(policy);
}

function powerPolicy(enabled, cpuCount, tabCount, tabId = 0) {
  return { enabled, fps: Math.max(2, Math.min(12, Math.floor(cpuCount * 6 / Math.max(1, tabCount)))), phase: ((Number(tabId) * 0.61803398875) % 1) };
}
module.exports = { installPowerSaving, powerPolicy };
