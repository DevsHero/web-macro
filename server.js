const fs = require('fs');
const { startSequence } = require('./lib/sequence');
const { buildCloneOptions } = require('./lib/tab-clone');
const http = require('http');
const path = require('path');

const express = require('express');
const { Server } = require('socket.io');
const { chromium } = require('playwright');
const { waitForPageReady, locateGameCanvas, createWorkflowInput } = require('./lib/browser-input');
const { discoverBrowsers, isExecutable } = require('./browser-discovery');

const PORT = Number(process.env.PORT) || 3005;
const HOST = process.env.HOST || '127.0.0.1';
const GAME_URL = 'https://www.the4rtist.com/playro/';
const CONFIG_DIR = path.join(__dirname, 'configs');
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_BROADCAST_MS = 1000;
const MAX_LOG_ENTRIES = 500;
const MAX_INTERVAL_SECONDS = 86400;
const FUNCTION_KEYS = Array.from({ length: 12 }, (_, index) => `F${index + 1}`);
const LETTER_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const NUMBER_KEYS = '0123456789'.split('');
const SPECIAL_KEYS = ['Escape', 'Enter', 'Space', 'Tab', 'Shift', 'Control', 'Alt', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const SUPPORTED_KEYS = [...FUNCTION_KEYS, ...LETTER_KEYS, ...NUMBER_KEYS, ...SPECIAL_KEYS];
const POSITION_PRESETS = {
  center: { xRatio: 0.5, yRatio: 0.5 },
  'top-center': { xRatio: 0.5, yRatio: 0.1 },
  'bottom-center': { xRatio: 0.5, yRatio: 0.9 },
  'left-center': { xRatio: 0.1, yRatio: 0.5 },
  'right-center': { xRatio: 0.9, yRatio: 0.5 },
  'top-left': { xRatio: 0.1, yRatio: 0.1 },
  'top-right': { xRatio: 0.9, yRatio: 0.1 },
  'bottom-left': { xRatio: 0.1, yRatio: 0.9 },
  'bottom-right': { xRatio: 0.9, yRatio: 0.9 },
};
const DEFAULT_LAUNCH_ARGS = [
  '--start-maximized',
  '--no-first-run',
  '--disable-default-browser-check',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];
const HIDDEN_EXECUTION_DISABLED_FEATURES = [
  'CalculateNativeWinOcclusion',
  'IntensiveWakeUpThrottling',
  'ThrottleNonVisibleCrossOriginIframes',
];
const HIDDEN_EXECUTION_EXTRA_ARGS = [
  '--disable-background-media-suspend',
];
const DEFAULT_BROWSER_CONFIG = {
  type: process.env.BROWSER_TYPE || 'auto',
  executablePath: process.env.BROWSER_EXECUTABLE_PATH || '',
  userDataDir: '',
  launchMode: 'launch',
  connectOverCDP: false,
  cdpUrl: 'http://127.0.0.1:9222',
  args: DEFAULT_LAUNCH_ARGS,
  headless: process.env.BROWSER_HEADLESS === 'true',
  activateTabOnInteraction: false,
  optimizeForHiddenExecution: true,
};
const DEFAULT_TAB_POSITION = {
  coordinateSystem: 'canvas',
  mode: 'preset',
  preset: 'center',
  xRatio: 0.5,
  yRatio: 0.55,
};
const WORKFLOW_TEMPLATES = [
  {
    id: 'simple-key-repeat',
    name: 'Simple Key Repeat',
    description: 'Press one key every interval.',
    workflow: {
      name: 'Simple Key Repeat',
      intervalSeconds: 30,
      startDelaySeconds: 0,
      description: '',
      notes: '',
      enabled: true,
      overlapPolicy: 'queue',
      tabActivationPolicy: 'background',
      steps: [{ command: 'keyboard', key: 'F1', holdDurationMs: 0, delayBeforeMs: 0, delayAfterMs: 0 }],
    },
  },
  {
    id: 'self-target-skill',
    name: 'Self Target Skill',
    description: 'Bring the tab forward, focus canvas, cast a skill, then click center.',
    workflow: {
      name: 'Self Buff F7',
      intervalSeconds: 239,
      startDelaySeconds: 5,
      description: '',
      notes: '',
      enabled: true,
      overlapPolicy: 'queue',
      tabActivationPolicy: 'background',
      steps: [
        { command: 'focus', target: 'canvas', delayBeforeMs: 0, delayAfterMs: 0 },
        { command: 'keyboard', key: 'F7', holdDurationMs: 0, delayBeforeMs: 0, delayAfterMs: 0 },
        { command: 'wait', durationMs: 120, delayBeforeMs: 0, delayAfterMs: 0 },
        {
          command: 'click',
          button: 'left',
          clickCount: 1,
          delayBeforeMs: 0,
          delayAfterMs: 0,
          position: {
            coordinateSystem: 'canvas',
            mode: 'preset',
            preset: 'center',
          },
        },
      ],
    },
  },
  {
    id: 'buff-rotation',
    name: 'Buff Rotation',
    description: 'Chain multiple hotkeys with short waits.',
    workflow: {
      name: 'Buff Rotation',
      intervalSeconds: 120,
      startDelaySeconds: 0,
      description: '',
      notes: '',
      enabled: true,
      overlapPolicy: 'queue',
      tabActivationPolicy: 'background',
      steps: [
        { command: 'focus', target: 'canvas', delayBeforeMs: 0, delayAfterMs: 0 },
        { command: 'keyboard', key: 'F5', holdDurationMs: 0, delayBeforeMs: 0, delayAfterMs: 120 },
        { command: 'keyboard', key: 'F6', holdDurationMs: 0, delayBeforeMs: 0, delayAfterMs: 120 },
        { command: 'keyboard', key: 'F7', holdDurationMs: 0, delayBeforeMs: 0, delayAfterMs: 0 },
      ],
    },
  },
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

let browser = null;
let browserContext = null;
let browserSessionMode = 'launch';
let isBrowserContextClosed = true;
let isShuttingDown = false;
let isResettingController = false;
let nextTabId = 1;
let nextWorkflowId = 1;
let nextStepId = 1;
let nextLogId = 1;
let stateBroadcastTimer = null;
let currentConfigName = null;
let browserConfigState = cloneValue(DEFAULT_BROWSER_CONFIG);
let browserRuntime = {
  name: 'Playwright Chromium',
  executablePath: null,
  source: 'bundled',
};

const tabs = new Map();
const logs = [];

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.static(PUBLIC_DIR, {
  etag: true,
  maxAge: 60 * 60 * 1000,
  setHeaders(response, filePath) {
    if (filePath.endsWith('.html')) {
      response.setHeader('Cache-Control', 'no-store');
      return;
    }

    response.setHeader('Cache-Control', 'public, max-age=3600');
  },
}));

app.get('/api/browsers', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json({ platform: process.platform, browsers: discoverBrowsers() });
});

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    uptimeSeconds: Math.round(process.uptime()),
    serverTime: new Date().toISOString(),
    port: PORT,
    tabs: tabs.size,
    browser: browserRuntime.name,
    browserSource: browserRuntime.source,
    browserLaunchMode: browserSessionMode,
    currentConfigName,
    headless: browserConfigState.headless,
  });
});

app.get('/api/configs/:configId/export', (request, response) => {
  try {
    const configId = sanitizeConfigId(request.params.configId);
    const document = readSavedConfig(configId);
    response.setHeader('Content-Disposition', `attachment; filename="${configId}.json"`);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.send(JSON.stringify(document, null, 2));
  } catch (error) {
    response.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || 'Failed to export config.',
    });
  }
});

app.post('/api/configs/import', (request, response) => {
  try {
    const result = importConfigDocument(request.body || {});
    response.status(201).json({ ok: true, result });
  } catch (error) {
    response.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || 'Failed to import config.',
    });
  }
});

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function sanitizeConfigId(name) {
  return String(name || '')
    .trim()
    .replace(/[^a-z0-9-_ ]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .slice(0, 80);
}

function configFilePath(configId) {
  return path.join(CONFIG_DIR, `${configId}.json`);
}

function syncPrefixedCounter(id, prefix, currentValue) {
  const matcher = new RegExp(`^${prefix}-(\\d+)$`);
  const match = matcher.exec(String(id || ''));
  if (!match) {
    return currentValue;
  }
  return Math.max(currentValue, Number(match[1]) + 1);
}

function listSavedConfigs() {
  ensureConfigDir();

  return fs
    .readdirSync(CONFIG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const configId = entry.name.replace(/\.json$/i, '');
      const filePath = configFilePath(configId);

      try {
        const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
          id: configId,
          name: document.configName || configId,
          savedAt: document.savedAt || null,
        };
      } catch (_error) {
        return {
          id: configId,
          name: configId,
          savedAt: null,
        };
      }
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function readSavedConfig(configId) {
  ensureConfigDir();
  const filePath = configFilePath(configId);

  if (!fs.existsSync(filePath)) {
    throw createHttpError(`Config ${configId} was not found.`, 404);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeImportedConfigDocument(document) {
  const configName = normalizeString(document && document.configName);
  if (!configName) {
    throw createHttpError('Imported config must include a configName.', 400);
  }

  if (!Array.isArray(document && document.tabs)) {
    throw createHttpError('Imported config must include a tabs array.', 400);
  }

  return {
    configName,
    savedAt: nowIso(),
    browser: normalizeBrowserConfig(document && document.browser),
    tabs: cloneValue(document.tabs || []),
  };
}

function importConfigDocument(document) {
  const normalizedDocument = normalizeImportedConfigDocument(document);
  const configId = sanitizeConfigId(normalizedDocument.configName);
  if (!configId) {
    throw createHttpError('Imported config name must contain letters or numbers.', 400);
  }

  ensureConfigDir();
  fs.writeFileSync(configFilePath(configId), JSON.stringify(normalizedDocument, null, 2), 'utf8');

  addLog({
    action: 'config.import',
    message: `Imported config ${normalizedDocument.configName}`,
  });
  emitState();

  return {
    id: configId,
    name: normalizedDocument.configName,
  };
}

function browserTypeLabel(type) {
  switch (type) {
    case 'chrome':
      return 'Google Chrome';
    case 'auto':
      return 'Automatic';
    case 'brave':
      return 'Brave';
    case 'edge':
      return 'Microsoft Edge';
    case 'opera':
      return 'Opera';
    case 'opera-gx':
      return 'Opera GX';
    case 'custom':
      return 'Custom Browser';
    default:
      return 'Playwright Chromium';
  }
}

function normalizeString(value) {
  return String(value || '').trim();
}

function coerceBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return fallback;
}

function coerceInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function parseLaunchArgs(rawArgs) {
  const values = Array.isArray(rawArgs)
    ? rawArgs
    : typeof rawArgs === 'string'
      ? rawArgs
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  return Array.from(new Set(values.map((item) => String(item).trim()).filter(Boolean)));
}

function mergeDisableFeaturesArgs(args, features) {
  const disabledFeatures = new Set(features);
  const passthroughArgs = [];

  for (const arg of parseLaunchArgs(args)) {
    if (arg.startsWith('--disable-features=')) {
      const rawFeatures = arg.slice('--disable-features='.length);
      for (const feature of rawFeatures.split(',')) {
        const normalizedFeature = String(feature || '').trim();
        if (normalizedFeature) {
          disabledFeatures.add(normalizedFeature);
        }
      }
      continue;
    }

    passthroughArgs.push(arg);
  }

  if (disabledFeatures.size > 0) {
    passthroughArgs.push(`--disable-features=${Array.from(disabledFeatures).join(',')}`);
  }

  return passthroughArgs;
}

function buildLaunchArgs(config) {
  const normalizedConfig = normalizeBrowserConfig(config);
  const baseArgs = parseLaunchArgs(normalizedConfig.args);

  if (!normalizedConfig.optimizeForHiddenExecution) {
    return baseArgs;
  }

  return mergeDisableFeaturesArgs(
    [...baseArgs, ...DEFAULT_LAUNCH_ARGS, ...HIDDEN_EXECUTION_EXTRA_ARGS],
    HIDDEN_EXECUTION_DISABLED_FEATURES,
  );
}

function normalizeBrowserConfig(rawConfig = {}) {
  const merged = {
    ...cloneValue(DEFAULT_BROWSER_CONFIG),
    ...(rawConfig || {}),
  };

  const allowedTypes = ['auto', 'chromium', 'chrome', 'edge', 'brave', 'opera', 'opera-gx', 'custom'];
  const type = allowedTypes.includes(merged.type) ? merged.type : DEFAULT_BROWSER_CONFIG.type;
  const allowedLaunchModes = ['launch', 'persistent', 'connectOverCDP'];
  const launchMode = allowedLaunchModes.includes(merged.launchMode) ? merged.launchMode : DEFAULT_BROWSER_CONFIG.launchMode;

  return {
    type,
    executablePath: normalizeString(merged.executablePath),
    userDataDir: normalizeString(merged.userDataDir),
    launchMode,
    connectOverCDP: coerceBoolean(merged.connectOverCDP, launchMode === 'connectOverCDP'),
    cdpUrl: normalizeString(merged.cdpUrl) || DEFAULT_BROWSER_CONFIG.cdpUrl,
    args: parseLaunchArgs(merged.args),
    headless: coerceBoolean(merged.headless, false),
    activateTabOnInteraction: coerceBoolean(merged.activateTabOnInteraction, false),
    optimizeForHiddenExecution: coerceBoolean(merged.optimizeForHiddenExecution, true),
  };
}

function resolveBrowserRuntime(config) {
  const normalizedConfig = normalizeBrowserConfig(config);

  if (normalizedConfig.executablePath) {
    if (!isExecutable(normalizedConfig.executablePath)) {
      throw createHttpError('The selected browser is no longer available. Scan again in Browser Settings or choose another browser.', 400);
    }
    return {
      name: browserTypeLabel(normalizedConfig.type),
      executablePath: normalizedConfig.executablePath,
      source: 'custom-path',
    };
  }
  const available = discoverBrowsers();
  const detected = normalizedConfig.type === 'auto' ? available[0] : available.find(item => item.type === normalizedConfig.type);
  if (!detected) {
    throw createHttpError('Browser not found. Install Chrome, Edge, Brave, Chromium or Opera, then scan again in Browser Settings.', 400);
  }
  return { name: detected.name, executablePath: detected.executablePath, source: detected.source };
}

function buildBrowserSummary() {
  const browserConfig = normalizeBrowserConfig(browserConfigState);
  const modeLabel =
    browserConfig.launchMode === 'persistent'
      ? 'Persistent Profile'
      : browserConfig.launchMode === 'connectOverCDP'
        ? 'CDP Connection'
        : 'Ephemeral Context';
  const profileLabel =
    browserConfig.launchMode === 'persistent'
      ? browserConfig.userDataDir || '(auto-generated)'
      : browserConfig.launchMode === 'connectOverCDP'
        ? browserConfig.cdpUrl
        : 'No fixed profile path';

  return {
    type: browserConfig.type,
    typeLabel: browserTypeLabel(browserConfig.type),
    launchMode: browserConfig.launchMode,
    headless: browserConfig.headless,
    summary: `${browserRuntime.name} · ${browserConfig.headless ? "No window (headless)" : "Browser window"} · ${modeLabel}`,
    executablePath: browserRuntime.executablePath || browserConfig.executablePath || '',
    profileLabel,
    activationPolicyLabel: browserConfig.activateTabOnInteraction ? 'Browser default: allow tab activation' : 'Browser default: background-safe',
    hiddenExecutionLabel: browserConfig.optimizeForHiddenExecution ? 'Hidden-tab optimized' : 'Standard throttling',
    args: buildLaunchArgs(browserConfig),
  };
}

function shouldActivateTabsDuringWorkflowRuns() {
  return normalizeBrowserConfig(browserConfigState).activateTabOnInteraction;
}

function normalizeWorkflowTabActivationPolicy(rawPolicy) {
  return ['background', 'activate', 'inherit'].includes(rawPolicy) ? rawPolicy : 'background';
}

function shouldActivateTabForWorkflow(workflow) {
  if (!workflow) {
    return shouldActivateTabsDuringWorkflowRuns();
  }

  if (workflow.tabActivationPolicy === 'activate') {
    return true;
  }

  if (workflow.tabActivationPolicy === 'background') {
    return false;
  }

  return shouldActivateTabsDuringWorkflowRuns();
}

function isManagedGameUrl(_url) {
  // Accept any non-ignorable URL so the controller works with any web app.
  return true;
}

function isIgnorableBrowserPage(url) {
  return (
    url === 'about:blank' ||
    url.startsWith('opera://') ||
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('https://www.opera.com/client/')
  );
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function addLog(messageOrPayload, level = 'info') {
  const payload =
    typeof messageOrPayload === 'string'
      ? {
          message: messageOrPayload,
          level,
        }
      : {
          level: 'info',
          ...messageOrPayload,
        };

  const entry = {
    id: nextLogId++,
    level: payload.level || 'info',
    timestamp: nowIso(),
    tabId: payload.tabId ?? null,
    tabLabel: payload.tabLabel ?? null,
    workflowId: payload.workflowId ?? null,
    workflowName: payload.workflowName ?? null,
    action: payload.action ?? null,
    result: payload.result ?? null,
    stepId: payload.stepId ?? null,
    message: payload.message,
  };

  logs.push(entry);
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.shift();
  }

  io.emit('log:entry', entry);
  return entry;
}

function clearLogs() {
  logs.length = 0;
  io.emit('logs:bootstrap', logs);
}

function safePageUrl(page) {
  try {
    if (!page || page.isClosed()) {
      return 'about:blank';
    }

    return page.url() || 'about:blank';
  } catch (_error) {
    return 'about:blank';
  }
}

function normalizePositionConfig(rawPosition, fallback = DEFAULT_TAB_POSITION) {
  if (rawPosition && rawPosition.useTabDefault) {
    return {
      useTabDefault: true,
    };
  }

  const coordinateSystem = ['canvas', 'viewport', 'screen'].includes(rawPosition && rawPosition.coordinateSystem)
    ? rawPosition.coordinateSystem
    : fallback.coordinateSystem;
  const mode = rawPosition && rawPosition.mode === 'custom' ? 'custom' : 'preset';
  const preset = POSITION_PRESETS[rawPosition && rawPosition.preset] ? rawPosition.preset : fallback.preset || 'center';

  const normalized = {
    coordinateSystem,
    mode,
    preset,
  };

  if (mode === 'custom') {
    const x = Number(rawPosition && rawPosition.x);
    const y = Number(rawPosition && rawPosition.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw createHttpError('Custom XY position requires numeric x and y values.', 400);
    }

    normalized.x = x;
    normalized.y = y;
  }

  const xRatio = Number(rawPosition && rawPosition.xRatio);
  const yRatio = Number(rawPosition && rawPosition.yRatio);
  if (Number.isFinite(xRatio)) {
    normalized.xRatio = xRatio;
  }
  if (Number.isFinite(yRatio)) {
    normalized.yRatio = yRatio;
  }

  return normalized;
}

function normalizeNonNegativeInteger(value, fieldName) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createHttpError(`${fieldName} must be greater than or equal to 0.`, 400);
  }
  return Math.trunc(parsed);
}

function normalizeKeyboardKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!SUPPORTED_KEYS.includes(key)) {
    throw createHttpError(`Unsupported key "${key}".`, 400);
  }
  return key;
}

function normalizeWorkflowStep(rawStep) {
  const command = normalizeString(rawStep && rawStep.command);
  nextStepId = syncPrefixedCounter(rawStep && rawStep.id, 'step', nextStepId);
  const baseStep = {
    id: rawStep && rawStep.id ? String(rawStep.id) : `step-${nextStepId++}`,
    command,
    delayBeforeMs: normalizeNonNegativeInteger(rawStep && rawStep.delayBeforeMs, 'Delay before'),
    delayAfterMs: normalizeNonNegativeInteger(rawStep && rawStep.delayAfterMs, 'Delay after'),
  };

  switch (command) {
    case 'keyboard':
      return {
        ...baseStep,
        key: normalizeKeyboardKey(rawStep && rawStep.key),
        holdDurationMs: normalizeNonNegativeInteger(rawStep && rawStep.holdDurationMs, 'Hold duration'),
      };
    case 'click': {
      const button = rawStep && rawStep.button === 'right' ? 'right' : 'left';
      return {
        ...baseStep,
        button,
        clickCount: Math.max(1, normalizeNonNegativeInteger(rawStep && rawStep.clickCount || 1, 'Click count')),
        position: normalizePositionConfig(rawStep && rawStep.position),
      };
    }
    case 'wait':
      return {
        ...baseStep,
        durationMs: normalizeNonNegativeInteger(rawStep && rawStep.durationMs, 'Wait duration'),
      };
    case 'move':
      return {
        ...baseStep,
        durationMs: normalizeNonNegativeInteger(rawStep && rawStep.durationMs, 'Move duration'),
        position: normalizePositionConfig(rawStep && rawStep.position),
      };
    case 'focus': {
      const target = rawStep && rawStep.target === 'page' ? 'page' : 'canvas';
      return {
        ...baseStep,
        target,
      };
    }
    case 'bringToFront':
      return baseStep;
    case 'type':
      return {
        ...baseStep,
        text: normalizeString(rawStep && rawStep.text),
        clearFirst: coerceBoolean(rawStep && rawStep.clearFirst, false),
        typingDelayMs: normalizeNonNegativeInteger(rawStep && rawStep.typingDelayMs, 'Typing delay'),
      };
    case 'scroll':
      return {
        ...baseStep,
        deltaX: coerceInteger(rawStep && rawStep.deltaX, 0),
        deltaY: coerceInteger(rawStep && rawStep.deltaY, 120),
      };
    case 'navigate': {
      const url = normalizeString(rawStep && rawStep.url);
      if (!url) {
        throw createHttpError('Navigate step requires a URL.', 400);
      }
      return {
        ...baseStep,
        url,
      };
    }
    case 'hover':
      return {
        ...baseStep,
        position: normalizePositionConfig(rawStep && rawStep.position),
      };
    default:
      throw createHttpError(`Unsupported workflow command "${command}".`, 400);
  }
}

function normalizeWorkflowInput(rawWorkflow) {
  const name = normalizeString(rawWorkflow && rawWorkflow.name);
  if (!name) {
    throw createHttpError('Workflow name is required.', 400);
  }

  const intervalSeconds = Math.trunc(Number(rawWorkflow && rawWorkflow.intervalSeconds));
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1) {
    throw createHttpError('Workflow interval must be greater than 0.', 400);
  }
  if (intervalSeconds > MAX_INTERVAL_SECONDS) {
    throw createHttpError(`Workflow interval must be ${MAX_INTERVAL_SECONDS} seconds or less.`, 400);
  }

  const startDelaySeconds = normalizeNonNegativeInteger(rawWorkflow && rawWorkflow.startDelaySeconds, 'Start delay');
  const overlapPolicy = rawWorkflow && rawWorkflow.overlapPolicy === 'skip' ? 'skip' : 'queue';
  const tabActivationPolicy = normalizeWorkflowTabActivationPolicy(rawWorkflow && rawWorkflow.tabActivationPolicy);
  const steps = Array.isArray(rawWorkflow && rawWorkflow.steps) ? rawWorkflow.steps.map((step) => normalizeWorkflowStep(step)) : [];
  if (!steps.length) {
    throw createHttpError('Add at least one workflow step before saving.', 400);
  }

  return {
    name,
    enabled: coerceBoolean(rawWorkflow && rawWorkflow.enabled, true),
    intervalSeconds,
    intervalMs: intervalSeconds * 1000,
    startDelaySeconds,
    description: normalizeString(rawWorkflow && rawWorkflow.description),
    notes: normalizeString(rawWorkflow && rawWorkflow.notes),
    overlapPolicy,
    tabActivationPolicy,
    steps,
  };
}

function getNextWorkflowSortOrder(tab) {
  let maxSortOrder = 0;
  for (const workflow of tab.workflows.values()) {
    maxSortOrder = Math.max(maxSortOrder, Number(workflow.sortOrder) || 0);
  }
  return maxSortOrder + 1;
}

function createWorkflowRuntime(tab, rawWorkflow, existingWorkflow) {
  const normalized = normalizeWorkflowInput(rawWorkflow);
  const timestamp = nowIso();
  const parsedSortOrder = Number(rawWorkflow && rawWorkflow.sortOrder);

  nextWorkflowId = syncPrefixedCounter(rawWorkflow && rawWorkflow.id, 'workflow', nextWorkflowId);

  return {
    id: existingWorkflow ? existingWorkflow.id : rawWorkflow && rawWorkflow.id ? String(rawWorkflow.id) : `workflow-${nextWorkflowId++}`,
    name: normalized.name,
    enabled: normalized.enabled,
    intervalSeconds: normalized.intervalSeconds,
    intervalMs: normalized.intervalMs,
    startDelaySeconds: normalized.startDelaySeconds,
    description: normalized.description,
    notes: normalized.notes,
    assignedTabId: tab.id,
    overlapPolicy: normalized.overlapPolicy,
    tabActivationPolicy: normalized.tabActivationPolicy,
    sortOrder: existingWorkflow
      ? existingWorkflow.sortOrder
      : Number.isFinite(parsedSortOrder) && parsedSortOrder > 0
        ? Math.trunc(parsedSortOrder)
        : getNextWorkflowSortOrder(tab),
    steps: normalized.steps,
    createdAt: existingWorkflow ? existingWorkflow.createdAt : rawWorkflow && rawWorkflow.createdAt ? rawWorkflow.createdAt : timestamp,
    updatedAt: timestamp,
    lastRunAt: existingWorkflow ? existingWorkflow.lastRunAt : rawWorkflow && rawWorkflow.lastRunAt ? rawWorkflow.lastRunAt : null,
    nextRunAt: existingWorkflow ? existingWorkflow.nextRunAt : rawWorkflow && rawWorkflow.nextRunAt ? rawWorkflow.nextRunAt : null,
    runCount: existingWorkflow ? existingWorkflow.runCount : coerceInteger(rawWorkflow && rawWorkflow.runCount, 0),
    errorCount: existingWorkflow ? existingWorkflow.errorCount : coerceInteger(rawWorkflow && rawWorkflow.errorCount, 0),
    activeRuns: 0,
    queuedRuns: 0,
    lastError: existingWorkflow ? existingWorkflow.lastError : normalizeString(rawWorkflow && rawWorkflow.lastError) || null,
    pauseReason: null,
    timer: null,
    resumeTimer: null,
    remainingMs: normalized.intervalMs,
  };
}

function isSimpleLegacyWorkflow(workflow) {
  return (
    workflow.steps.length === 1 &&
    workflow.steps[0].command === 'keyboard' &&
    workflow.steps[0].delayBeforeMs === 0 &&
    workflow.steps[0].delayAfterMs === 0 &&
    workflow.steps[0].holdDurationMs === 0
  );
}

function getWorkflowRemainingMs(workflow) {
  if (workflow.pauseReason !== null) {
    return Math.max(0, workflow.remainingMs || 0);
  }

  if (!workflow.nextRunAt) {
    return workflow.intervalMs;
  }

  return Math.max(0, workflow.nextRunAt - Date.now());
}

function getWorkflowStatus(tab, workflow) {
  if (workflow.activeRuns > 0) {
    return 'executing';
  }
  if (workflow.pauseReason === 'tab') {
    return 'paused';
  }
  if (workflow.pauseReason === 'manual' || !workflow.enabled) {
    return 'paused';
  }
  if (workflow.lastError) {
    return 'error';
  }
  return 'waiting';
}

function compareWorkflowDisplayOrder(left, right) {
  const leftOrder = Number(left.sortOrder) || Number.MAX_SAFE_INTEGER;
  const rightOrder = Number(right.sortOrder) || Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const leftCreatedAt = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightCreatedAt = right.createdAt ? Date.parse(right.createdAt) : 0;
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return String(left.id).localeCompare(String(right.id));
}

function serializeWorkflow(workflow, tab) {
  const remainingMs = getWorkflowRemainingMs(workflow);

  return {
    id: workflow.id,
    sortOrder: workflow.sortOrder,
    name: workflow.name,
    enabled: workflow.enabled,
    intervalSeconds: workflow.intervalSeconds,
    startDelaySeconds: workflow.startDelaySeconds,
    description: workflow.description,
    notes: workflow.notes,
    assignedTabId: tab.id,
    steps: cloneValue(workflow.steps),
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    lastRunAt: workflow.lastRunAt,
    nextRunAt: workflow.nextRunAt,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    runCount: workflow.runCount,
    errorCount: workflow.errorCount,
    overlapPolicy: workflow.overlapPolicy,
    tabActivationPolicy: workflow.tabActivationPolicy,
    pauseReason: workflow.pauseReason,
    activeRuns: workflow.activeRuns,
    queuedRuns: workflow.queuedRuns,
    lastError: workflow.lastError,
    status: getWorkflowStatus(tab, workflow),
  };
}

function serializeLegacyRule(workflow, tab) {
  const step = workflow.steps[0];
  const serialized = serializeWorkflow(workflow, tab);
  return {
    id: workflow.id,
    key: step.key,
    intervalSeconds: workflow.intervalSeconds,
    remainingSeconds: serialized.remainingSeconds,
    nextRunAt: workflow.nextRunAt,
    lastRunAt: workflow.lastRunAt,
    pauseReason: workflow.pauseReason,
    isExecuting: workflow.activeRuns > 0,
    status: serialized.status,
  };
}

function serializeTab(tab) {
  const runtimeWorkflows = Array.from(tab.workflows.values()).sort(compareWorkflowDisplayOrder);
  const workflows = runtimeWorkflows.map((workflow) => serializeWorkflow(workflow, tab));

  return {
    id: tab.id,
    label: tab.label,
    name: tab.label,
    createdAt: tab.createdAt,
    pausedAll: allWorkflowsPaused(tab),
    url: safePageUrl(tab.page),
    navigation: tab.navigation || { state: 'ready', error: null },
    executionMode: tab.executionMode,
    defaultPosition: cloneValue(tab.defaultPosition),
    browserInfo: buildBrowserSummary(),
    workflows,
    rules: runtimeWorkflows.filter((workflow) => isSimpleLegacyWorkflow(workflow)).map((workflow) => serializeLegacyRule(workflow, tab)),
  };
}

function buildState() {
  return {
    serverTime: Date.now(),
    port: PORT,
    supportedKeys: SUPPORTED_KEYS,
    workflowTemplates: cloneValue(WORKFLOW_TEMPLATES),
    tabs: Array.from(tabs.values())
      .sort((left, right) => left.id - right.id)
      .map((tab) => serializeTab(tab)),
    browserConfig: normalizeBrowserConfig(browserConfigState),
    browserSummary: buildBrowserSummary(),
    savedConfigs: listSavedConfigs(),
    currentConfigName,
  };
}

function emitState(targetSocket) {
  const payload = buildState();
  if (targetSocket) {
    targetSocket.emit('state:snapshot', payload);
    return;
  }

  io.emit('state:snapshot', payload);
}

async function focusTarget(page, target, workflow = null) {
  if (target === 'page') {
    if (shouldActivateTabForWorkflow(workflow)) {
      await page.bringToFront();
    }
    await page.locator('body').evaluate((node) => {
      if (!node.hasAttribute('tabindex')) {
        node.setAttribute('tabindex', '-1');
      }
      node.focus();
    });
    return;
  }

  const canvasTarget = await locateGameCanvas(page);
  if (!canvasTarget || !canvasTarget.canvasHandle) {
    throw new Error('Canvas could not be found for focus.');
  }

  await canvasTarget.canvasHandle.evaluate((node) => {
    if (!node.hasAttribute('tabindex')) {
      node.setAttribute('tabindex', '-1');
    }
    node.focus();
  });
}

async function resolveViewportBounds(page) {
  const viewport = page.viewportSize();
  if (viewport) {
    return {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    };
  }

  return page.evaluate(() => ({
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }));
}

async function resolveCanvasBounds(page) {
  const canvasTarget = await locateGameCanvas(page);
  if (!canvasTarget || !canvasTarget.canvasHandle) {
    throw new Error('Canvas could not be found.');
  }

  const box = await canvasTarget.canvasHandle.boundingBox();
  if (!box) {
    throw new Error('Canvas is not visible.');
  }

  return box;
}

function resolvePresetRatios(position) {
  const presetRatios = POSITION_PRESETS[position.preset] || POSITION_PRESETS.center;

  return {
    xRatio: Number.isFinite(position.xRatio) ? position.xRatio : presetRatios.xRatio,
    yRatio: Number.isFinite(position.yRatio) ? position.yRatio : presetRatios.yRatio,
  };
}

async function calculatePosition(page, tab, rawPosition) {
  const effectivePosition = rawPosition && rawPosition.useTabDefault ? tab.defaultPosition : normalizePositionConfig(rawPosition || tab.defaultPosition);
  const coordinateSystem = effectivePosition.coordinateSystem === 'screen' ? 'viewport' : effectivePosition.coordinateSystem;
  const bounds = coordinateSystem === 'canvas' ? await resolveCanvasBounds(page) : await resolveViewportBounds(page);

  if (effectivePosition.mode === 'custom') {
    return {
      x: bounds.x + effectivePosition.x,
      y: bounds.y + effectivePosition.y,
    };
  }

  const ratios = resolvePresetRatios(effectivePosition);
  return {
    x: bounds.x + bounds.width * ratios.xRatio,
    y: bounds.y + bounds.height * ratios.yRatio,
  };
}

function resolveEffectivePosition(tab, rawPosition) {
  return rawPosition && rawPosition.useTabDefault
    ? normalizePositionConfig(tab.defaultPosition)
    : normalizePositionConfig(rawPosition || tab.defaultPosition);
}

function clampToBounds(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

async function performRobustClick(page, tab, step) {
  const effectivePosition = resolveEffectivePosition(tab, step.position);
  const pointerHoldMs = 70;
  const settleMs = 45;
  const betweenClicksMs = 90;
  const moveSteps = 8;

  if (effectivePosition.coordinateSystem === 'canvas') {
    const canvasTarget = await locateGameCanvas(page);
    if (!canvasTarget || !canvasTarget.canvasHandle) {
      throw new Error('Canvas could not be found for click.');
    }

    const box = await canvasTarget.canvasHandle.boundingBox();
    if (!box) {
      throw new Error('Canvas is not visible for click.');
    }

    await focusTarget(page, 'canvas');

    const ratios = effectivePosition.mode === 'custom' ? null : resolvePresetRatios(effectivePosition);
    const localPoint = effectivePosition.mode === 'custom'
      ? {
          x: clampToBounds(effectivePosition.x, 1, Math.max(1, box.width - 1)),
          y: clampToBounds(effectivePosition.y, 1, Math.max(1, box.height - 1)),
        }
      : {
          x: clampToBounds(box.width * ratios.xRatio, 1, Math.max(1, box.width - 1)),
          y: clampToBounds(box.height * ratios.yRatio, 1, Math.max(1, box.height - 1)),
        };

    const absolutePoint = {
      x: box.x + localPoint.x,
      y: box.y + localPoint.y,
    };

    await page.mouse.move(absolutePoint.x, absolutePoint.y, { steps: moveSteps });
    await page.waitForTimeout(settleMs);

    for (let index = 0; index < step.clickCount; index += 1) {
      await page.mouse.down({ button: step.button });
      await page.waitForTimeout(pointerHoldMs);
      await page.mouse.up({ button: step.button });

      if (index < step.clickCount - 1) {
        await page.waitForTimeout(betweenClicksMs);
      }
    }

    return;
  }

  const point = await calculatePosition(page, tab, effectivePosition);
  await page.mouse.move(point.x, point.y, { steps: moveSteps });
  await page.waitForTimeout(settleMs);

  for (let index = 0; index < step.clickCount; index += 1) {
    await page.mouse.down({ button: step.button });
    await page.waitForTimeout(pointerHoldMs);
    await page.mouse.up({ button: step.button });

    if (index < step.clickCount - 1) {
      await page.waitForTimeout(betweenClicksMs);
    }
  }
}

async function performRobustMove(page, tab, step, workflow = null) {
  const effectivePosition = resolveEffectivePosition(tab, step.position);
  const settleMs = 45;
  const steps = Math.max(1, Math.round((step.durationMs || 0) / 16));

  if (effectivePosition.coordinateSystem === 'canvas') {
    const canvasTarget = await locateGameCanvas(page);
    if (!canvasTarget || !canvasTarget.canvasHandle) {
      throw new Error('Canvas could not be found for move.');
    }

    const box = await canvasTarget.canvasHandle.boundingBox();
    if (!box) {
      throw new Error('Canvas is not visible for move.');
    }

    await focusTarget(page, 'canvas', workflow);

    const ratios = effectivePosition.mode === 'custom' ? null : resolvePresetRatios(effectivePosition);
    const localPoint = effectivePosition.mode === 'custom'
      ? {
          x: clampToBounds(effectivePosition.x, 1, Math.max(1, box.width - 1)),
          y: clampToBounds(effectivePosition.y, 1, Math.max(1, box.height - 1)),
        }
      : {
          x: clampToBounds(box.width * ratios.xRatio, 1, Math.max(1, box.width - 1)),
          y: clampToBounds(box.height * ratios.yRatio, 1, Math.max(1, box.height - 1)),
        };

    await page.mouse.move(box.x + localPoint.x, box.y + localPoint.y, { steps });
    await page.waitForTimeout(settleMs);
    return;
  }

  const canvasTarget = await locateGameCanvas(page);
  if (canvasTarget && canvasTarget.canvasHandle) {
    await focusTarget(page, 'canvas', workflow);
  }

  const point = await calculatePosition(page, tab, effectivePosition);
  await page.mouse.move(point.x, point.y, { steps });
  await page.waitForTimeout(settleMs);
}

function clearWorkflowTimers(workflow) {
  if (workflow.timer) {
    clearInterval(workflow.timer);
    workflow.timer = null;
  }

  if (workflow.resumeTimer) {
    clearTimeout(workflow.resumeTimer);
    workflow.resumeTimer = null;
  }
}

function findTabByPage(page) {
  for (const tab of tabs.values()) {
    if (tab.page === page) {
      return tab;
    }
  }

  return null;
}

function attachTabLifecycle(tab) {
  tab.page.on('close', () => {
    if (tab.isDisposing || isResettingController) {
      return;
    }
    removeTab(tab.id, 'browser tab was closed');
  });

  tab.page.on('framenavigated', (frame) => {
    if (frame === tab.page.mainFrame()) {
      void waitForPageReady(tab.page);
      emitState();
    }
  });
}

function clearTabWorkflows(tab) {
  clearInterval(tab.sequenceTimer);
  for (const workflow of tab.workflows.values()) {
    clearWorkflowTimers(workflow);
    workflow.queuedRuns = 0;
  }
  tab.workflowQueue = [];
  tab.activeWorkflowId = null;
}

function createTabRecord(page, options = {}) {
  const tabId = nextTabId++;
  const tab = {
    id: tabId,
    label: normalizeString(options.label) || `Tab ${tabId}`,
    createdAt: nowIso(),
    pausedAll: coerceBoolean(options.pausedAll, false),
    page,
    executionMode: options.executionMode === 'sequence' ? 'sequence' : 'interval',
    sequenceTimer: null,
    sequenceCurrentId: null,
    sequenceCursorId: null,
    workflows: new Map(),
    workflowQueue: [],
    activeWorkflowId: null,
    defaultPosition: normalizePositionConfig(options.defaultPosition || DEFAULT_TAB_POSITION),
    isDisposing: false,
  };

  tabs.set(tab.id, tab);
  attachTabLifecycle(tab);
  if (tab.executionMode === 'sequence') enableSequence(tab);
  return tab;
}

function registerExistingPage(page) {
  if (page.isClosed()) {
    return null;
  }

  const pageUrl = safePageUrl(page);
  if (!isManagedGameUrl(pageUrl)) {
    return null;
  }

  const existingTab = findTabByPage(page);
  if (existingTab) {
    return existingTab;
  }

  const tab = createTabRecord(page, {});
  void waitForPageReady(tab.page);
  addLog({
    tabId: tab.id,
    tabLabel: tab.label,
    action: 'tab.attach',
    message: `${tab.label}: attached existing page ${pageUrl}`,
  });
  return tab;
}

function getTabOrThrow(tabId) {
  const tab = tabs.get(Number(tabId));
  if (!tab) {
    throw createHttpError(`Tab ${tabId} was not found.`, 404);
  }
  return tab;
}

function getWorkflowOrThrow(tab, workflowId) {
  const workflow = tab.workflows.get(String(workflowId));
  if (!workflow) {
    throw createHttpError(`Workflow ${workflowId} was not found on ${tab.label}.`, 404);
  }
  return workflow;
}

function compareQueuedWorkflowRuns(tab, left, right) {
  const leftWorkflow = tab.workflows.get(left.workflowId);
  const rightWorkflow = tab.workflows.get(right.workflowId);

  if (leftWorkflow && rightWorkflow) {
    const orderComparison = compareWorkflowDisplayOrder(leftWorkflow, rightWorkflow);
    if (orderComparison !== 0) {
      return orderComparison;
    }
  }

  return left.enqueuedAt - right.enqueuedAt;
}

function removeQueuedRunsForWorkflow(tab, workflowId) {
  const originalLength = tab.workflowQueue.length;
  tab.workflowQueue = tab.workflowQueue.filter((entry) => entry.workflowId !== workflowId);
  return originalLength - tab.workflowQueue.length;
}

function enqueueWorkflowRun(tab, workflow, options, message) {
  tab.workflowQueue.push({
    workflowId: workflow.id,
    trigger: options.trigger || 'queued',
    ignorePause: Boolean(options.ignorePause),
    enqueuedAt: Date.now(),
  });
  tab.workflowQueue.sort((left, right) => compareQueuedWorkflowRuns(tab, left, right));
  workflow.queuedRuns += 1;

  addLog({
    level: 'warn',
    tabId: tab.id,
    tabLabel: tab.label,
    workflowId: workflow.id,
    workflowName: workflow.name,
    action: 'workflow.queue',
    result: 'queued',
    message,
  });
  emitState();
}

function drainTabWorkflowQueue(tab) {
  if (tab.activeWorkflowId !== null) {
    return;
  }

  while (tab.workflowQueue.length > 0) {
    const nextRun = tab.workflowQueue.shift();
    const workflow = nextRun ? tab.workflows.get(nextRun.workflowId) : null;
    if (!workflow) {
      continue;
    }

    workflow.queuedRuns = Math.max(0, workflow.queuedRuns - 1);
    if (workflow.pauseReason !== null && !nextRun.ignorePause) {
      continue;
    }

    void runWorkflow(tab, workflow, {
      trigger: nextRun.trigger,
      ignorePause: nextRun.ignorePause,
      bypassQueue: true,
    });
    return;
  }
}

function startRecurringWorkflowTimer(tab, workflow) {
  clearInterval(workflow.timer);
  workflow.timer = setInterval(() => {
    void runWorkflow(tab, workflow, { trigger: 'scheduled' });
  }, workflow.intervalMs);
}

function startWorkflow(tab, workflow, delayMs = workflow.intervalMs) {
  const initialDelay = Math.max(100, delayMs);
  clearWorkflowTimers(workflow);
  workflow.enabled = true;
  workflow.pauseReason = null;
  workflow.remainingMs = initialDelay;
  workflow.nextRunAt = Date.now() + initialDelay;
  if (tab.executionMode === 'sequence') {
    workflow.nextRunAt = null;
    if (tab.sequenceCurrentId === workflow.id) tab.sequenceCurrentId = null;
    return;
  }

  if (initialDelay === workflow.intervalMs) {
    startRecurringWorkflowTimer(tab, workflow);
    return;
  }

  workflow.resumeTimer = setTimeout(async () => {
    workflow.resumeTimer = null;
    await runWorkflow(tab, workflow, { trigger: 'scheduled' });

    if (workflow.pauseReason !== null || !workflow.enabled) {
      return;
    }

    startRecurringWorkflowTimer(tab, workflow);
  }, initialDelay);
}

function pauseWorkflow(tab, workflow, reason, options = {}) {
  if (workflow.pauseReason !== null) {
    return;
  }

  workflow.remainingMs = getWorkflowRemainingMs(workflow);
  workflow.nextRunAt = null;
  workflow.pauseReason = reason;
  if (reason === 'manual') {
    workflow.enabled = false;
  }
  clearWorkflowTimers(workflow);
  const removedQueuedRuns = removeQueuedRunsForWorkflow(tab, workflow.id);
  if (removedQueuedRuns > 0) {
    workflow.queuedRuns = Math.max(0, workflow.queuedRuns - removedQueuedRuns);
  }

  if (!options.silent) {
    addLog({
      level: 'info',
      tabId: tab.id,
      tabLabel: tab.label,
      workflowId: workflow.id,
      workflowName: workflow.name,
      action: 'workflow.pause',
      message: `${tab.label}: paused workflow ${workflow.name}`,
    });
  }
}

function resumeWorkflow(tab, workflow, options = {}) {
  if (workflow.pauseReason === null) {
    return;
  }

  tab.pausedAll = false;

  workflow.enabled = true;
  const delayMs = Math.max(100, workflow.remainingMs || workflow.intervalMs);
  workflow.pauseReason = null;
  startWorkflow(tab, workflow, delayMs);

  if (!options.silent) {
    addLog({
      level: 'info',
      tabId: tab.id,
      tabLabel: tab.label,
      workflowId: workflow.id,
      workflowName: workflow.name,
      action: 'workflow.resume',
      message: `${tab.label}: resumed workflow ${workflow.name}`,
    });
  }
}

async function executeWorkflowStep(tab, workflow, step, index, input = createWorkflowInput(tab.page)) {
  const page = tab.page;
  const stepNumber = index + 1;
  let stepResult = 'ok';
  let stepMessage = `${tab.label} / ${workflow.name}: step ${stepNumber} ${step.command} completed`;

  if (step.delayBeforeMs > 0) {
    await page.waitForTimeout(step.delayBeforeMs);
  }

  switch (step.command) {
    case 'bringToFront':
      if (shouldActivateTabForWorkflow(workflow)) {
        await page.bringToFront();
      } else {
        stepResult = 'skipped';
        stepMessage = `${tab.label} / ${workflow.name}: step ${stepNumber} bringToFront skipped because tab activation is disabled for this workflow`;
      }
      break;
    case 'focus':
      input.resetFocus();
      await focusTarget(page, step.target, workflow);
      break;
    case 'keyboard':
      await input.pressKey(step.key, step.holdDurationMs);
      break;
    case 'wait':
      await page.waitForTimeout(step.durationMs);
      break;
    case 'move': {
      input.resetFocus();
      await performRobustMove(page, tab, step, workflow);
      break;
    }
    case 'click': {
      input.resetFocus();
      await performRobustClick(page, tab, step);
      break;
    }
    case 'type': {
      await input.typeText(step.text, step);
      break;
    }
    case 'scroll': {
      await page.mouse.wheel(step.deltaX || 0, step.deltaY || 0);
      break;
    }
    case 'navigate': {
      input.resetFocus();
      await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      break;
    }
    case 'hover': {
      const hoverPoint = await calculatePosition(page, tab, step.position);
      await page.mouse.move(hoverPoint.x, hoverPoint.y, { steps: 8 });
      break;
    }
    default:
      throw new Error(`Unsupported command ${step.command}`);
  }

  if (step.delayAfterMs > 0) {
    await page.waitForTimeout(step.delayAfterMs);
  }

  addLog({
    tabId: tab.id,
    tabLabel: tab.label,
    workflowId: workflow.id,
    workflowName: workflow.name,
    action: `step.${step.command}`,
    result: stepResult,
    stepId: step.id,
    message: stepMessage,
  });
}

async function runWorkflow(tab, workflow, options = {}) {
  if (!tab || !tabs.has(tab.id) || !tab.workflows.has(workflow.id)) {
    return;
  }

  if (tab.page.isClosed()) {
    removeTab(tab.id, 'browser tab was closed');
    return;
  }

  if (options.trigger === 'scheduled' && tab.executionMode === 'sequence') return;

  if (workflow.pauseReason !== null && !options.ignorePause) {
    return;
  }

  const sameWorkflowQueued = tab.workflowQueue.some((entry) => entry.workflowId === workflow.id);
  const sameWorkflowBusy = workflow.activeRuns > 0 || tab.activeWorkflowId === workflow.id || sameWorkflowQueued;
  if (sameWorkflowBusy && !options.bypassQueue) {
    if (workflow.overlapPolicy === 'skip') {
      workflow.nextRunAt = Date.now() + workflow.intervalMs;
      workflow.remainingMs = workflow.intervalMs;
      addLog({
        level: 'warn',
        tabId: tab.id,
        tabLabel: tab.label,
        workflowId: workflow.id,
        workflowName: workflow.name,
        action: 'workflow.skip',
        result: 'skipped',
        message: `${tab.label} / ${workflow.name}: previous run still active, skipped this interval`,
      });
      emitState();
      return;
    }

    enqueueWorkflowRun(
      tab,
      workflow,
      options,
      `${tab.label} / ${workflow.name}: previous run still active, queued another run`,
    );
    return;
  }

  const tabBusyWithAnotherWorkflow = tab.activeWorkflowId !== null && tab.activeWorkflowId !== workflow.id;
  if ((tabBusyWithAnotherWorkflow || (tab.workflowQueue.length > 0 && !options.bypassQueue)) && !options.bypassQueue) {
    enqueueWorkflowRun(
      tab,
      workflow,
      options,
      `${tab.label} / ${workflow.name}: another workflow is already running on this tab, queued behind the current tab order`,
    );
    return;
  }

  tab.activeWorkflowId = workflow.id;
  workflow.activeRuns += 1;
  workflow.nextRunAt = Date.now() + workflow.intervalMs;
  workflow.remainingMs = workflow.intervalMs;
  emitState();

  addLog({
    tabId: tab.id,
    tabLabel: tab.label,
    workflowId: workflow.id,
    workflowName: workflow.name,
    action: 'workflow.start',
    result: options.trigger || 'manual',
    message: `${tab.label} / ${workflow.name}: workflow started`,
  });

  try {
    const input = createWorkflowInput(tab.page);
    for (let index = 0; index < workflow.steps.length; index += 1) {
      await executeWorkflowStep(tab, workflow, workflow.steps[index], index, input);
    }

    workflow.lastRunAt = nowIso();
    workflow.runCount += 1;
    workflow.lastError = null;
    addLog({
      tabId: tab.id,
      tabLabel: tab.label,
      workflowId: workflow.id,
      workflowName: workflow.name,
      action: 'workflow.complete',
      result: 'ok',
      message: `${tab.label} / ${workflow.name}: workflow completed`,
    });
  } catch (error) {
    workflow.errorCount += 1;
    workflow.lastError = error.message || String(error);
    addLog({
      level: 'error',
      tabId: tab.id,
      tabLabel: tab.label,
      workflowId: workflow.id,
      workflowName: workflow.name,
      action: 'workflow.error',
      result: 'error',
      message: `${tab.label} / ${workflow.name}: ${workflow.lastError}`,
    });
  } finally {
    workflow.activeRuns = Math.max(0, workflow.activeRuns - 1);
    if (tab.activeWorkflowId === workflow.id) {
      tab.activeWorkflowId = null;
    }
    workflow.updatedAt = nowIso();

    if (workflow.pauseReason === null && workflow.enabled) {
      workflow.remainingMs = workflow.intervalMs;
      workflow.nextRunAt = tab.executionMode === 'sequence' ? null : Date.now() + workflow.intervalMs;
    }

    emitState();
    drainTabWorkflowQueue(tab);
  }
}

function allWorkflowsPaused(tab) {
  return tab.workflows.size ? Array.from(tab.workflows.values()).every(workflow => workflow.pauseReason !== null || !workflow.enabled) : tab.pausedAll;
}

function toggleWorkflowPause(tabId, workflowId) {
  const tab = getTabOrThrow(tabId);
  const workflow = getWorkflowOrThrow(tab, workflowId);
  if (workflow.pauseReason === null && workflow.enabled) {
    pauseWorkflow(tab, workflow, 'manual');
  } else {
    if (workflow.pauseReason === null) workflow.pauseReason = 'manual';
    resumeWorkflow(tab, workflow);
  }
  tab.pausedAll = allWorkflowsPaused(tab);
  emitState();
  return serializeWorkflow(workflow, tab);
}

function removeWorkflowFromTab(tabId, workflowId) {
  const tab = getTabOrThrow(tabId);
  const workflow = getWorkflowOrThrow(tab, workflowId);

  clearWorkflowTimers(workflow);
  removeQueuedRunsForWorkflow(tab, workflow.id);
  if (tab.activeWorkflowId === workflow.id) {
    tab.activeWorkflowId = null;
  }
  tab.workflows.delete(workflow.id);
  addLog({
    tabId: tab.id,
    tabLabel: tab.label,
    workflowId: workflow.id,
    workflowName: workflow.name,
    action: 'workflow.remove',
    message: `${tab.label}: removed workflow ${workflow.name}`,
  });
  emitState();

  return {
    id: workflow.id,
  };
}

function serializeWorkflowForConfig(workflow) {
  return {
    id: workflow.id,
    sortOrder: workflow.sortOrder,
    name: workflow.name,
    enabled: workflow.enabled,
    intervalSeconds: workflow.intervalSeconds,
    startDelaySeconds: workflow.startDelaySeconds,
    description: workflow.description,
    notes: workflow.notes,
    overlapPolicy: workflow.overlapPolicy,
    tabActivationPolicy: workflow.tabActivationPolicy,
    pauseReason: workflow.pauseReason,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    lastRunAt: workflow.lastRunAt,
    nextRunAt: workflow.nextRunAt,
    runCount: workflow.runCount,
    errorCount: workflow.errorCount,
    lastError: workflow.lastError,
    steps: cloneValue(workflow.steps),
  };
}

function duplicateWorkflowOnTab(tabId, workflowId) {
  const tab = getTabOrThrow(tabId);
  const workflow = getWorkflowOrThrow(tab, workflowId);
  const duplicatePayload = serializeWorkflowForConfig(workflow);
  delete duplicatePayload.id;
  duplicatePayload.name = `${workflow.name} Copy`;
  duplicatePayload.steps = duplicatePayload.steps.map((step) => ({
    ...step,
    id: `step-${nextStepId++}`,
  }));

  const duplicate = upsertWorkflowOnTab(tab.id, duplicatePayload);
  addLog({
    tabId: tab.id,
    tabLabel: tab.label,
    workflowId: duplicate.id,
    workflowName: duplicate.name,
    action: 'workflow.duplicate',
    message: `${tab.label}: duplicated workflow ${workflow.name}`,
  });

  return duplicate;
}

function serializeTabForConfig(tab) {
  return {
    id: tab.id,
    name: tab.label,
    url: safePageUrl(tab.page),
    pausedAll: tab.pausedAll,
    executionMode: tab.executionMode,
    defaultPosition: cloneValue(tab.defaultPosition),
    workflows: Array.from(tab.workflows.values())
      .sort(compareWorkflowDisplayOrder)
      .map((workflow) => serializeWorkflowForConfig(workflow)),
  };
}

function upsertWorkflowOnTab(tabId, rawWorkflow, options = {}) {
  const tab = getTabOrThrow(tabId);
  const workflowId = rawWorkflow && rawWorkflow.id ? String(rawWorkflow.id) : null;
  const existingWorkflow = workflowId ? tab.workflows.get(workflowId) : null;
  const workflow = createWorkflowRuntime(tab, rawWorkflow, existingWorkflow);

  if (existingWorkflow) {
    clearWorkflowTimers(existingWorkflow);
    removeQueuedRunsForWorkflow(tab, existingWorkflow.id);
  }

  if (rawWorkflow && rawWorkflow.pauseReason === 'manual' && !workflow.enabled) {
    workflow.pauseReason = 'manual';
    workflow.remainingMs = workflow.intervalMs;
  }

  if (tab.pausedAll && workflow.enabled) {
    workflow.pauseReason = 'tab';
    workflow.remainingMs = workflow.intervalMs;
  }

  tab.workflows.set(workflow.id, workflow);

  if (!options.skipScheduling) {
    if (tab.pausedAll && workflow.enabled) {
      workflow.pauseReason = 'tab';
    } else if (workflow.enabled) {
      const initialDelay = workflow.startDelaySeconds > 0 ? workflow.startDelaySeconds * 1000 : workflow.intervalMs;
      startWorkflow(tab, workflow, initialDelay);
    } else {
      workflow.pauseReason = 'manual';
      workflow.remainingMs = workflow.intervalMs;
    }
  }

  addLog({
    tabId: tab.id,
    tabLabel: tab.label,
    workflowId: workflow.id,
    workflowName: workflow.name,
    action: existingWorkflow ? 'workflow.update' : 'workflow.create',
    message: `${tab.label}: ${existingWorkflow ? 'updated' : 'added'} workflow ${workflow.name}`,
  });

  emitState();
  return serializeWorkflow(workflow, tab);
}

function createLegacyWorkflowPayload(key, intervalSeconds) {
  return {
    name: `${key} every ${intervalSeconds}s`,
    enabled: true,
    intervalSeconds,
    startDelaySeconds: 0,
    description: '',
    notes: '',
    overlapPolicy: 'queue',
    tabActivationPolicy: 'background',
    steps: [{
      command: 'keyboard',
      key,
      holdDurationMs: 0,
      delayBeforeMs: 0,
      delayAfterMs: 0,
    }],
  };
}

function validateLegacyRuleInput(rawKey, rawIntervalSeconds) {
  const key = normalizeKeyboardKey(rawKey);
  const intervalSeconds = Math.trunc(Number(rawIntervalSeconds));
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1) {
    throw createHttpError('Interval must be a number greater than or equal to 1 second.', 400);
  }
  if (intervalSeconds > MAX_INTERVAL_SECONDS) {
    throw createHttpError(`Interval must be ${MAX_INTERVAL_SECONDS} seconds or less.`, 400);
  }
  return {
    key,
    intervalSeconds,
  };
}

function addRuleToTab(tabId, key, rawIntervalSeconds) {
  const parsed = validateLegacyRuleInput(key, rawIntervalSeconds);
  return upsertWorkflowOnTab(tabId, createLegacyWorkflowPayload(parsed.key, parsed.intervalSeconds));
}

function toggleRulePause(tabId, workflowId) {
  return toggleWorkflowPause(tabId, workflowId);
}

function removeRuleFromTab(tabId, workflowId) {
  return removeWorkflowFromTab(tabId, workflowId);
}

function toggleTabPause(tabId) {
  const tab = getTabOrThrow(tabId);
  const resume = allWorkflowsPaused(tab);
  tab.pausedAll = false;
  for (const workflow of tab.workflows.values()) {
    if (resume) {
      if (workflow.pauseReason === null && !workflow.enabled) workflow.pauseReason = 'manual';
      resumeWorkflow(tab, workflow, { silent: true });
    } else {
      pauseWorkflow(tab, workflow, 'manual', { silent: true });
      workflow.enabled = false;
      workflow.pauseReason = 'manual';
    }
  }
  tab.pausedAll = !resume;
  addLog({ tabId: tab.id, tabLabel: tab.label, action: resume ? 'tab.resume' : 'tab.pause', message: `${tab.label}: ${resume ? 'resumed' : 'paused'} all workflows` });
  emitState();
  return serializeTab(tab);
}

function enableSequence(tab) {
  startSequence(tab, { runWorkflow, compareWorkflows: compareWorkflowDisplayOrder,
    onError: error => addLog({ level: 'error', tabId: tab.id, action: 'sequence.error', message: error.message }) });
}

function setTabExecutionMode(tabId, mode) {
  if (!['interval', 'sequence'].includes(mode)) throw createHttpError('Invalid execution mode.', 400);
  const tab = getTabOrThrow(tabId);
  if (tab.executionMode === mode) return serializeTab(tab);
  clearInterval(tab.sequenceTimer);
  tab.sequenceTimer = null;
  tab.sequenceCurrentId = null;
  tab.sequenceCursorId = null;
  for (const workflow of tab.workflows.values()) {
    workflow.remainingMs = getWorkflowRemainingMs(workflow);
    clearWorkflowTimers(workflow);
    workflow.nextRunAt = null;
    workflow.queuedRuns = 0;
  }
  tab.workflowQueue = [];
  tab.executionMode = mode;
  if (mode === 'sequence') enableSequence(tab);
  else for (const workflow of tab.workflows.values()) {
    if (workflow.enabled && workflow.pauseReason === null) startWorkflow(tab, workflow, workflow.remainingMs);
  }
  emitState();
  return serializeTab(tab);
}

function resetTabCountdowns(tabId) {
  const tab = getTabOrThrow(tabId);
  tab.sequenceCurrentId = null;
  tab.sequenceCursorId = null;
  if (tab.executionMode === 'sequence') {
    clearInterval(tab.sequenceTimer);
    enableSequence(tab);
  }
  for (const workflow of tab.workflows.values()) {
    clearWorkflowTimers(workflow);
    removeQueuedRunsForWorkflow(tab, workflow.id);
    workflow.queuedRuns = 0;
    workflow.remainingMs = workflow.intervalMs;
    workflow.nextRunAt = null;
    if (workflow.enabled && workflow.pauseReason === null) {
      startWorkflow(tab, workflow, workflow.intervalMs);
    }
  }
  addLog({ tabId: tab.id, tabLabel: tab.label, action: 'tab.reset-countdowns', message: `${tab.label}: reset all workflow countdowns` });
  emitState();
  return serializeTab(tab);
}

function disposeTabRuntime(tab) {
  tab.isDisposing = true;
  clearTabWorkflows(tab);
}

function removeTab(tabId, reason = 'tab removed') {
  const tab = tabs.get(Number(tabId));
  if (!tab) {
    return;
  }

  disposeTabRuntime(tab);
  tabs.delete(tab.id);

  if (!isShuttingDown && !isResettingController) {
    addLog({
      tabId: tab.id,
      tabLabel: tab.label,
      action: 'tab.remove',
      message: `${tab.label}: ${reason}`,
    });
  }

  emitState();
}

function handleBrowserControllerClosed() {
  if (isBrowserContextClosed) {
    return;
  }

  isBrowserContextClosed = true;
  browser = null;
  browserContext = null;

  for (const tab of tabs.values()) {
    disposeTabRuntime(tab);
  }
  tabs.clear();

  if (!isShuttingDown && !isResettingController) {
    addLog({
      level: 'warn',
      action: 'browser.closed',
      message: 'Playwright browser was closed. Add a new tab to relaunch it.',
    });
  }

  emitState();
}

async function launchBrowserController() {
  const normalizedConfig = normalizeBrowserConfig(browserConfigState);
  const resolvedBrowser = normalizedConfig.launchMode === 'connectOverCDP' || normalizedConfig.connectOverCDP
    ? { name: browserTypeLabel(normalizedConfig.type), executablePath: null, source: 'cdp' }
    : resolveBrowserRuntime(normalizedConfig);
  browserRuntime = resolvedBrowser;

  const launchArgs = buildLaunchArgs(normalizedConfig);
  if (process.platform === 'linux' && !normalizedConfig.headless &&
      normalizedConfig.launchMode !== 'connectOverCDP' && !normalizedConfig.connectOverCDP &&
      !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw createHttpError('No Ubuntu desktop session is available. Start Web Macro from your desktop session, or enable headless mode for background use.', 400);
  }
  const launchOptions = {
    headless: normalizedConfig.headless,
    args: launchArgs,
  };

  if (resolvedBrowser.executablePath) {
    launchOptions.executablePath = resolvedBrowser.executablePath;
  }

  if (normalizedConfig.launchMode === 'connectOverCDP' || normalizedConfig.connectOverCDP) {
    const launchedBrowser = await chromium.connectOverCDP(normalizedConfig.cdpUrl);
    const existingContext = launchedBrowser.contexts()[0];
    if (!existingContext) {
      throw createHttpError('No existing browser context is available via CDP. Open the target browser first.', 503);
    }

    browserSessionMode = 'connectOverCDP';
    return {
      browser: launchedBrowser,
      context: existingContext,
    };
  }

  if (normalizedConfig.launchMode === 'persistent') {
    const userDataDir = normalizedConfig.userDataDir || path.join(__dirname, 'profiles', normalizedConfig.type);
    fs.mkdirSync(userDataDir, { recursive: true });
    const context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      viewport: null,
    });

    browserSessionMode = 'persistent';
    return {
      browser: null,
      context,
    };
  }

  const launchedBrowser = await chromium.launch(launchOptions);
  const context = await launchedBrowser.newContext({
    viewport: null,
  });

  browserSessionMode = 'launch';
  return {
    browser: launchedBrowser,
    context,
  };
}

function isContextUsable(context) {
  if (!context || isBrowserContextClosed) {
    return false;
  }

  try {
    context.pages();
    return true;
  } catch (_error) {
    return false;
  }
}

async function initializeBrowserController(options = {}) {
  if (!options.force && isContextUsable(browserContext)) {
    return;
  }

  const launched = await launchBrowserController();
  browser = launched.browser;
  browserContext = launched.context;
  isBrowserContextClosed = false;

  if (browser) {
    browser.on('disconnected', () => {
      handleBrowserControllerClosed();
    });
  }

  browserContext.on('close', () => {
    handleBrowserControllerClosed();
  });

  const existingPages = browserContext.pages();
  for (const page of existingPages) {
    const pageUrl = safePageUrl(page);
    if (isIgnorableBrowserPage(pageUrl)) {
      await page.close().catch(() => {});
      continue;
    }
    registerExistingPage(page);
  }
}

async function closeBrowserController() {
  const activeContext = browserContext;
  const activeBrowser = browser;
  browserContext = null;
  browser = null;
  isBrowserContextClosed = true;

  if (activeContext) {
    await activeContext.close().catch(() => {});
  }
  if (activeBrowser) {
    await activeBrowser.close().catch(() => {});
  }
}

async function replaceRuntimeFromDefinitions(definition, options = {}) {
  const normalizedBrowserConfig = normalizeBrowserConfig(definition.browser || browserConfigState);
  const tabsToRestore = Array.isArray(definition.tabs) ? definition.tabs : [];

  isResettingController = true;
  for (const tab of tabs.values()) {
    disposeTabRuntime(tab);
  }
  tabs.clear();
  emitState();
  await closeBrowserController();

  browserConfigState = normalizedBrowserConfig;
  currentConfigName = options.configName ?? currentConfigName;
  await initializeBrowserController({ force: true });

  for (const tabDefinition of tabsToRestore) {
    await createGameTab({
      label: tabDefinition.name || tabDefinition.label,
      url: normalizeTabUrl(tabDefinition.url),
      pausedAll: coerceBoolean(tabDefinition.pausedAll, false),
      executionMode: tabDefinition.executionMode,
      defaultPosition: tabDefinition.defaultPosition || DEFAULT_TAB_POSITION,
      workflows: Array.isArray(tabDefinition.workflows) ? tabDefinition.workflows : [],
      resumeWorkflows: coerceBoolean(options.resumeWorkflows, false),
    });
  }

  isResettingController = false;
  emitState();
}

function normalizeTabUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || trimmed === 'about:blank') {
    return 'about:blank';
  }

  try {
    return new URL(trimmed).href;
  } catch (_error) {
    // Prepend https if no protocol is given.
    try {
      return new URL(`https://${trimmed}`).href;
    } catch (_err) {
      return 'about:blank';
    }
  }
}

async function createGameTab(options = {}) {
  if (!isContextUsable(browserContext)) {
    addLog({ level: 'warn', message: 'Browser context was closed. Relaunching controller...', action: 'browser.relaunch' });
    await initializeBrowserController({ force: true });
  }

  if (!isContextUsable(browserContext)) {
    throw createHttpError('Browser controller is not ready yet.', 503);
  }

  const resolvedUrl = normalizeTabUrl(options.url);
  const page = await browserContext.newPage();
  const tab = createTabRecord(page, {
    label: options.label,
    executionMode: options.executionMode,
    pausedAll: options.pausedAll,
    defaultPosition: options.defaultPosition || DEFAULT_TAB_POSITION,
  });

  emitState();

  tab.navigation = { state: resolvedUrl === 'about:blank' ? 'ready' : 'loading', requestedUrl: resolvedUrl, error: null };
  const navigate = async () => {
    try {
      if (resolvedUrl !== 'about:blank') {
        await page.goto(resolvedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await waitForPageReady(page);
      }
      tab.navigation.state = 'ready';
      addLog({ tabId: tab.id, tabLabel: tab.label, action: 'tab.open', message: `${tab.label}: opened ${resolvedUrl}` });
    } catch (error) {
      if (page.isClosed()) return;
      tab.navigation = { state: 'error', requestedUrl: resolvedUrl, error: error.message };
      addLog({ tabId: tab.id, level: 'error', action: 'tab.open', message: `${tab.label}: failed to load ${resolvedUrl} (${error.message})` });
    } finally {
      if (tabs.has(tab.id)) emitState();
    }
  };
  // User creation acknowledges the new tab immediately; navigation reports separately.
  // Snapshot restoration still waits for loading before scheduling its workflows.
  if (options.backgroundNavigation) void navigate();
  else await navigate();
  if (!browserConfigState.headless && options.backgroundNavigation) {
    await page.bringToFront().catch(() => {});
  }

  if (Array.isArray(options.workflows)) {
    for (const workflowDefinition of options.workflows) {
      const workflowPayload = {
        ...workflowDefinition,
        enabled: options.resumeWorkflows ? coerceBoolean(workflowDefinition.enabled, true) : false,
      };
      const serialized = upsertWorkflowOnTab(tab.id, workflowPayload, { skipScheduling: false });
      const runtimeWorkflow = tab.workflows.get(String(serialized.id));

      if (!options.resumeWorkflows) {
        pauseWorkflow(tab, runtimeWorkflow, 'manual', { silent: true });
      } else if (options.pausedAll) {
        pauseWorkflow(tab, runtimeWorkflow, 'tab', { silent: true });
      }
    }
  }

  emitState();
  return serializeTab(tab);
}

async function runWorkflowOnce(tabId, workflowId) {
  const tab = getTabOrThrow(tabId);
  const workflow = getWorkflowOrThrow(tab, workflowId);
  await runWorkflow(tab, workflow, { trigger: 'manual', ignorePause: true });
  return serializeWorkflow(workflow, tab);
}

function saveCurrentConfig(rawName) {
  const configName = normalizeString(rawName);
  if (!configName) {
    throw createHttpError('Config name is required.', 400);
  }

  const configId = sanitizeConfigId(configName);
  if (!configId) {
    throw createHttpError('Config name must contain letters or numbers.', 400);
  }

  const document = {
    configName,
    savedAt: nowIso(),
    browser: normalizeBrowserConfig(browserConfigState),
    tabs: Array.from(tabs.values())
      .sort((left, right) => left.id - right.id)
      .map((tab) => serializeTabForConfig(tab)),
  };

  ensureConfigDir();
  fs.writeFileSync(configFilePath(configId), JSON.stringify(document, null, 2), 'utf8');
  currentConfigName = configName;

  addLog({
    action: 'config.save',
    message: `Saved config ${configName}`,
  });
  emitState();

  return {
    id: configId,
    name: configName,
  };
}

async function loadSavedConfig(configId, options = {}) {
  const document = readSavedConfig(configId);
  await replaceRuntimeFromDefinitions(document, {
    resumeWorkflows: coerceBoolean(options.resumeWorkflows, false),
    configName: document.configName || configId,
  });

  currentConfigName = document.configName || configId;
  addLog({
    action: 'config.load',
    message: `Loaded config ${currentConfigName}`,
  });
  emitState();

  return {
    id: configId,
    name: currentConfigName,
  };
}

function deleteSavedConfig(configId) {
  const filePath = configFilePath(configId);
  if (!fs.existsSync(filePath)) {
    throw createHttpError(`Config ${configId} was not found.`, 404);
  }

  fs.rmSync(filePath, { force: true });
  if (currentConfigName && sanitizeConfigId(currentConfigName) === configId) {
    currentConfigName = null;
  }

  addLog({
    action: 'config.delete',
    message: `Deleted config ${configId}`,
  });
  emitState();

  return {
    id: configId,
  };
}

async function updateBrowserConfig(rawConfig) {
  const nextBrowserConfig = normalizeBrowserConfig(rawConfig);
  // Reject a disappeared/invalid executable before closing the current browser.
  if (nextBrowserConfig.launchMode !== 'connectOverCDP' && !nextBrowserConfig.connectOverCDP) resolveBrowserRuntime(nextBrowserConfig);
  const runtimeSnapshot = {
    browser: nextBrowserConfig,
    tabs: Array.from(tabs.values())
      .sort((left, right) => left.id - right.id)
      .map((tab) => serializeTabForConfig(tab)),
  };

  await replaceRuntimeFromDefinitions(runtimeSnapshot, {
    resumeWorkflows: true,
    configName: currentConfigName,
  });

  addLog({
    action: 'browser.update',
    message: `Applied browser settings for ${browserTypeLabel(nextBrowserConfig.type)}`,
  });
  emitState();

  return buildBrowserSummary();
}

function bindSocketHandlers() {
  io.on('connection', (socket) => {
    emitState(socket);
    socket.emit('logs:bootstrap', logs);

    socket.on('tab:close', async (payload, callback) => {
      try {
        const tabId = payload && Number(payload.tabId);
        const tab = getTabOrThrow(tabId);
        await tab.page.close().catch(() => {});
        removeTab(tab.id, 'closed by controller');
        if (typeof callback === 'function') {
          callback({ ok: true });
        }
      } catch (error) {
        const message = error.message || 'Failed to close tab.';
        addLog({ level: 'error', action: 'tab.close.error', message: `Close tab failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('tab:clone', async (payload, callback) => {
      try {
        const source = serializeTabForConfig(getTabOrThrow(payload.tabId));
        const tab = await createGameTab(buildCloneOptions(source, payload.url));
        addLog({ action: 'tab.clone', tabId: tab.id, message: `Cloned ${source.name} with all workflows` });
        if (typeof callback === 'function') callback({ ok: true, result: tab });
      } catch (error) {
        const message = error.message || 'Failed to clone tab.';
        addLog({ level: 'error', action: 'tab.clone.error', message });
        if (typeof callback === 'function') callback({ ok: false, error: message });
      }
    });

    socket.on('tab:create', async (payload, callback) => {
      try {
        const tab = await createGameTab({ ...(payload || {}), backgroundNavigation: true });
        if (typeof callback === 'function') {
          callback({ ok: true, result: tab });
        }
      } catch (error) {
        const message = error.message || 'Failed to create a new tab.';
        addLog({ level: 'error', action: 'tab.create.error', message: `Create tab failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('workflow:save', (payload, callback) => {
      try {
        const result = upsertWorkflowOnTab(payload.tabId, payload.workflow || payload);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to save workflow.';
        addLog({ level: 'error', action: 'workflow.save.error', message: `Save workflow failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('workflow:toggle', (payload, callback) => {
      try {
        const result = toggleWorkflowPause(payload.tabId, payload.workflowId);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to toggle workflow.';
        addLog({ level: 'error', action: 'workflow.toggle.error', message: `Toggle workflow failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('workflow:remove', (payload, callback) => {
      try {
        const result = removeWorkflowFromTab(payload.tabId, payload.workflowId);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to remove workflow.';
        addLog({ level: 'error', action: 'workflow.remove.error', message: `Remove workflow failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('workflow:duplicate', (payload, callback) => {
      try {
        const result = duplicateWorkflowOnTab(payload.tabId, payload.workflowId);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to duplicate workflow.';
        addLog({ level: 'error', action: 'workflow.duplicate.error', message: `Duplicate workflow failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('workflow:run-once', async (payload, callback) => {
      try {
        const result = await runWorkflowOnce(payload.tabId, payload.workflowId);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to run workflow once.';
        addLog({ level: 'error', action: 'workflow.run-once.error', message: `Run once failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('tab:execution-mode', (payload, callback) => {
      try {
        const result = setTabExecutionMode(payload.tabId, payload.mode);
        if (typeof callback === 'function') callback({ ok: true, result });
      } catch (error) {
        if (typeof callback === 'function') callback({ ok: false, error: error.message });
      }
    });

    socket.on('tab:reset-countdowns', (payload, callback) => {
      try {
        const result = resetTabCountdowns(payload.tabId);
        if (typeof callback === 'function') callback({ ok: true, result });
      } catch (error) {
        if (typeof callback === 'function') callback({ ok: false, error: error.message });
      }
    });

    socket.on('tab:toggle-pause-all', (payload, callback) => {
      try {
        const result = toggleTabPause(payload.tabId);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to toggle the tab.';
        addLog({ level: 'error', action: 'tab.toggle.error', message: `Toggle tab failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('browser:update', async (payload, callback) => {
      try {
        const result = await updateBrowserConfig(payload || {});
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to update browser settings.';
        addLog({ level: 'error', action: 'browser.update.error', message: `Update browser settings failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('config:save', (payload, callback) => {
      try {
        const result = saveCurrentConfig(payload && payload.name);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to save config.';
        addLog({ level: 'error', action: 'config.save.error', message: `Save config failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('config:load', async (payload, callback) => {
      try {
        const result = await loadSavedConfig(payload && payload.configId, {
          resumeWorkflows: payload && payload.resumeWorkflows,
        });
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to load config.';
        addLog({ level: 'error', action: 'config.load.error', message: `Load config failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('config:delete', (payload, callback) => {
      try {
        const result = deleteSavedConfig(payload && payload.configId);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to delete config.';
        addLog({ level: 'error', action: 'config.delete.error', message: `Delete config failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('logs:clear', (_payload, callback) => {
      clearLogs();
      if (typeof callback === 'function') {
        callback({ ok: true });
      }
    });

    socket.on('rule:add', (payload, callback) => {
      try {
        const result = addRuleToTab(payload.tabId, payload.key, payload.intervalSeconds);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to add legacy rule.';
        addLog({ level: 'error', action: 'rule.add.error', message: `Add rule failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('rule:toggle', (payload, callback) => {
      try {
        const result = toggleRulePause(payload.tabId, payload.ruleId);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to toggle legacy rule.';
        addLog({ level: 'error', action: 'rule.toggle.error', message: `Toggle rule failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });

    socket.on('rule:remove', (payload, callback) => {
      try {
        const result = removeRuleFromTab(payload.tabId, payload.ruleId);
        if (typeof callback === 'function') {
          callback({ ok: true, result });
        }
      } catch (error) {
        const message = error.message || 'Failed to remove legacy rule.';
        addLog({ level: 'error', action: 'rule.remove.error', message: `Remove rule failed: ${message}` });
        if (typeof callback === 'function') {
          callback({ ok: false, error: message });
        }
      }
    });
  });
}

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Shutting down controller (${signal})...`);

  if (stateBroadcastTimer) {
    clearInterval(stateBroadcastTimer);
    stateBroadcastTimer = null;
  }

  for (const tab of tabs.values()) {
    disposeTabRuntime(tab);
  }

  await closeBrowserController();

  await new Promise((resolve) => {
    io.close(() => resolve());
  });

  process.exit(0);
}

async function start() {
  ensureConfigDir();
  bindSocketHandlers();
  await initializeBrowserController();

  stateBroadcastTimer = setInterval(() => {
    emitState();
  }, STATE_BROADCAST_MS);

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Use a different PORT or stop the dev instance on ${PORT}.`);
      process.exit(1);
      return;
    }

    console.error('Server error:', err);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(`web-macro is running at http://localhost:${PORT}`);
    console.log(`Browser session mode: ${buildBrowserSummary().summary}`);
    console.log(`Browser runtime: ${browserRuntime.name}${browserRuntime.executablePath ? ` (${browserRuntime.executablePath})` : ''}`);
    addLog({ action: 'controller.ready', message: `web-macro ready at http://localhost:${PORT}` });
    addLog({ action: 'browser.runtime', message: `Browser runtime: ${browserRuntime.name}` });
    emitState();
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

start().catch((error) => {
  console.error('Failed to start the controller:', error);
  process.exit(1);
});
