const { spawnSync } = require('node:child_process');
const { discoverBrowsers } = require('../browser-discovery');

// Use the same discovery as the runtime, including an already-installed bundle.
// Avoid unsupported OS downloads when a compatible local browser is available.
const browsers = discoverBrowsers();
if (browsers.length) {
  console.log(`Using available browser(s): ${browsers.map(browser => browser.name).join(', ')}.`);
  console.log('Skipping Chromium download. Choose your browser in Browser Settings.');
} else {
  console.log('No supported local browser found. Installing Playwright Chromium…');
  const result = spawnSync(process.execPath, [require.resolve('playwright/cli'), 'install', 'chromium'], {
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    console.error('Browser installation failed. Install Chrome, Edge, Brave, Chromium or Opera using your OS installer, then run npm install again.');
    if (result.error) console.error(result.error.message);
    process.exitCode = 1;
  }
}
