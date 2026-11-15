const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { chromium } = require('playwright');
const { discoverBrowsers } = require('../browser-discovery');

test('optimized canvas targeting retains trusted click/move coordinates inside a scaled iframe', async () => {
  const filename = path.resolve(__dirname, '../server.js');
  const source = fs.readFileSync(filename, 'utf8');
  const runtime = new Module(filename, module);
  runtime.filename = filename;
  runtime.paths = Module._nodeModulePaths(path.dirname(filename));
  runtime._compile(source.slice(0, source.indexOf("process.on('SIGINT'")) + '\nmodule.exports = { performRobustClick, performRobustMove, runtimePublisher };', filename);
  const api = runtime.exports;
  const browser = await chromium.launch({ headless: true, executablePath: discoverBrowsers()[0]?.executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent('<canvas width="20" height="20"></canvas><iframe style="position:absolute;left:100px;top:80px;width:400px;height:300px;transform:scale(0.75);transform-origin:top left" srcdoc="<body style=\'margin:0\'><canvas width=\'300\' height=\'180\'></canvas></body>"></iframe>');
    const frame = await page.locator('iframe').elementHandle().then(handle => handle.contentFrame());
    await frame.waitForSelector('canvas');
    await frame.evaluate(() => {
      const canvas = document.querySelector('canvas');
      canvas.addEventListener('click', event => { window.clicked = { x: event.offsetX, y: event.offsetY, trusted: event.isTrusted }; });
      canvas.addEventListener('mousemove', event => { window.moved = { x: event.offsetX, y: event.offsetY }; });
    });
    const position = { coordinateSystem: 'canvas', mode: 'preset', preset: 'center' };
    const tab = { defaultPosition: position };
    await api.performRobustClick(page, tab, { position, clickCount: 1, button: 'left' });
    const click = await frame.evaluate(() => window.clicked);
    assert.ok(Math.abs(click.x - 150) <= 1);
    assert.ok(Math.abs(click.y - 90) <= 1);
    assert.equal(click.trusted, true);
    await api.performRobustMove(page, tab, { position: { ...position, xRatio: 0.8, yRatio: 0.7 }, durationMs: 100 });
    const move = await frame.evaluate(() => window.moved);
    assert.ok(Math.abs(move.x - 240) <= 1);
    assert.ok(Math.abs(move.y - 126) <= 1);
  } finally { await browser.close(); api.runtimePublisher.close(); }
});
