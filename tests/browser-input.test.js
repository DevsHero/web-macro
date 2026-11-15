const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');
const { pressMacroKey, createWorkflowInput } = require('../lib/browser-input');
// Saved chat workflow, copied so future user snapshot edits cannot change this regression.
const snapshot = require('./fixtures/chat-workflow.json');

let browser;
let server;
let origin;

// Model roBrowser's Enter handler: submit only when the actual chat editor owns
// focus; otherwise open/focus chat. Modern clients put this editor in a shadow root.
function chatFixture({ shadow = false, tag = 'input' } = {}) {
  return `<canvas width="640" height="480"></canvas><div id="ChatBox"></div>
    <script>
      const host = document.querySelector('#ChatBox');
      const root = ${shadow ? "host.attachShadow({mode: 'open'})" : 'host'};
      root.innerHTML = ${JSON.stringify(tag === 'div'
        ? '<div class="message" contenteditable="true" hidden></div>'
        : `<${tag} class="message" hidden></${tag}>`)};
      const editor = root.querySelector('.message');
      const value = () => editor.isContentEditable ? editor.textContent : editor.value;
      window.sent = [];
      window.keys = [];
      window.addEventListener('keydown', event => {
        let active = document.activeElement;
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
        window.keys.push({ key: event.key, tag: active.tagName, trusted: event.isTrusted });
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (active === editor && value().trim()) {
          window.sent.push(value());
          if (editor.isContentEditable) editor.textContent = ''; else editor.value = '';
        } else if (active === editor) {
          editor.hidden = true;
        } else {
          editor.hidden = false;
          editor.focus();
        }
      }, true);
    </script>`;
}

before(async () => {
  server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/nested') {
      response.end(`<iframe src="${origin}/shadow" width="800" height="600"></iframe>`);
    } else {
      response.end(chatFixture({ shadow: request.url === '/shadow', tag: request.url === '/shadow' ? 'div' : 'input' }));
    }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function runSavedSteps(page) {
  const input = createWorkflowInput(page);
  for (const step of snapshot.steps) {
    if (step.delayBeforeMs) await page.waitForTimeout(step.delayBeforeMs);
    if (step.command === 'keyboard') {
      await input.pressKey(step.key, step.holdDurationMs);
    } else if (step.command === 'type') {
      await input.typeText(step.text, step);
    } else {
      assert.fail(`Unexpected saved command: ${step.command}`);
    }
    if (step.delayAfterMs) await page.waitForTimeout(step.delayAfterMs);
  }
}

for (const [name, setup] of [
  ['input in the main document', async page => { await page.setContent(chatFixture()); return page.mainFrame(); }],
  ['textarea in the main document', async page => { await page.setContent(chatFixture({ tag: 'textarea' })); return page.mainFrame(); }],
  ['contenteditable in a shadow root', async page => { await page.setContent(chatFixture({ shadow: true, tag: 'div' })); return page.mainFrame(); }],
  ['input in an iframe', async page => { await page.setContent(`<iframe src="${origin}/input"></iframe>`); const f = await page.locator('iframe').elementHandle().then(h => h.contentFrame()); await f.waitForSelector('canvas'); return f; }],
  ['shadow editor in nested cross-origin iframes', async page => {
    // localhost and 127.0.0.1 are different origins. The inner iframe also
    // remembers focus when an unrelated outer editor later becomes active.
    await page.setContent(`<iframe src="http://localhost:${server.address().port}/nested"></iframe>`);
    await page.waitForFunction(() => document.querySelector('iframe').contentWindow !== null);
    const outer = await page.locator('iframe').elementHandle().then(h => h.contentFrame());
    await outer.waitForSelector('iframe');
    const inner = await outer.locator('iframe').elementHandle().then(h => h.contentFrame());
    await inner.waitForSelector('canvas');
    return inner;
  }],
]) {
  test(`saved chat workflow submits on repeated runs: ${name}`, async () => {
    const page = await browser.newPage();
    try {
      const game = await setup(page);
      await runSavedSteps(page);
      await runSavedSteps(page);
      assert.deepEqual(await game.evaluate(() => window.sent), ['@go 0', '@go 0']);
      assert.equal(await game.locator('.message').evaluate(node => node.isContentEditable ? node.textContent : node.value), '');
      const enters = await game.evaluate(() => window.keys.filter(e => e.key === 'Enter'));
      assert.equal(enters.length, 4);
      assert.equal(enters[0].tag, 'CANVAS');
      assert.ok(enters.every(event => event.trusted));
      assert.notEqual(enters[1].tag, 'CANVAS');
      assert.equal(enters[2].tag, 'CANVAS');
      assert.notEqual(enters[3].tag, 'CANVAS');
    } finally {
      await page.close();
    }
  });
}

test('editing keys keep the focused editor and preserve caret position', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(chatFixture({ shadow: true, tag: 'div' }));
    await pressMacroKey(page, 'Enter');
    await page.keyboard.type('ab');
    await pressMacroKey(page, 'ArrowLeft');
    await page.keyboard.type('X');
    assert.equal(await page.locator('.message').textContent(), 'aXb');
  } finally { await page.close(); }
});

test('an inactive iframe with remembered editor focus does not steal keys', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<iframe src="${origin}/shadow"></iframe><canvas id="main" width="900" height="700"></canvas>`);
    const game = await page.locator('iframe').elementHandle().then(h => h.contentFrame());
    await game.waitForSelector('canvas');
    await game.locator('.message').evaluate(node => { node.hidden = false; node.focus(); });
    await page.locator('#main').evaluate(node => { node.tabIndex = -1; node.focus(); });
    await page.evaluate(() => { window.mainKeys = []; document.querySelector('#main').addEventListener('keydown', e => window.mainKeys.push(e.key)); });
    await pressMacroKey(page, 'F7');
    assert.deepEqual(await page.evaluate(() => window.mainKeys), ['F7']);
    assert.deepEqual(await game.evaluate(() => window.keys), []);
  } finally { await page.close(); }
});

test('keys on a page without a canvas reach the existing input immediately', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<input><script>window.entered = false; document.querySelector("input").onkeydown = e => { if (e.key === "Enter") window.entered = true; };</script>');
    await page.locator('input').focus();
    await pressMacroKey(page, 'Enter');
    assert.equal(await page.evaluate(() => window.entered), true);
  } finally { await page.close(); }
});

test('game hotkeys still focus the canvas when no editor owns focus', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(chatFixture());
    await pressMacroKey(page, 'F7', 100);
    assert.deepEqual(await page.evaluate(() => window.keys), [{ key: 'F7', tag: 'CANVAS', trusted: true }]);
  } finally { await page.close(); }
});


test('chat keyboard steps submit without requesting tab activation', async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(chatFixture({ shadow: true, tag: 'div' }));
    const foreground = await context.newPage();
    await foreground.bringToFront();
    // Headless Chromium reports every page as focused. Guard the controller's
    // activation API directly while exercising real browser keyboard events.
    page.bringToFront = async () => assert.fail('Chat input must not activate the tab');
    await runSavedSteps(page);
    assert.deepEqual(await page.evaluate(() => window.sent), ['@go 0']);
    assert.equal(foreground.isClosed(), false);
  } finally { await context.close(); }
});

test('canvas handles are reused and released; larger/replaced canvases win immediately', async () => {
  const { locateGameCanvas } = require('../lib/browser-input');
  const page = await browser.newPage();
  try {
    await page.setContent('<canvas id="small" width="10" height="10"></canvas><canvas id="large" width="600" height="400"></canvas>');
    const first = await locateGameCanvas(page);
    let disposed = 0;
    const dispose = first.canvasHandle.dispose.bind(first.canvasHandle);
    first.canvasHandle.dispose = async () => { disposed++; await dispose(); };
    assert.equal(await first.canvasHandle.evaluate(node => node.id), 'large');
    for (let i = 0; i < 10; i++) assert.equal((await locateGameCanvas(page)).canvasHandle, first.canvasHandle);
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<canvas id="new-largest" width="700" height="500"></canvas>'));
    const next = await locateGameCanvas(page);
    assert.equal(await next.canvasHandle.evaluate(node => node.id), 'new-largest');
    assert.equal(disposed, 1, 'previous winner is released');
    await page.evaluate(() => document.getElementById('new-largest').outerHTML = '<canvas id="replacement" width="800" height="600"></canvas>');
    assert.equal(await (await locateGameCanvas(page)).canvasHandle.evaluate(node => node.id), 'replacement');
    await page.goto('about:blank');
    await page.setContent('<canvas id="after-navigation" width="500" height="500"></canvas>');
    assert.equal(await (await locateGameCanvas(page)).canvasHandle.evaluate(node => node.id), 'after-navigation');
  } finally { await page.close(); }
});
