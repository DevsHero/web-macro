const fs = require('fs');
const os = require('os');
const path = require('path');

// Fixed, popular-browser locations only. Never execute candidates or crawl disks.
function browserCandidates(platform = process.platform, env = process.env, home = os.homedir()) {
  const specs = [
    ['chrome', 'Google Chrome', 'Google Chrome.app/Contents/MacOS/Google Chrome', 'Google/Chrome/Application/chrome.exe', ['google-chrome', 'google-chrome-stable']],
    ['edge', 'Microsoft Edge', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'Microsoft/Edge/Application/msedge.exe', ['microsoft-edge', 'microsoft-edge-stable']],
    ['brave', 'Brave', 'Brave Browser.app/Contents/MacOS/Brave Browser', 'BraveSoftware/Brave-Browser/Application/brave.exe', ['brave-browser', 'brave-browser-stable']],
    ['chromium', 'Chromium', 'Chromium.app/Contents/MacOS/Chromium', 'Chromium/Application/chrome.exe', ['chromium', 'chromium-browser']],
    ['opera', 'Opera', 'Opera.app/Contents/MacOS/Opera', 'Opera/opera.exe', ['opera']],
    ['opera-gx', 'Opera GX', 'Opera GX.app/Contents/MacOS/Opera GX', 'Opera GX/opera.exe', []],
  ];
  const join = platform === 'win32' ? path.win32.join : path.join;
  return specs.map(([type, name, mac, win, linux]) => {
    let paths = [];
    if (platform === 'darwin') {
      paths = ['/Applications', join(home, 'Applications')].map(root => join(root, mac));
      if (type === 'opera') paths.push('/Applications/Opera One.app/Contents/MacOS/Opera');
    } else if (platform === 'win32') {
      paths = [env.PROGRAMFILES || 'C:\\Program Files', env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', env.LOCALAPPDATA || join(home, 'AppData', 'Local')]
        .map(root => join(root, ...win.split('/')));
      if (type === 'opera' || type === 'opera-gx') paths.push(join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Programs', ...win.split('/')));
    } else if (platform === 'linux') {
      paths = linux.flatMap(binary => ['/usr/bin', '/usr/local/bin', '/snap/bin', join(home, '.local', 'bin')].map(root => join(root, binary)));
    }
    return { type, name, paths };
  });
}

function isExecutable(filePath) {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    fs.accessSync(filePath, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function discoverBrowsers() {
  const browsers = browserCandidates().flatMap(({ type, name, paths }) => {
    const executablePath = paths.find(isExecutable);
    return executablePath ? [{ type, name, executablePath, source: 'installed' }] : [];
  });
  const bundledPath = require('playwright').chromium.executablePath();
  if (!browsers.some(browser => browser.type === 'chromium') && isExecutable(bundledPath)) {
    browsers.push({ type: 'chromium', name: 'Playwright Chromium', executablePath: bundledPath, source: 'bundled' });
  }
  return browsers;
}

module.exports = { browserCandidates, discoverBrowsers, isExecutable };
