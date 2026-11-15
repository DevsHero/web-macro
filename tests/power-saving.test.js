const assert = require('node:assert/strict');
const { test } = require('node:test');
const { chromium } = require('playwright');
const { discoverBrowsers } = require('../browser-discovery');
const { installPowerSaving, powerPolicy } = require('../lib/power-saving');
const { createHostScheduler } = require('../lib/host-scheduler');
const { createWorkflowInput } = require('../lib/browser-input');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

for (const threads of [2, 4]) test(`${threads} CPU preparation slots serve 20 tabs fairly without per-tab overlap`, async () => {
  const scheduler = createHostScheduler({ parallelism: threads });
  const active = new Set();
  const started = [];
  let peak = 0;
  const task = key => scheduler.run(key, async () => {
    assert.ok(!active.has(key));
    active.add(key);
    started.push(key);
    peak = Math.max(peak, active.size);
    await wait(5);
    active.delete(key);
  });
  const tasks = Array.from({ length: 20 }, (_, key) => task(key));
  for (let repeat = 0; repeat < 4; repeat++) for (let key = 0; key < 20; key++) tasks.push(task(key));
  await Promise.all(tasks);
  assert.equal(peak, threads);
  assert.equal(started.length, 100);
  assert.equal(new Set(started.slice(0, 20)).size, 20, 'every tab gets a turn before repeat preparations');
  assert.equal(scheduler.summary().queued, 0);
});

test('roBrowser presentation saving preserves game ticks, offscreen textures, chat input and restores graphics', async (t) => {
  const browser = await chromium.launch({ headless: true, executablePath: discoverBrowsers()[0]?.executablePath });
  try {
    const page = await browser.newPage();
    await page.setContent(`<canvas width="400" height="300" tabindex="0"></canvas><input hidden>
    <script>
      const canvas = document.querySelector('canvas'), editor = document.querySelector('input');
      const gl = canvas.getContext('webgl');
      window.stats = { ticks: 0, screen: 0, offscreen: 0, heartbeats: 0, messages: [], trusted: [] };
      setInterval(() => stats.heartbeats++, 25);
      canvas.addEventListener('keydown', event => { if (event.key === 'Enter') { editor.hidden = false; editor.focus(); } });
      editor.addEventListener('keydown', event => { if (event.key === 'Enter') { stats.messages.push(editor.value); stats.trusted.push(event.isTrusted); editor.value = ''; editor.hidden = true; canvas.focus(); } });
      const fbo = gl.createFramebuffer(), texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 8, 8, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const clear = gl.clear;
      gl.clear = function(...args) { if (gl.getParameter(gl.FRAMEBUFFER_BINDING)) stats.offscreen++; else stats.screen++; return clear.apply(this, args); };
      window.graphics = { fpslimit: 60, viewArea: 14, performanceMode: false, bloom: true, blur: true };
      window.renderer = {
        gl, renderCallbacks: [],
        _render() {
          stats.ticks++;
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.clear(gl.COLOR_BUFFER_BIT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clear(gl.COLOR_BUFFER_BIT);
          requestAnimationFrame(this._renderBound);
        }
      };
      window.original = { render: renderer._render, clear: gl.clear, raf: requestAnimationFrame, timeout: setTimeout };
      renderer._renderBound = renderer._render.bind(renderer);
      requestAnimationFrame(renderer._renderBound);
      window.requirejs = name => name === 'Renderer/Renderer' ? renderer : graphics;
      requirejs.defined = name => ['Renderer/Renderer', 'Preferences/Graphics'].includes(name);
    </script>`);
    assert.equal(await page.evaluate(() => Boolean(renderer.gl)), true, 'real WebGL is required');
    await page.waitForFunction(() => stats.ticks > 10);
    const baseline = await page.evaluate(() => ({ ...stats }));
    const result = await page.evaluate(installPowerSaving, powerPolicy(true, 2, 20));
    assert.equal(result.adapter, 'robrowser-screen');
    await page.waitForTimeout(750);
    const saved = await page.evaluate(() => ({ ...stats }));
    const ticks = saved.ticks - baseline.ticks;
    assert.ok(ticks >= 15, `game loop must keep running, got ${ticks} ticks`);
    assert.ok(saved.screen - baseline.screen < ticks / 2, 'screen-only GPU passes are reduced');
    assert.equal(saved.offscreen - baseline.offscreen, ticks, 'offscreen texture generation is never skipped');
    assert.ok(saved.heartbeats - baseline.heartbeats >= 10, 'network-style timers keep running');
    t.diagnostic(`WebGL sample: ${ticks} game ticks, ${saved.screen - baseline.screen} screen paints, ${saved.offscreen - baseline.offscreen} offscreen passes, ${saved.heartbeats - baseline.heartbeats} heartbeats`);
    assert.deepEqual(await page.evaluate(() => [graphics.fpslimit, graphics.viewArea, graphics.performanceMode, requestAnimationFrame === original.raf, setTimeout === original.timeout]), [60, 14, false, true, true]);
    for (let repeat = 0; repeat < 3; repeat++) {
      const input = createWorkflowInput(page);
      await input.pressKey('Enter', 20);
      await input.typeText('@go 0');
      await input.pressKey('Enter', 20);
    }
    assert.deepEqual(await page.evaluate(() => stats.messages), ['@go 0', '@go 0', '@go 0']);
    assert.deepEqual(await page.evaluate(() => stats.trusted), [true, true, true]);
    await page.evaluate(installPowerSaving, { enabled: false });
    assert.deepEqual(await page.evaluate(() => [graphics.bloom, graphics.blur, renderer._render === original.render, renderer.gl.clear === original.clear]), [true, true, true, true]);
    // Modern roBrowser uses ESM/import maps instead of RequireJS.
    await page.route('https://power.test/**', route => route.fulfill({ contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: `export default window.${route.request().url().includes('Preferences') ? 'graphics' : 'renderer'};` }));
    await page.evaluate(() => {
      delete window.requirejs;
      const map = document.createElement('script');
      map.type = 'importmap';
      map.textContent = JSON.stringify({ imports: { 'Renderer/': 'https://power.test/Renderer/', 'Preferences/': 'https://power.test/Preferences/', 'Engine/': 'https://power.test/Engine/' } });
      document.head.appendChild(map);
    });
    assert.equal((await page.evaluate(installPowerSaving, powerPolicy(true, 4, 20))).adapter, 'robrowser-screen');
    await page.evaluate(() => { renderer._renderBound = renderer._render.bind(renderer); });
    await page.evaluate(installPowerSaving, { enabled: false });
    assert.equal(await page.evaluate(() => renderer._render === original.render && graphics.bloom), true);
  } finally { await browser.close(); }
});

test('unsupported sites keep their animation and input APIs unchanged', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: discoverBrowsers()[0]?.executablePath });
  try {
    const page = await browser.newPage();
    await page.setContent('<input>');
    await page.evaluate(() => {
      const timeout = window.setTimeout;
      window.powerTimeouts = 0;
      window.setTimeout = function() { window.powerTimeouts++; return timeout.apply(this, arguments); };
      window.beforePower = [requestAnimationFrame, setTimeout, WebSocket, HTMLCanvasElement.prototype.getContext];
    });
    const result = await page.evaluate(installPowerSaving, powerPolicy(true, 4, 20));
    assert.equal(result.adapter, 'controller-only');
    assert.equal(await page.evaluate(() => powerTimeouts), 0, 'unsupported sites do not poll for adapters');
    assert.equal(await page.evaluate(() => beforePower.every((value, i) => value === [requestAnimationFrame, setTimeout, WebSocket, HTMLCanvasElement.prototype.getContext][i])), true);
    await page.locator('input').fill('still works');
    assert.equal(await page.locator('input').inputValue(), 'still works');
  } finally { await browser.close(); }
});
