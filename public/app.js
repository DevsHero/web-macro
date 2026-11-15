(() => {
  const DEFAULT_KEYS = Array.from({ length: 12 }, (_, index) => `F${index + 1}`);
  const WORKFLOW_STATUS_META = {
    waiting: {
      label: 'Waiting',
      classes: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
    },
    executing: {
      label: 'Executing',
      classes: 'border-rose-300/20 bg-rose-300/10 text-rose-100',
    },
    paused: {
      label: 'Paused',
      classes: 'border-slate-300/20 bg-slate-300/10 text-slate-100',
    },
    'paused-by-tab': {
      label: 'Paused by Tab',
      classes: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
    },
    error: {
      label: 'Error',
      classes: 'border-rose-300/20 bg-rose-300/10 text-rose-100',
    },
  };
  const STEP_COMMAND_OPTIONS = [
    { value: 'keyboard', label: 'Keyboard Key' },
    { value: 'type', label: 'Type Text' },
    { value: 'click', label: 'Mouse Click' },
    { value: 'hover', label: 'Mouse Hover' },
    { value: 'scroll', label: 'Scroll' },
    { value: 'wait', label: 'Wait' },
    { value: 'navigate', label: 'Navigate to URL' },
    { value: 'move', label: 'Mouse Move' },
    { value: 'focus', label: 'Focus Target' },
    { value: 'bringToFront', label: 'Bring Tab to Front' },
  ];
  const LAUNCH_MODE_OPTIONS = [
    { value: 'launch', label: 'Ephemeral Context' },
    { value: 'persistent', label: 'Persistent Profile' },
    { value: 'connectOverCDP', label: 'Connect Over CDP' },
  ];
  const OVERLAP_POLICY_OPTIONS = [
    { value: 'queue', label: 'Queue Repeat Triggers' },
    { value: 'skip', label: 'Skip Repeat Triggers' },
  ];
  const WORKFLOW_ACTIVATION_POLICY_OPTIONS = [
    { value: 'background', label: 'Background-safe' },
    { value: 'activate', label: 'Activate Tab' },
    { value: 'inherit', label: 'Use Browser Default' },
  ];
  const POSITION_PRESET_OPTIONS = [
    'center',
    'top-center',
    'bottom-center',
    'left-center',
    'right-center',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ];

  const state = {
    connected: false,
    addingTab: false,
    logsVisible: false,
    logStickToBottom: true,
    selectedConfigId: '',
    logFilters: {
      tabId: 'all',
      workflowId: 'all',
      errorsOnly: false,
    },
    snapshot: {
      serverTime: Date.now(),
      port: 3005,
      tabs: [],
      supportedKeys: DEFAULT_KEYS,
      workflowTemplates: [],
      browserConfig: {},
      browserSummary: {},
      savedConfigs: [],
      currentConfigName: null,
    },
    logs: [],
    flashTimeout: null,
    workflowModal: {
      open: false,
      tabId: null,
      draft: null,
      mode: 'create',
    },
    browserCatalog: [],
    scanningBrowsers: false,
    applyingBrowser: false,
    browserScanMessage: '',
    browserModal: {
      open: false,
      draft: null,
    },
    renderCache: {
      tabsSignature: '',
    },
  };

  const elements = {
    dashboardMain: document.getElementById('dashboardMain'),
    addTabVisibilityNotice: document.getElementById('addTabVisibilityNotice'),
    showBrowserWindowButton: document.getElementById('showBrowserWindowButton'),
    addTabButton: document.getElementById('addTabButton'),
    openConfigModalButton: document.getElementById('openConfigModalButton'),
    toggleLogsButton: document.getElementById('toggleLogsButton'),
    openBrowserSettingsButton: document.getElementById('openBrowserSettingsButton'),
    connectionPill: document.getElementById('connectionPill'),
    connectionText: document.getElementById('connectionText'),
    flashMessage: document.getElementById('flashMessage'),
    currentBrowserSummary: document.getElementById('currentBrowserSummary'),
    currentBrowserMeta: document.getElementById('currentBrowserMeta'),
    currentConfigLabel: document.getElementById('currentConfigLabel'),
    savedConfigMeta: document.getElementById('savedConfigMeta'),
    configNameInput: document.getElementById('configNameInput'),
    savedConfigSelect: document.getElementById('savedConfigSelect'),
    loadConfigButton: document.getElementById('loadConfigButton'),
    saveConfigButton: document.getElementById('saveConfigButton'),
    deleteConfigButton: document.getElementById('deleteConfigButton'),
    exportConfigButton: document.getElementById('exportConfigButton'),
    importConfigButton: document.getElementById('importConfigButton'),
    importConfigInput: document.getElementById('importConfigInput'),
    configResumeToggle: document.getElementById('configResumeToggle'),
    configModal: document.getElementById('configModal'),
    closeConfigModalButton: document.getElementById('closeConfigModalButton'),
    statTabs: document.getElementById('statTabs'),
    statWorkflows: document.getElementById('statWorkflows'),
    statExecuting: document.getElementById('statExecuting'),
    statErrors: document.getElementById('statErrors'),
    browserSessionValue: document.getElementById('browserSessionValue'),
    browserSessionMeta: document.getElementById('browserSessionMeta'),
    emptyState: document.getElementById('emptyState'),
    tabsGrid: document.getElementById('tabsGrid'),
    logPanel: document.getElementById('logPanel'),
    logsBodyWrapper: document.getElementById('logsBodyWrapper'),
    logConsole: document.getElementById('logConsole'),
    logCount: document.getElementById('logCount'),
    logFilterTab: document.getElementById('logFilterTab'),
    logFilterWorkflow: document.getElementById('logFilterWorkflow'),
    logErrorsOnly: document.getElementById('logErrorsOnly'),
    clearLogsButton: document.getElementById('clearLogsButton'),
    workflowModal: document.getElementById('workflowModal'),
    workflowModalEyebrow: document.getElementById('workflowModalEyebrow'),
    workflowModalTitle: document.getElementById('workflowModalTitle'),
    workflowModalSubtitle: document.getElementById('workflowModalSubtitle'),
    closeWorkflowModalButton: document.getElementById('closeWorkflowModalButton'),
    workflowForm: document.getElementById('workflowForm'),
    workflowEnabledInput: document.getElementById('workflowEnabledInput'),
    workflowNameInput: document.getElementById('workflowNameInput'),
    workflowIntervalInput: document.getElementById('workflowIntervalInput'),
    workflowStartDelayInput: document.getElementById('workflowStartDelayInput'),
    workflowOverlapPolicySelect: document.getElementById('workflowOverlapPolicySelect'),
    workflowActivationPolicySelect: document.getElementById('workflowActivationPolicySelect'),
    workflowDescriptionInput: document.getElementById('workflowDescriptionInput'),
    workflowNotesInput: document.getElementById('workflowNotesInput'),
    workflowTemplateSelect: document.getElementById('workflowTemplateSelect'),
    applyWorkflowTemplateButton: document.getElementById('applyWorkflowTemplateButton'),
    newStepTypeSelect: document.getElementById('newStepTypeSelect'),
    addWorkflowStepButton: document.getElementById('addWorkflowStepButton'),
    workflowSteps: document.getElementById('workflowSteps'),
    duplicateWorkflowButton: document.getElementById('duplicateWorkflowButton'),
    testWorkflowButton: document.getElementById('testWorkflowButton'),
    cancelWorkflowButton: document.getElementById('cancelWorkflowButton'),
    saveWorkflowButton: document.getElementById('saveWorkflowButton'),
    browserModal: document.getElementById('browserModal'),
    closeBrowserModalButton: document.getElementById('closeBrowserModalButton'),
    browserForm: document.getElementById('browserForm'),
    browserTypeSelect: document.getElementById('browserTypeSelect'),
    scanBrowsersButton: document.getElementById('scanBrowsersButton'),
    browserScanStatus: document.getElementById('browserScanStatus'),
    browserAdvancedSettings: document.getElementById('browserAdvancedSettings'),
    browserLaunchModeSelect: document.getElementById('browserLaunchModeSelect'),
    browserExecutablePathInput: document.getElementById('browserExecutablePathInput'),
    browserUserDataDirInput: document.getElementById('browserUserDataDirInput'),
    browserCdpUrlInput: document.getElementById('browserCdpUrlInput'),
    browserArgsTextarea: document.getElementById('browserArgsTextarea'),
    browserHeadlessInput: document.getElementById('browserHeadlessInput'),
    browserActivateTabInput: document.getElementById('browserActivateTabInput'),
    browserOptimizeForHiddenExecutionInput: document.getElementById('browserOptimizeForHiddenExecutionInput'),
    cancelBrowserButton: document.getElementById('cancelBrowserButton'),
    saveBrowserButton: document.getElementById('saveBrowserButton'),
    addTabModal: document.getElementById('addTabModal'),
    addTabUrlInput: document.getElementById('addTabUrlInput'),
    cancelAddTabButton: document.getElementById('cancelAddTabButton'),
    confirmAddTabButton: document.getElementById('confirmAddTabButton'),
  };

  const socket = io({
    transports: ['websocket', 'polling'],
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function formatClock(dateString) {
    if (!dateString) {
      return 'Never';
    }

    return new Date(dateString).toLocaleTimeString([], {
      hour12: false,
    });
  }

  function formatCountdown(totalSeconds) {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function statusMeta(workflow) {
    return WORKFLOW_STATUS_META[workflow.status] || WORKFLOW_STATUS_META.waiting;
  }

  function flash(message, type = 'error') {
    if (!message) {
      elements.flashMessage.classList.add('hidden');
      elements.flashMessage.textContent = '';
      return;
    }

    elements.flashMessage.textContent = message;
    elements.flashMessage.className =
      type === 'success'
        ? 'rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100'
        : 'rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100';

    if (state.flashTimeout) {
      clearTimeout(state.flashTimeout);
    }

    state.flashTimeout = setTimeout(() => {
      elements.flashMessage.classList.add('hidden');
      elements.flashMessage.textContent = '';
    }, 4500);
  }

  function supportedKeys() {
    return Array.isArray(state.snapshot.supportedKeys) && state.snapshot.supportedKeys.length ? state.snapshot.supportedKeys : DEFAULT_KEYS;
  }

  async function parseJsonResponse(response) {
    try {
      return await response.json();
    } catch (_error) {
      return {};
    }
  }

  function getTab(tabId) {
    return (state.snapshot.tabs || []).find((tab) => String(tab.id) === String(tabId)) || null;
  }

  function getWorkflow(tabId, workflowId) {
    const tab = getTab(tabId);
    if (!tab) {
      return null;
    }

    return (tab.workflows || []).find((workflow) => String(workflow.id) === String(workflowId)) || null;
  }

  function currentBrowserConfig() {
    return state.snapshot.browserConfig || {};
  }

  function currentBrowserSummary() {
    return state.snapshot.browserSummary || {};
  }

  function createDefaultPosition() {
    return {
      coordinateSystem: 'canvas',
      mode: 'preset',
      preset: 'center',
    };
  }

  function createDefaultStep(command = 'keyboard') {
    const id = `draft-step-${Math.random().toString(36).slice(2, 10)}`;
    switch (command) {
      case 'click':
        return {
          id,
          command: 'click',
          button: 'left',
          clickCount: 1,
          position: createDefaultPosition(),
          delayBeforeMs: 0,
          delayAfterMs: 0,
        };
      case 'wait':
        return {
          id,
          command: 'wait',
          durationMs: 120,
          delayBeforeMs: 0,
          delayAfterMs: 0,
        };
      case 'move':
        return {
          id,
          command: 'move',
          durationMs: 150,
          position: createDefaultPosition(),
          delayBeforeMs: 0,
          delayAfterMs: 0,
        };
      case 'focus':
        return {
          id,
          command: 'focus',
          target: 'canvas',
          delayBeforeMs: 0,
          delayAfterMs: 0,
        };
      case 'bringToFront':
        return {
          id,
          command: 'bringToFront',
          delayBeforeMs: 0,
          delayAfterMs: 0,
        };
      case 'type':
        return {
          id,
          command: 'type',
          text: '',
          clearFirst: false,
          typingDelayMs: 0,
          delayBeforeMs: 0,
          delayAfterMs: 0,
        };
      case 'scroll':
        return {
          id,
          command: 'scroll',
          deltaX: 0,
          deltaY: 120,
          delayBeforeMs: 0,
          delayAfterMs: 0,
        };
      case 'navigate':
        return {
          id,
          command: 'navigate',
          url: '',
          delayBeforeMs: 0,
          delayAfterMs: 0,
        };
      case 'hover':
        return {
          id,
          command: 'hover',
          position: createDefaultPosition(),
          delayBeforeMs: 0,
          delayAfterMs: 0,
        };
      default:
        return {
          id,
          command: 'keyboard',
          key: supportedKeys()[0] || 'F1',
          holdDurationMs: 0,
          delayBeforeMs: 0,
          delayAfterMs: 0,
        };
    }
  }

  function hydrateStep(step) {
    const command = (step && step.command) || 'keyboard';
    const hydrated = Object.assign(createDefaultStep(command), clone(step || {}));

    if (command === 'click' || command === 'move' || command === 'hover') {
      hydrated.position = step && step.position && step.position.useTabDefault
        ? { useTabDefault: true }
        : Object.assign(createDefaultPosition(), clone((step && step.position) || {}));
    }

    return hydrated;
  }

  function hydrateWorkflowDraft(rawWorkflow) {
    const workflow = rawWorkflow || {};
    return {
      id: workflow.id || null,
      name: workflow.name || '',
      enabled: workflow.enabled !== false,
      intervalSeconds: toNumber(workflow.intervalSeconds, 30),
      startDelaySeconds: toNumber(workflow.startDelaySeconds, 0),
      description: workflow.description || '',
      notes: workflow.notes || '',
      overlapPolicy: workflow.overlapPolicy === 'skip' ? 'skip' : 'queue',
      tabActivationPolicy: workflow.tabActivationPolicy || 'background',
      steps: Array.isArray(workflow.steps) && workflow.steps.length ? workflow.steps.map((step) => hydrateStep(step)) : [createDefaultStep('keyboard')],
    };
  }

  function workflowActivationLabel(workflow) {
    const policy = workflow.tabActivationPolicy || 'background';
    if (policy === 'activate') {
      return 'Activate Tab';
    }
    if (policy === 'inherit') {
      return 'Browser Default';
    }
    return 'Background-safe';
  }

  function overlapPolicyLabel(workflow) {
    return workflow.overlapPolicy === 'skip' ? 'Repeat Skip' : 'Repeat Queue';
  }

  function configExportUrl(configId) {
    return `/api/configs/${encodeURIComponent(configId)}/export`;
  }

  function getTemplate(templateId) {
    return (state.snapshot.workflowTemplates || []).find((template) => template.id === templateId) || null;
  }

  function getInitialTemplate() {
    return getTemplate('simple-key-repeat') || (state.snapshot.workflowTemplates || [])[0] || null;
  }

  function emitWithAck(eventName, payload, timeoutMs = 15000) {
    return new Promise((resolve) => {
      if (!state.connected) {
        resolve({ ok: false, error: 'Socket is disconnected.' });
        return;
      }

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        resolve({ ok: false, error: 'Request timed out.' });
      }, timeoutMs);

      socket.emit(eventName, payload, (response) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve(response || { ok: false, error: 'No response from server.' });
      });
    });
  }

  function openWorkflowModal(tabId, workflowId = null, templateId = null) {
    const workflow = workflowId ? getWorkflow(tabId, workflowId) : null;
    const template = templateId ? getTemplate(templateId) : getInitialTemplate();
    state.workflowModal = {
      open: true,
      tabId,
      mode: workflow ? 'edit' : 'create',
      draft: workflow ? hydrateWorkflowDraft(workflow) : hydrateWorkflowDraft(template ? template.workflow : null),
    };

    renderWorkflowModal();
  }

  function closeWorkflowModal() {
    state.workflowModal = {
      open: false,
      tabId: null,
      draft: null,
      mode: 'create',
    };
    renderWorkflowModal();
  }

  function openBrowserModal() {
    const draft = clone(currentBrowserConfig());
    draft.args = Array.isArray(draft.args) ? draft.args.join('\n') : '';
    state.browserModal = {
      open: true,
      draft,
    };
    renderBrowserModal();
    scanBrowsers();
  }

  function openConfigModal() {
    elements.configModal.classList.remove('hidden');
  }

  function closeConfigModal() {
    elements.configModal.classList.add('hidden');
  }

  function closeBrowserModal() {
    state.browserModal = {
      open: false,
      draft: null,
    };
    renderBrowserModal();
  }

  function countAllWorkflows() {
    return (state.snapshot.tabs || []).reduce((sum, tab) => sum + (tab.workflows || []).length, 0);
  }

  function countExecutingWorkflows() {
    return (state.snapshot.tabs || []).flatMap((tab) => tab.workflows || []).filter((workflow) => workflow.status === 'executing').length;
  }

  function countErroredWorkflows() {
    return (state.snapshot.tabs || []).flatMap((tab) => tab.workflows || []).filter((workflow) => workflow.status === 'error').length;
  }

  function updateSelectedConfigId() {
    const configs = state.snapshot.savedConfigs || [];
    if (state.selectedConfigId && configs.some((config) => config.id === state.selectedConfigId)) {
      return;
    }

    const current = configs.find((config) => config.name === state.snapshot.currentConfigName);
    state.selectedConfigId = current ? current.id : configs[0] ? configs[0].id : '';
  }

  let allTabsControlBusy = false;
  let powerSavingBusy = false;

  function renderPowerSaving() {
    const enabled = Boolean(currentBrowserConfig().powerSaving);
    const button = document.getElementById('powerSavingButton');
    button.disabled = powerSavingBusy || !state.connected;
    button.setAttribute('aria-pressed', String(enabled));
    setTextIfChanged(button, `Power Saving: ${enabled ? 'On' : 'Off'}`);
    const policy = state.snapshot.resourcePolicy;
    if (policy) setTextIfChanged(document.getElementById('hostResourceSummary'), `Auto CPU scheduling · ${policy.availableCpus} available CPU threads${enabled ? ' · logs off · roBrowser graphics where supported' : ''}`);
    if (enabled) state.logsVisible = false;
    elements.toggleLogsButton.disabled = enabled;
  }

  function renderConnectionState() {
    renderPowerSaving();
    document.querySelectorAll('[data-all-tabs-action]').forEach(button => {
      button.disabled = allTabsControlBusy || !state.connected || !state.snapshot.tabs.length;
    });
    elements.connectionText.textContent = state.connected ? 'Socket Connected' : 'Reconnecting';
    elements.connectionPill.className = state.connected
      ? 'inline-flex items-center justify-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200'
      : 'inline-flex items-center justify-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-100';
    elements.addTabButton.disabled = state.addingTab || !state.connected;
    elements.addTabButton.textContent = state.addingTab ? 'Opening Tab...' : 'Add New Tab';
  }

  function renderStats() {
    elements.statTabs.textContent = String((state.snapshot.tabs || []).length);
    elements.statWorkflows.textContent = String(countAllWorkflows());
    elements.statExecuting.textContent = String(countExecutingWorkflows());
    elements.statErrors.textContent = String(countErroredWorkflows());

    const summary = currentBrowserSummary();
    const currentBrowserDetails = [summary.executablePath || summary.profileLabel || 'Using current controller settings', summary.activationPolicyLabel, summary.hiddenExecutionLabel].filter(Boolean).join(' · ');
    const browserSessionDetails = [summary.profileLabel || 'No profile information', summary.activationPolicyLabel, summary.hiddenExecutionLabel].filter(Boolean).join(' · ');
    elements.browserSessionValue.textContent = summary.summary || 'No browser session';
    elements.browserSessionMeta.textContent = browserSessionDetails;
    elements.currentBrowserSummary.textContent = summary.typeLabel || 'Browser not configured';
    elements.currentBrowserMeta.textContent = currentBrowserDetails;
    elements.currentConfigLabel.textContent = state.snapshot.currentConfigName || 'Unsaved live session';
  }

  function renderSavedConfigControls() {
    updateSelectedConfigId();

    const configs = state.snapshot.savedConfigs || [];
    const signature = JSON.stringify([configs, state.selectedConfigId]);
    if (state.renderCache.configSignature === signature) return;
    state.renderCache.configSignature = signature;

    elements.savedConfigSelect.innerHTML = configs.length
      ? configs
          .map((config) => `<option value="${escapeHtml(config.id)}" ${config.id === state.selectedConfigId ? 'selected' : ''}>${escapeHtml(config.name)}</option>`)
          .join('')
      : '<option value="">No saved configs</option>';

    elements.savedConfigSelect.disabled = !configs.length;
    elements.loadConfigButton.disabled = !state.selectedConfigId;
    elements.deleteConfigButton.disabled = !state.selectedConfigId;
    elements.exportConfigButton.disabled = !state.selectedConfigId;
    elements.savedConfigMeta.textContent = configs.length
      ? `${configs.length} ${configs.length === 1 ? 'config' : 'configs'} ready`
      : 'No configs yet';
  }

  function normalizedTabsForRender(tabs) {
    return tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      url: tab.url,
      navigation: tab.navigation,
      executionMode: tab.executionMode,
      pausedAll: Boolean(tab.pausedAll),
      browserInfo: {
        summary: tab.browserInfo && tab.browserInfo.summary,
        profileLabel: tab.browserInfo && tab.browserInfo.profileLabel,
      },
      workflows: (tab.workflows || []).map((workflow) => ({
        id: workflow.id,
        sortOrder: workflow.sortOrder,
        name: workflow.name,
        status: workflow.status,
        pauseReason: workflow.pauseReason,
        intervalSeconds: workflow.intervalSeconds,
        description: workflow.description,
        tabActivationPolicy: workflow.tabActivationPolicy,
        overlapPolicy: workflow.overlapPolicy,
        queuedRuns: workflow.queuedRuns,
        stepCount: (workflow.steps || []).length,
      })),
    }));
  }

  function tabsRenderSignature(tabs) {
    return JSON.stringify(normalizedTabsForRender(tabs));
  }

  function captureTabScrollPositions() {
    return new Map(
      Array.from(elements.tabsGrid.querySelectorAll('[data-tab-card]'))
        .map((card) => [String(card.dataset.tabId), card.scrollTop])
    );
  }

  function restoreTabScrollPositions(scrollPositions) {
    elements.tabsGrid.querySelectorAll('[data-tab-card]').forEach((card) => {
      const savedScrollTop = scrollPositions.get(String(card.dataset.tabId));
      if (typeof savedScrollTop === 'number') {
        card.scrollTop = savedScrollTop;
      }
    });
  }

  function renderWorkflowRow(tab, workflow) {
    const badge = statusMeta(workflow);
    const toggleLabel = workflow.pauseReason || !workflow.enabled ? 'Resume' : 'Pause';
    const toggleClasses = workflow.pauseReason || !workflow.enabled
      ? 'border border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20'
      : 'border border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20';

    return `
      <div class="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-white/6 via-slate-900/70 to-black/25 p-4 shadow-[0_18px_50px_rgba(2,6,23,0.28)] transition hover:border-teal-300/20 hover:shadow-[0_24px_60px_rgba(17,24,39,0.42)]" data-workflow-row data-tab-id="${escapeHtml(tab.id)}" data-workflow-id="${escapeHtml(workflow.id)}">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.12),transparent_38%)] opacity-70"></div>
        <div class="relative flex flex-col gap-3">
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">#${escapeHtml(workflow.sortOrder || 1)}</span>
              <h3 class="truncate text-base font-semibold text-white">${escapeHtml(workflow.name)}</h3>
              <span class="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${badge.classes}" data-runtime-role="status">${escapeHtml(badge.label)}</span>
              <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">Every ${escapeHtml(workflow.intervalSeconds)}s</span>
              <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">${escapeHtml(workflowActivationLabel(workflow))}</span>
              <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">${escapeHtml(overlapPolicyLabel(workflow))}</span>
              ${workflow.queuedRuns > 0 ? `<span class="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100">Queued ${escapeHtml(workflow.queuedRuns)}</span>` : ''}
            </div>
            <div class="flex flex-wrap gap-3 text-xs text-slate-400">
              <span data-runtime-role="next">Next ${escapeHtml(formatCountdown(workflow.remainingSeconds))}</span>
              <span data-runtime-role="last">Last ${escapeHtml(formatClock(workflow.lastRunAt))}</span>
              <span data-runtime-role="runs">Runs ${escapeHtml(workflow.runCount)}</span>
              <span data-runtime-role="errors">Errors ${escapeHtml(workflow.errorCount)}</span>
            </div>
            <p class="text-xs text-slate-500">${workflow.description ? escapeHtml(workflow.description) : `${workflow.steps.length} steps configured`}</p>
          </div>
          <div class="flex flex-wrap gap-2" style="align-self: stretch;">
            <button type="button" data-action="run-workflow-once" data-tab-id="${escapeHtml(tab.id)}" data-workflow-id="${escapeHtml(workflow.id)}" class="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/20" style="flex: 1 1 6.5rem;">Run Once</button>
            <button type="button" data-action="toggle-workflow" data-tab-id="${escapeHtml(tab.id)}" data-workflow-id="${escapeHtml(workflow.id)}" class="rounded-2xl px-3 py-2 text-xs font-semibold transition ${toggleClasses}" style="flex: 1 1 6.5rem;">${toggleLabel}</button>
            <button type="button" data-action="edit-workflow" data-tab-id="${escapeHtml(tab.id)}" data-workflow-id="${escapeHtml(workflow.id)}" class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/10" style="flex: 1 1 6.5rem;">Edit</button>
            <button type="button" data-action="duplicate-workflow" data-tab-id="${escapeHtml(tab.id)}" data-workflow-id="${escapeHtml(workflow.id)}" class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/10" style="flex: 1 1 6.5rem;">Duplicate</button>
            <button type="button" data-action="remove-workflow" data-tab-id="${escapeHtml(tab.id)}" data-workflow-id="${escapeHtml(workflow.id)}" class="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-300/20" style="flex: 1 1 6.5rem;">Remove</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderTabCard(tab) {
    const tabBadgeClasses = tab.pausedAll
      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
      : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';

    return `
      <article class="terminal-scroll flex flex-col overflow-x-hidden overflow-y-auto rounded-[2rem] border border-white/10 bg-slate-900/75 p-5 shadow-[0_24px_60px_rgba(2,6,23,0.34)] backdrop-blur" data-tab-card data-tab-id="${escapeHtml(tab.id)}" style="height: 500px;">
        <div class="shrink-0 flex flex-col gap-4 border-b border-white/10 pb-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-2">
              ${tab.navigation && tab.navigation.state === 'loading' ? '<p class="text-sm text-cyan-200">Loading website…</p>' : ''}
              ${tab.navigation && tab.navigation.state === 'error' ? `<p role="status" class="text-sm text-rose-200">Website could not load: ${escapeHtml(tab.navigation.error)}</p>` : ''}
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-2xl font-semibold text-white">${escapeHtml(tab.label)}</h2>
                <span class="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${tabBadgeClasses}">${tab.pausedAll ? 'Tab Paused' : 'Tab Active'}</span>
              </div>
              <p class="break-all text-xs leading-6 text-slate-500">${escapeHtml(tab.url)}</p>
              <p class="text-[11px] uppercase tracking-[0.22em] text-slate-500">${tab.executionMode === 'sequence' ? 'Sequence: top to bottom, one countdown at a time' : 'Interval: independent countdowns, serial execution'}</p>
            </div>
            <div class="flex flex-wrap gap-2 lg:justify-end">
              <button type="button" data-action="add-workflow" data-tab-id="${escapeHtml(tab.id)}" class="rounded-2xl border border-teal-300/20 bg-teal-300/10 px-4 py-2 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/20">Add Workflow</button>
              <button type="button" data-action="toggle-mode" data-tab-id="${escapeHtml(tab.id)}" title="Switch between independent intervals and top-to-bottom sequence" class="rounded-2xl border border-teal-300/20 bg-teal-300/10 px-4 py-2 text-sm font-semibold text-teal-100">Mode: ${tab.executionMode === 'sequence' ? 'Sequence' : 'Interval'}</button>
              <button type="button" data-action="toggle-tab" data-tab-id="${escapeHtml(tab.id)}" class="rounded-2xl border px-4 py-2 text-sm font-semibold transition ${tab.pausedAll ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20' : 'border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20'}">${tab.pausedAll ? 'Resume All' : 'Pause All'}</button>
              <button type="button" data-action="reset-countdowns" data-tab-id="${escapeHtml(tab.id)}" class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10">Reset All Countdowns</button>
              <button type="button" data-action="clone-tab" data-tab-id="${escapeHtml(tab.id)}" class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10">Duplicate Tab</button>
              <button type="button" data-action="close-tab" data-tab-id="${escapeHtml(tab.id)}" class="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-300/20">Close Tab</button>
            </div>
          </div>
          <div class="grid gap-3 text-xs text-slate-400 md:grid-cols-3">
            <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p class="uppercase tracking-[0.22em] text-slate-500">Browser</p>
              <p class="mt-2 font-medium text-slate-100">${escapeHtml((tab.browserInfo && tab.browserInfo.summary) || 'No browser info')}</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p class="uppercase tracking-[0.22em] text-slate-500">Profile / Mode</p>
              <p class="mt-2 font-medium text-slate-100">${escapeHtml((tab.browserInfo && tab.browserInfo.profileLabel) || 'No profile info')}</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p class="uppercase tracking-[0.22em] text-slate-500">Execution Lane</p>
              <p class="mt-2 font-medium text-slate-100">Serial by workflow order</p>
            </div>
          </div>
        </div>

        <div class="pt-5">
          <div class="mb-4 flex items-center justify-between gap-4">
            <p class="text-sm font-medium text-slate-300">Workflows</p>
            <p class="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-slate-400">${tab.workflows.length} configured</p>
          </div>
          <div class="space-y-3">
            ${
              tab.workflows.length
                ? tab.workflows.map((workflow) => renderWorkflowRow(tab, workflow)).join('')
                : '<div class="rounded-3xl border border-dashed border-white/10 bg-black/10 px-4 py-8 text-center text-sm text-slate-500">No workflows yet. Add a workflow or use a template.</div>'
            }
          </div>
        </div>
      </article>
    `;
  }

  const tabCardSignatures = new Map();
  function renderTabs() {
    const tabs = state.snapshot.tabs || [];
    const entries = tabs.map(tab => ({ tab, signature: tabsRenderSignature([tab]) }));
    const nextSignature = entries.map(entry => entry.signature).join('|');
    elements.emptyState.classList.toggle('hidden', tabs.length > 0);
    if (state.renderCache.tabsSignature === nextSignature) return false;
    const scrollPositions = captureTabScrollPositions();
    state.renderCache.tabsSignature = nextSignature;
    const cards = new Map([...elements.tabsGrid.children].map(card => [card.dataset.tabId, card]));
    const present = new Set(tabs.map(tab => String(tab.id)));
    for (const [id, card] of cards) if (!present.has(id)) { card.remove(); tabCardSignatures.delete(id); }
    entries.forEach(({ tab, signature }, index) => {
      const id = String(tab.id);
      let card = cards.get(id);
      if (!card || tabCardSignatures.get(id) !== signature) {
        const template = document.createElement('template');
        template.innerHTML = renderTabCard(tab);
        const replacement = template.content.firstElementChild;
        if (card) card.replaceWith(replacement);
        card = replacement;
        tabCardSignatures.set(id, signature);
      }
      if (elements.tabsGrid.children[index] !== card) elements.tabsGrid.insertBefore(card, elements.tabsGrid.children[index] || null);
    });
    restoreTabScrollPositions(scrollPositions);
    return true;
  }

  function setTextIfChanged(node, value) { if (node.textContent !== value) node.textContent = value; }

  function syncTabRuntimeMetrics() {
    (state.snapshot.tabs || []).forEach((tab) => {
      (tab.workflows || []).forEach((workflow) => {
        const row = elements.tabsGrid.querySelector(`[data-workflow-row][data-tab-id="${CSS.escape(String(tab.id))}"][data-workflow-id="${CSS.escape(String(workflow.id))}"]`);
        if (!row) {
          return;
        }

        const nextNode = row.querySelector('[data-runtime-role="next"]');
        const lastNode = row.querySelector('[data-runtime-role="last"]');
        const runsNode = row.querySelector('[data-runtime-role="runs"]');
        const errorsNode = row.querySelector('[data-runtime-role="errors"]');

        if (nextNode) {
          setTextIfChanged(nextNode, `Next ${formatCountdown(workflow.remainingSeconds)}`);
        }
        if (lastNode) {
          setTextIfChanged(lastNode, `Last ${formatClock(workflow.lastRunAt)}`);
        }
        if (runsNode) {
          setTextIfChanged(runsNode, `Runs ${workflow.runCount}`);
        }
        if (errorsNode) {
          setTextIfChanged(errorsNode, `Errors ${workflow.errorCount}`);
        }
      });
    });
  }

  function filteredLogs() {
    return state.logs.filter((entry) => {
      if (state.logFilters.errorsOnly && entry.level !== 'error') {
        return false;
      }
      if (state.logFilters.tabId !== 'all' && String(entry.tabId) !== String(state.logFilters.tabId)) {
        return false;
      }
      if (state.logFilters.workflowId !== 'all' && String(entry.workflowId) !== String(state.logFilters.workflowId)) {
        return false;
      }
      return true;
    });
  }

  function renderLogFilterOptions() {
    const tabs = state.snapshot.tabs || [];
    const workflows = state.logFilters.tabId === 'all'
      ? tabs.flatMap((tab) => (tab.workflows || []).map((workflow) => ({ tabId: tab.id, workflow })))
      : (getTab(state.logFilters.tabId)?.workflows || []).map((workflow) => ({ tabId: state.logFilters.tabId, workflow }));

    if (state.logFilters.tabId !== 'all' && !tabs.some((tab) => String(tab.id) === String(state.logFilters.tabId))) {
      state.logFilters.tabId = 'all';
    }

    const workflowExists = workflows.some(({ workflow }) => String(workflow.id) === String(state.logFilters.workflowId));
    if (state.logFilters.workflowId !== 'all' && !workflowExists) {
      state.logFilters.workflowId = 'all';
    }

    elements.logFilterTab.innerHTML = ['<option value="all">All Tabs</option>']
      .concat(
        tabs.map((tab) => `<option value="${escapeHtml(tab.id)}" ${String(tab.id) === String(state.logFilters.tabId) ? 'selected' : ''}>${escapeHtml(tab.label)}</option>`)
      )
      .join('');

    elements.logFilterWorkflow.innerHTML = ['<option value="all">All Workflows</option>']
      .concat(
        workflows.map(({ workflow }) => `<option value="${escapeHtml(workflow.id)}" ${String(workflow.id) === String(state.logFilters.workflowId) ? 'selected' : ''}>${escapeHtml(workflow.name)}</option>`)
      )
      .join('');

    elements.logErrorsOnly.checked = state.logFilters.errorsOnly;
  }

  function renderLogs() {
    if (state.logsVisible && !document.hidden) renderLogFilterOptions();

    const visibleLogs = filteredLogs();
    elements.logCount.textContent = `${visibleLogs.length} visible / ${state.logs.length} total`;
    const powerSaving = Boolean(currentBrowserConfig().powerSaving);
    elements.toggleLogsButton.textContent = powerSaving ? 'Logs Off (Power Saving)' : state.logsVisible ? 'Hide Logs' : 'Show Logs';
    elements.logsBodyWrapper.classList.toggle('hidden', !state.logsVisible);
    elements.dashboardMain.style.paddingBottom = '6rem';
    if (powerSaving || !state.logsVisible || document.hidden) return;

    if (!visibleLogs.length) {
      elements.logConsole.innerHTML = '<p class="text-slate-500">No logs match the current filter.</p>';
      return;
    }

    elements.logConsole.innerHTML = visibleLogs
      .map((entry) => {
        const color =
          entry.level === 'error'
            ? 'text-rose-300'
            : entry.level === 'warn'
              ? 'text-amber-300'
              : 'text-slate-300';
        const context = [entry.tabLabel, entry.workflowName, entry.action].filter(Boolean).join(' / ');

        return `
          <div class="flex gap-3 ${color}">
            <span class="shrink-0 text-slate-500">[${escapeHtml(formatClock(entry.timestamp))}]</span>
            <div class="space-y-1">
              ${context ? `<div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">${escapeHtml(context)}</div>` : ''}
              <div class="break-words">${escapeHtml(entry.message)}</div>
            </div>
          </div>
        `;
      })
      .join('');

    if (state.logStickToBottom) {
      elements.logConsole.scrollTop = elements.logConsole.scrollHeight;
    }
  }

  function optionsMarkup(options, selectedValue) {
    return options
      .map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(selectedValue) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
      .join('');
  }

  function keyOptionsMarkup(selectedValue) {
    return supportedKeys()
      .map((key) => `<option value="${escapeHtml(key)}" ${String(key) === String(selectedValue) ? 'selected' : ''}>${escapeHtml(key)}</option>`)
      .join('');
  }

  function stepCommandMarkup(step) {
    if (step.command === 'keyboard') {
      return `
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label class="block">
            <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Key</span>
            <select data-step-id="${escapeHtml(step.id)}" data-field="key" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
              ${keyOptionsMarkup(step.key)}
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Hold (ms)</span>
            <input type="number" min="0" step="1" value="${escapeHtml(step.holdDurationMs)}" data-step-id="${escapeHtml(step.id)}" data-field="holdDurationMs" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
          </label>
        </div>
      `;
    }

    if (step.command === 'wait') {
      return `
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label class="block">
            <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Duration (ms)</span>
            <input type="number" min="0" step="1" value="${escapeHtml(step.durationMs)}" data-step-id="${escapeHtml(step.id)}" data-field="durationMs" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
          </label>
        </div>
      `;
    }

    if (step.command === 'focus') {
      return `
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label class="block">
            <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Target</span>
            <select data-step-id="${escapeHtml(step.id)}" data-field="target" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
              <option value="canvas" ${step.target !== 'page' ? 'selected' : ''}>Canvas</option>
              <option value="page" ${step.target === 'page' ? 'selected' : ''}>Page</option>
            </select>
          </label>
        </div>
      `;
    }

    if (step.command === 'bringToFront') {
      return '<p class="text-sm text-slate-400">No extra fields. This step only activates the target browser tab when tab activation is enabled in Browser Settings.</p>';
    }

    if (step.command === 'type') {
      return `
        <div class="space-y-3">
          <label class="block">
            <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Text to Type</span>
            <textarea rows="3" data-step-id="${escapeHtml(step.id)}" data-field="text" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white font-mono" placeholder="Hello, World!">${escapeHtml(step.text || '')}</textarea>
          </label>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label class="block">
              <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Keystroke Delay (ms)</span>
              <input type="number" min="0" step="1" value="${escapeHtml(step.typingDelayMs || 0)}" data-step-id="${escapeHtml(step.id)}" data-field="typingDelayMs" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
            </label>
            <label class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              <input type="checkbox" ${step.clearFirst ? 'checked' : ''} data-step-id="${escapeHtml(step.id)}" data-field="clearFirst" class="h-4 w-4 rounded border-white/20 bg-slate-900 text-teal-300" />
              Clear field first (Ctrl+A, Delete)
            </label>
          </div>
        </div>
      `;
    }

    if (step.command === 'scroll') {
      return `
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label class="block">
            <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Scroll Down (+) / Up (−) &middot; px</span>
            <input type="number" step="1" value="${escapeHtml(step.deltaY !== undefined ? step.deltaY : 120)}" data-step-id="${escapeHtml(step.id)}" data-field="deltaY" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
          </label>
          <label class="block">
            <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Scroll Right (+) / Left (−) &middot; px</span>
            <input type="number" step="1" value="${escapeHtml(step.deltaX || 0)}" data-step-id="${escapeHtml(step.id)}" data-field="deltaX" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
          </label>
        </div>
      `;
    }

    if (step.command === 'navigate') {
      return `
        <div class="grid gap-3 md:grid-cols-2">
          <label class="block">
            <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">URL</span>
            <input type="url" value="${escapeHtml(step.url || '')}" data-step-id="${escapeHtml(step.id)}" data-field="url" placeholder="https://example.com" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
          </label>
        </div>
      `;
    }

    const usesTabDefault = step.position && step.position.useTabDefault;
    const position = usesTabDefault ? { useTabDefault: true } : Object.assign(createDefaultPosition(), step.position || {});
    const extraField = step.command === 'click'
      ? `
        <label class="block">
          <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Button</span>
          <select data-step-id="${escapeHtml(step.id)}" data-field="button" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
            <option value="left" ${step.button !== 'right' ? 'selected' : ''}>Left</option>
            <option value="right" ${step.button === 'right' ? 'selected' : ''}>Right</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Click Count</span>
          <input type="number" min="1" step="1" value="${escapeHtml(step.clickCount || 1)}" data-step-id="${escapeHtml(step.id)}" data-field="clickCount" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
        </label>
      `
      : step.command === 'hover'
      ? ''
      : `
        <label class="block">
          <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Duration (ms)</span>
          <input type="number" min="0" step="1" value="${escapeHtml(step.durationMs || 0)}" data-step-id="${escapeHtml(step.id)}" data-field="durationMs" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
        </label>
      `;

    return `
      <div class="space-y-4">
        <label class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          <input type="checkbox" ${usesTabDefault ? 'checked' : ''} data-step-id="${escapeHtml(step.id)}" data-field="position.useTabDefault" class="h-4 w-4 rounded border-white/20 bg-slate-900 text-teal-300" />
          Use the tab default target position
        </label>

        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          ${extraField}
          <label class="block ${usesTabDefault ? 'opacity-50' : ''}">
            <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Coordinate System</span>
            <select ${usesTabDefault ? 'disabled' : ''} data-step-id="${escapeHtml(step.id)}" data-field="position.coordinateSystem" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
              <option value="canvas" ${position.coordinateSystem !== 'viewport' && position.coordinateSystem !== 'screen' ? 'selected' : ''}>Canvas</option>
              <option value="viewport" ${position.coordinateSystem === 'viewport' ? 'selected' : ''}>Viewport</option>
              <option value="screen" ${position.coordinateSystem === 'screen' ? 'selected' : ''}>Screen</option>
            </select>
          </label>
          <label class="block ${usesTabDefault ? 'opacity-50' : ''}">
            <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Mode</span>
            <select ${usesTabDefault ? 'disabled' : ''} data-step-id="${escapeHtml(step.id)}" data-field="position.mode" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
              <option value="preset" ${position.mode !== 'custom' ? 'selected' : ''}>Preset</option>
              <option value="custom" ${position.mode === 'custom' ? 'selected' : ''}>Custom XY</option>
            </select>
          </label>
        </div>

        ${
          usesTabDefault
            ? '<p class="text-sm text-slate-500">This step will use the tab default target position stored in the configuration.</p>'
            : position.mode === 'custom'
              ? `
                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label class="block">
                    <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">X</span>
                    <input type="number" step="1" value="${escapeHtml(position.x || 0)}" data-step-id="${escapeHtml(step.id)}" data-field="position.x" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Y</span>
                    <input type="number" step="1" value="${escapeHtml(position.y || 0)}" data-step-id="${escapeHtml(step.id)}" data-field="position.y" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                  </label>
                </div>
              `
              : `
                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label class="block">
                    <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Preset</span>
                    <select data-step-id="${escapeHtml(step.id)}" data-field="position.preset" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                      ${POSITION_PRESET_OPTIONS.map((preset) => `<option value="${escapeHtml(preset)}" ${position.preset === preset ? 'selected' : ''}>${escapeHtml(preset)}</option>`).join('')}
                    </select>
                  </label>
                </div>
              `
        }
      </div>
    `;
  }

  function renderWorkflowSteps() {
    const draft = state.workflowModal.draft;
    if (!draft) {
      elements.workflowSteps.innerHTML = '';
      return;
    }

    elements.workflowSteps.innerHTML = draft.steps
      .map((step, index) => `
        <section class="rounded-3xl border border-white/10 bg-slate-950/55 p-4">
          <div class="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-1">
              <p class="text-xs uppercase tracking-[0.28em] text-slate-500">Step ${index + 1}</p>
              <div class="flex flex-wrap items-center gap-2">
                <select data-step-id="${escapeHtml(step.id)}" data-field="command" class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                  ${optionsMarkup(STEP_COMMAND_OPTIONS, step.command)}
                </select>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" data-action="move-step-up" data-step-id="${escapeHtml(step.id)}" class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10">Move Up</button>
              <button type="button" data-action="move-step-down" data-step-id="${escapeHtml(step.id)}" class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10">Move Down</button>
              <button type="button" data-action="duplicate-step" data-step-id="${escapeHtml(step.id)}" class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10">Duplicate</button>
              <button type="button" data-action="delete-step" data-step-id="${escapeHtml(step.id)}" class="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-300/20">Delete</button>
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label class="block">
              <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Delay Before (ms)</span>
              <input type="number" min="0" step="1" value="${escapeHtml(step.delayBeforeMs || 0)}" data-step-id="${escapeHtml(step.id)}" data-field="delayBeforeMs" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
            </label>
            <label class="block">
              <span class="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Delay After (ms)</span>
              <input type="number" min="0" step="1" value="${escapeHtml(step.delayAfterMs || 0)}" data-step-id="${escapeHtml(step.id)}" data-field="delayAfterMs" class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
            </label>
          </div>
          <div class="mt-4">${stepCommandMarkup(step)}</div>
        </section>
      `)
      .join('');
  }

  function renderWorkflowModal() {
    const modalState = state.workflowModal;
    elements.workflowModal.classList.toggle('hidden', !modalState.open);

    if (!modalState.open || !modalState.draft) {
      return;
    }

    const tab = getTab(modalState.tabId);
    const templateOptions = (state.snapshot.workflowTemplates || []).map((template) => ({ value: template.id, label: template.name }));
    const draft = modalState.draft;

    elements.workflowModalEyebrow.textContent = modalState.mode === 'edit' ? 'Edit Workflow' : 'Create Workflow';
    elements.workflowModalTitle.textContent = draft.name || (modalState.mode === 'edit' ? 'Workflow Editor' : 'New Workflow');
    elements.workflowModalSubtitle.textContent = tab ? `${tab.label} · compact summary on the card, full sequence in this modal, and serial execution in tab order` : 'Workflow editor';
    elements.workflowEnabledInput.checked = draft.enabled;
    elements.workflowNameInput.value = draft.name;
    elements.workflowIntervalInput.value = draft.intervalSeconds;
    elements.workflowStartDelayInput.value = draft.startDelaySeconds;
    elements.workflowOverlapPolicySelect.innerHTML = optionsMarkup(OVERLAP_POLICY_OPTIONS, draft.overlapPolicy === 'skip' ? 'skip' : 'queue');
    elements.workflowActivationPolicySelect.innerHTML = optionsMarkup(WORKFLOW_ACTIVATION_POLICY_OPTIONS, draft.tabActivationPolicy || 'background');
    elements.workflowDescriptionInput.value = draft.description || '';
    elements.workflowNotesInput.value = draft.notes || '';
    elements.workflowTemplateSelect.innerHTML = optionsMarkup(templateOptions, templateOptions[0] ? templateOptions[0].value : '');
    elements.newStepTypeSelect.innerHTML = optionsMarkup(STEP_COMMAND_OPTIONS, elements.newStepTypeSelect.value || 'keyboard');
    elements.duplicateWorkflowButton.classList.toggle('hidden', !draft.id);

    renderWorkflowSteps();
  }

  function renderBrowserPicker() {
    const draft = state.browserModal.draft;
    if (!draft) return;
    const match = state.browserCatalog.find(browser => browser.type === draft.type &&
      (!draft.executablePath || browser.executablePath === draft.executablePath));
    const options = state.browserCatalog.map(browser => ({ value: browser.type, label: browser.name }));
    const selected = match ? match.type : (draft.executablePath || draft.type === 'custom' ? 'custom' : '');
    if (!selected) options.unshift({ value: '', label: 'Choose an installed browser…' });
    options.push({ value: 'custom', label: 'Custom browser… (advanced)' });
    elements.browserTypeSelect.innerHTML = optionsMarkup(options, selected);
    elements.scanBrowsersButton.disabled = state.scanningBrowsers || state.applyingBrowser;
    elements.scanBrowsersButton.textContent = state.scanningBrowsers ? 'Scanning…' : 'Scan again';
    elements.browserScanStatus.textContent = state.browserScanMessage;
    elements.saveBrowserButton.disabled = state.scanningBrowsers;
    elements.browserExecutablePathInput.readOnly = selected !== 'custom';
  }

  async function scanBrowsers() {
    if (state.scanningBrowsers || state.applyingBrowser) return;
    const modal = state.browserModal;
    state.scanningBrowsers = true;
    state.browserScanMessage = 'Looking for installed browsers…';
    renderBrowserPicker();
    try {
      const response = await fetch('/api/browsers', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Browser scan failed.');
      const catalog = await response.json();
      state.browserCatalog = catalog.browsers;
      state.browserScanMessage = catalog.browsers.length
        ? `Found ${catalog.browsers.length} installed browser${catalog.browsers.length === 1 ? '' : 's'}. Select one and apply — no path needed.`
        : 'No supported browsers found. Install Chrome, Edge, Brave, Chromium or Opera, then scan again. For a portable install, use Custom browser.';
    } catch (_) {
      state.browserScanMessage = 'Could not scan browsers. Try Scan again, or use Custom browser in Advanced settings.';
    } finally {
      state.scanningBrowsers = false;
      if (state.browserModal === modal) renderBrowserPicker();
    }
  }

  function renderBrowserModal() {
    const modalState = state.browserModal;
    elements.browserModal.classList.toggle('hidden', !modalState.open);

    if (!modalState.open || !modalState.draft) {
      return;
    }

    renderBrowserPicker();
    elements.browserAdvancedSettings.open = modalState.draft.type === 'custom';
    elements.browserLaunchModeSelect.innerHTML = optionsMarkup(LAUNCH_MODE_OPTIONS, modalState.draft.launchMode || 'launch');
    elements.browserExecutablePathInput.value = modalState.draft.executablePath || '';
    elements.browserUserDataDirInput.value = modalState.draft.userDataDir || '';
    elements.browserCdpUrlInput.value = modalState.draft.cdpUrl || 'http://127.0.0.1:9222';
    elements.browserArgsTextarea.value = modalState.draft.args || '';
    elements.browserHeadlessInput.checked = Boolean(modalState.draft.headless);
    elements.browserActivateTabInput.checked = Boolean(modalState.draft.activateTabOnInteraction);
    elements.browserOptimizeForHiddenExecutionInput.checked = modalState.draft.optimizeForHiddenExecution !== false;
  }

  function renderDashboard() {
    renderConnectionState();
    renderStats();
    renderSavedConfigControls();
    renderTabs();
    renderLogs();
  }

  let logRenderTimer = null;
  function scheduleLogRender() {
    if (document.hidden || logRenderTimer) return;
    logRenderTimer = setTimeout(() => { logRenderTimer = null; renderLogs(); }, 100);
  }

  function appendLogs(entries) {
    state.logs.push(...entries);
    if (state.logs.length > 500) state.logs.splice(0, state.logs.length - 500);
    scheduleLogRender();
  }

  function replaceLogs(entries) {
    state.logs = Array.isArray(entries) ? entries.slice(-500) : [];
    renderLogs();
  }

  function serializeStepForServer(step) {
    const base = {
      id: step.id,
      command: step.command,
      delayBeforeMs: Math.max(0, toNumber(step.delayBeforeMs, 0)),
      delayAfterMs: Math.max(0, toNumber(step.delayAfterMs, 0)),
    };

    switch (step.command) {
      case 'keyboard':
        return {
          ...base,
          key: step.key,
          holdDurationMs: Math.max(0, toNumber(step.holdDurationMs, 0)),
        };
      case 'click':
        return {
          ...base,
          button: step.button || 'left',
          clickCount: Math.max(1, toNumber(step.clickCount, 1)),
          position: step.position && step.position.useTabDefault ? { useTabDefault: true } : {
            coordinateSystem: step.position.coordinateSystem,
            mode: step.position.mode,
            preset: step.position.preset,
            x: step.position.mode === 'custom' ? toNumber(step.position.x, 0) : undefined,
            y: step.position.mode === 'custom' ? toNumber(step.position.y, 0) : undefined,
          },
        };
      case 'wait':
        return {
          ...base,
          durationMs: Math.max(0, toNumber(step.durationMs, 0)),
        };
      case 'move':
        return {
          ...base,
          durationMs: Math.max(0, toNumber(step.durationMs, 0)),
          position: step.position && step.position.useTabDefault ? { useTabDefault: true } : {
            coordinateSystem: step.position.coordinateSystem,
            mode: step.position.mode,
            preset: step.position.preset,
            x: step.position.mode === 'custom' ? toNumber(step.position.x, 0) : undefined,
            y: step.position.mode === 'custom' ? toNumber(step.position.y, 0) : undefined,
          },
        };
      case 'type':
        return {
          ...base,
          text: step.text || '',
          clearFirst: Boolean(step.clearFirst),
          typingDelayMs: Math.max(0, toNumber(step.typingDelayMs, 0)),
        };
      case 'scroll':
        return {
          ...base,
          deltaX: toNumber(step.deltaX, 0),
          deltaY: toNumber(step.deltaY, 120),
        };
      case 'navigate':
        return {
          ...base,
          url: step.url || '',
        };
      case 'hover':
        return {
          ...base,
          position: step.position && step.position.useTabDefault ? { useTabDefault: true } : {
            coordinateSystem: step.position.coordinateSystem,
            mode: step.position.mode,
            preset: step.position.preset,
            x: step.position.mode === 'custom' ? toNumber(step.position.x, 0) : undefined,
            y: step.position.mode === 'custom' ? toNumber(step.position.y, 0) : undefined,
          },
        };
      case 'focus':
        return {
          ...base,
          target: step.target || 'canvas',
        };
      default:
        return base;
    }
  }

  function workflowValidationMessage(draft) {
    if (!draft.name || !draft.name.trim()) {
      return 'Workflow name is required.';
    }

    if (!(toNumber(draft.intervalSeconds, 0) > 0)) {
      return 'Interval must be greater than 0.';
    }

    if (!Array.isArray(draft.steps) || !draft.steps.length) {
      return 'Add at least one workflow step.';
    }

    for (const step of draft.steps) {
      if (step.command === 'keyboard' && !step.key) {
        return 'Keyboard steps require a key.';
      }
      if (step.command === 'wait' && toNumber(step.durationMs, -1) < 0) {
        return 'Wait duration must be greater than or equal to 0.';
      }
      if (step.command === 'navigate' && !step.url) {
        return 'Navigate steps require a URL.';
      }
      if (step.command === 'type' && !step.text) {
        return 'Type Text steps require non-empty text.';
      }
      if (step.command === 'hover' && !(step.position && step.position.useTabDefault)) {
        if (!step.position || !step.position.coordinateSystem || !step.position.mode) {
          return 'Hover steps require a valid position.';
        }
        if (step.position.mode === 'custom' && (!Number.isFinite(toNumber(step.position.x, Number.NaN)) || !Number.isFinite(toNumber(step.position.y, Number.NaN)))) {
          return 'Custom XY requires numeric x and y values.';
        }
      }
    }

    return '';
  }

  function serializeWorkflowDraft() {
    return {
      id: state.workflowModal.draft.id || undefined,
      name: state.workflowModal.draft.name.trim(),
      enabled: Boolean(state.workflowModal.draft.enabled),
      intervalSeconds: Math.max(1, toNumber(state.workflowModal.draft.intervalSeconds, 30)),
      startDelaySeconds: Math.max(0, toNumber(state.workflowModal.draft.startDelaySeconds, 0)),
      description: state.workflowModal.draft.description || '',
      notes: state.workflowModal.draft.notes || '',
      overlapPolicy: state.workflowModal.draft.overlapPolicy === 'skip' ? 'skip' : 'queue',
      tabActivationPolicy: state.workflowModal.draft.tabActivationPolicy || 'background',
      steps: state.workflowModal.draft.steps.map((step) => serializeStepForServer(step)),
    };
  }

  async function saveWorkflowFromModal(options = {}) {
    const validationMessage = workflowValidationMessage(state.workflowModal.draft);
    if (validationMessage) {
      flash(validationMessage);
      return null;
    }

    const response = await emitWithAck('workflow:save', {
      tabId: state.workflowModal.tabId,
      workflow: serializeWorkflowDraft(),
    });

    if (!response.ok) {
      flash(response.error || 'Failed to save workflow.');
      return null;
    }

    state.workflowModal.draft.id = response.result.id;
    state.workflowModal.mode = 'edit';
    renderWorkflowModal();

    if (options.closeOnSuccess) {
      closeWorkflowModal();
    }

    flash('Workflow saved.', 'success');
    return response.result;
  }

  function setNestedValue(target, path, value) {
    const keys = path.split('.');
    let pointer = target;
    for (let index = 0; index < keys.length - 1; index += 1) {
      const key = keys[index];
      if (!pointer[key] || typeof pointer[key] !== 'object') {
        pointer[key] = {};
      }
      pointer = pointer[key];
    }
    pointer[keys[keys.length - 1]] = value;
  }

  function castInputValue(target) {
    if (target.type === 'checkbox') {
      return target.checked;
    }
    if (target.type === 'number') {
      return target.value === '' ? 0 : Number(target.value);
    }
    return target.value;
  }

  function findDraftStep(stepId) {
    return state.workflowModal.draft.steps.find((step) => String(step.id) === String(stepId)) || null;
  }

  let cloneSourceTabId = null;

  function openAddTabModal(source = null) {
    if (state.addingTab) return;
    cloneSourceTabId = source ? Number(source.id) : null;
    document.getElementById('addTabModalTitle').textContent = source ? `Duplicate ${source.name || source.label}` : 'Open a URL in a new tab';
    document.getElementById('cloneTabNotice').classList.toggle('hidden', !source);
    elements.confirmAddTabButton.textContent = source ? 'Duplicate Tab' : 'Create Tab';
    elements.addTabUrlInput.value = source ? source.url : '';
    const hidden = Boolean(currentBrowserConfig().headless);
    elements.addTabVisibilityNotice.textContent = hidden
      ? 'Headless mode is on. New tabs run in the background and no browser window will open.'
      : 'New tabs open in the separate browser controlled by Web Macro.';
    elements.showBrowserWindowButton.classList.toggle('hidden', !hidden);
    elements.addTabModal.classList.remove('hidden');
    elements.addTabUrlInput.focus();
  }

  document.querySelectorAll('[data-all-tabs-action]').forEach(button => {
    button.addEventListener('click', async () => {
      if (allTabsControlBusy || !state.connected) return;
      allTabsControlBusy = true;
      renderConnectionState();
      try {
        const action = button.dataset.allTabsAction;
        const response = await emitWithAck('tabs:control', { action });
        if (!response.ok) { flash(response.error || 'All-tabs control failed.'); return; }
        const messages = { pause: 'Paused all workflows in all tabs.', resume: 'Resumed all workflows in all tabs.', reset: 'Reset countdowns in all tabs; paused workflows remain paused.' };
        flash(messages[action], 'success');
      } finally {
        allTabsControlBusy = false;
        renderConnectionState();
      }
    });
  });

  document.getElementById('powerSavingButton').addEventListener('click', async () => {
    if (powerSavingBusy || !state.connected) return;
    powerSavingBusy = true;
    renderPowerSaving();
    try {
      const enabled = !currentBrowserConfig().powerSaving;
      const response = await emitWithAck('runtime:power-saving', { enabled });
      if (!response.ok) { flash(response.error || 'Power Saving failed.'); return; }
      state.snapshot.browserConfig.powerSaving = response.result.enabled;
      renderPowerSaving();
      renderLogs();
      flash(enabled ? 'Power Saving on. Logs cleared and disabled; macro timing stays unchanged.' : 'Power Saving off. Graphics and logs restored.', 'success');
    } finally { powerSavingBusy = false; renderPowerSaving(); }
  });

  elements.addTabButton.addEventListener('click', () => openAddTabModal());

  elements.showBrowserWindowButton.addEventListener('click', () => {
    elements.addTabModal.classList.add('hidden');
    openBrowserModal();
    elements.browserHeadlessInput.checked = false;
    state.browserModal.draft.headless = false;
  });

  elements.cancelAddTabButton.addEventListener('click', () => {
    elements.addTabModal.classList.add('hidden');
  });

  elements.confirmAddTabButton.addEventListener('click', async () => {
    if (state.addingTab || !state.connected) return;
    const url = elements.addTabUrlInput.value.trim();
    state.addingTab = true;
    elements.confirmAddTabButton.disabled = true;
    elements.confirmAddTabButton.textContent = 'Creating…';
    renderConnectionState();

    const cloning = cloneSourceTabId !== null;
    const response = await emitWithAck(cloning ? 'tab:clone' : 'tab:create', { url: url || '', ...(cloning ? { tabId: cloneSourceTabId } : {}) }, 60000);
    state.addingTab = false;
    elements.confirmAddTabButton.disabled = false;
    elements.confirmAddTabButton.textContent = cloning ? 'Duplicate Tab' : 'Create Tab';
    renderConnectionState();

    if (!response.ok) {
      flash(response.error || 'Failed to create a new tab.');
      return;
    }

    elements.addTabModal.classList.add('hidden');
    if (cloning) { flash('Tab cloned with all workflows. Resume the new tab when ready.', 'success'); return; }
    flash(currentBrowserConfig().headless ? 'Tab created in the background (headless mode).' : 'Tab created in the browser window. The website may still be loading.', 'success');
  });

  elements.addTabModal.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      elements.confirmAddTabButton.click();
    } else if (event.key === 'Escape') {
      elements.cancelAddTabButton.click();
    }
  });

  elements.toggleLogsButton.addEventListener('click', () => {
    state.logsVisible = !state.logsVisible;
    if (state.logsVisible) {
      state.logStickToBottom = true;
    }
    renderLogs();
  });

  elements.logConsole.addEventListener('scroll', () => {
    const distanceFromBottom = elements.logConsole.scrollHeight - elements.logConsole.clientHeight - elements.logConsole.scrollTop;
    state.logStickToBottom = distanceFromBottom < 20;
  });

  elements.openConfigModalButton.addEventListener('click', () => {
    openConfigModal();
  });

  elements.closeConfigModalButton.addEventListener('click', () => {
    closeConfigModal();
  });

  elements.configModal.addEventListener('click', (event) => {
    if (event.target === elements.configModal) {
      closeConfigModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.configModal.classList.contains('hidden')) {
      closeConfigModal();
    }
  });

  elements.openBrowserSettingsButton.addEventListener('click', () => {
    openBrowserModal();
  });

  elements.savedConfigSelect.addEventListener('change', (event) => {
    state.selectedConfigId = event.target.value;
    renderSavedConfigControls();
  });

  elements.saveConfigButton.addEventListener('click', async () => {
    const name = (elements.configNameInput.value || state.snapshot.currentConfigName || 'web-macro config').trim();

    if (!name) {
      flash('Config name is required.');
      return;
    }

    const response = await emitWithAck('config:save', { name });
    if (!response.ok) {
      flash(response.error || 'Failed to save config.');
      return;
    }

    state.selectedConfigId = response.result.id;
    elements.configNameInput.value = response.result.name;
    flash(`Saved config ${response.result.name}.`, 'success');
  });

  elements.exportConfigButton.addEventListener('click', async () => {
    if (!state.selectedConfigId) {
      flash('Select a saved config first.');
      return;
    }

    try {
      const response = await fetch(configExportUrl(state.selectedConfigId));
      if (!response.ok) {
        const payload = await parseJsonResponse(response);
        throw new Error(payload.error || 'Failed to export config.');
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${state.selectedConfigId}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      flash('Config exported as JSON.', 'success');
    } catch (error) {
      flash(error.message || 'Failed to export config.');
    }
  });

  elements.importConfigButton.addEventListener('click', () => {
    elements.importConfigInput.click();
  });

  elements.importConfigInput.addEventListener('change', async (event) => {
    const [file] = Array.from(event.target.files || []);
    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      const documentPayload = JSON.parse(rawText);
      const response = await fetch('/api/configs/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(documentPayload),
      });
      const payload = await parseJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to import config.');
      }

      state.selectedConfigId = payload.result.id;
      elements.configNameInput.value = payload.result.name;
      flash(`Imported config ${payload.result.name}.`, 'success');
    } catch (error) {
      flash(error.message || 'Failed to import config.');
    } finally {
      event.target.value = '';
    }
  });

  elements.loadConfigButton.addEventListener('click', async () => {
    if (!state.selectedConfigId) {
      flash('Select a saved config first.');
      return;
    }

    const response = await emitWithAck('config:load', {
      configId: state.selectedConfigId,
      resumeWorkflows: elements.configResumeToggle.checked,
    });

    if (!response.ok) {
      flash(response.error || 'Failed to load config.');
      return;
    }

    flash(`Loaded config ${response.result.name}.`, 'success');
  });

  elements.deleteConfigButton.addEventListener('click', async () => {
    if (!state.selectedConfigId) {
      flash('Select a saved config first.');
      return;
    }

    if (!window.confirm('Delete the selected config?')) {
      return;
    }

    const response = await emitWithAck('config:delete', {
      configId: state.selectedConfigId,
    });

    if (!response.ok) {
      flash(response.error || 'Failed to delete config.');
      return;
    }

    state.selectedConfigId = '';
    flash('Config deleted.', 'success');
  });

  elements.clearLogsButton.addEventListener('click', async () => {
    const response = await emitWithAck('logs:clear', {});
    if (!response.ok) {
      flash(response.error || 'Failed to clear logs.');
      return;
    }

    state.logs = [];
    renderLogs();
  });

  elements.logFilterTab.addEventListener('change', (event) => {
    state.logFilters.tabId = event.target.value;
    state.logFilters.workflowId = 'all';
    renderLogs();
  });

  elements.logFilterWorkflow.addEventListener('change', (event) => {
    state.logFilters.workflowId = event.target.value;
    renderLogs();
  });

  elements.logErrorsOnly.addEventListener('change', (event) => {
    state.logFilters.errorsOnly = event.target.checked;
    renderLogs();
  });

  elements.tabsGrid.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const tabId = button.dataset.tabId;
    const workflowId = button.dataset.workflowId;

    if (action === 'add-workflow') {
      openWorkflowModal(tabId);
      return;
    }

    if (action === 'edit-workflow') {
      openWorkflowModal(tabId, workflowId);
      return;
    }

    if (action === 'toggle-mode') {
      const tab = getTab(tabId);
      const response = await emitWithAck('tab:execution-mode', { tabId: Number(tabId), mode: tab.executionMode === 'sequence' ? 'interval' : 'sequence' });
      if (!response.ok) flash(response.error);
      return;
    }

    if (action === 'reset-countdowns') {
      const response = await emitWithAck('tab:reset-countdowns', { tabId: Number(tabId) });
      flash(response.ok ? 'All countdowns reset to their full intervals.' : response.error, response.ok ? 'success' : 'error');
      return;
    }

    if (action === 'toggle-tab') {
      const response = await emitWithAck('tab:toggle-pause-all', { tabId: Number(tabId) });
      if (!response.ok) {
        flash(response.error || 'Failed to toggle the tab.');
      }
      return;
    }

    if (action === 'toggle-workflow') {
      const response = await emitWithAck('workflow:toggle', {
        tabId: Number(tabId),
        workflowId,
      });
      if (!response.ok) {
        flash(response.error || 'Failed to toggle workflow.');
      }
      return;
    }

    if (action === 'run-workflow-once') {
      const response = await emitWithAck('workflow:run-once', {
        tabId: Number(tabId),
        workflowId,
      });
      if (!response.ok) {
        flash(response.error || 'Failed to run workflow once.');
        return;
      }
      flash('Workflow run triggered.', 'success');
      return;
    }

    if (action === 'duplicate-workflow') {
      const response = await emitWithAck('workflow:duplicate', {
        tabId: Number(tabId),
        workflowId,
      });
      if (!response.ok) {
        flash(response.error || 'Failed to duplicate workflow.');
        return;
      }
      flash('Workflow duplicated.', 'success');
      return;
    }

    if (action === 'remove-workflow') {
      if (!window.confirm('Remove this workflow?')) {
        return;
      }
      const response = await emitWithAck('workflow:remove', {
        tabId: Number(tabId),
        workflowId,
      });
      if (!response.ok) {
        flash(response.error || 'Failed to remove workflow.');
        return;
      }
      flash('Workflow removed.', 'success');
    }

    if (action === 'clone-tab') {
      const source = getTab(tabId);
      if (source) openAddTabModal(source);
      return;
    }

    if (action === 'close-tab') {
      if (!window.confirm('Close this tab and remove all its workflows?')) {
        return;
      }
      const response = await emitWithAck('tab:close', { tabId: Number(tabId) });
      if (!response.ok) {
        flash(response.error || 'Failed to close tab.');
        return;
      }
      flash('Tab closed.', 'success');
    }
  });

  elements.closeWorkflowModalButton.addEventListener('click', () => {
    closeWorkflowModal();
  });

  elements.cancelWorkflowButton.addEventListener('click', () => {
    closeWorkflowModal();
  });

  elements.workflowEnabledInput.addEventListener('change', (event) => {
    if (state.workflowModal.draft) {
      state.workflowModal.draft.enabled = event.target.checked;
    }
  });

  elements.workflowNameInput.addEventListener('input', (event) => {
    if (state.workflowModal.draft) {
      state.workflowModal.draft.name = event.target.value;
      elements.workflowModalTitle.textContent = event.target.value || 'Workflow Editor';
    }
  });

  elements.workflowIntervalInput.addEventListener('input', (event) => {
    if (state.workflowModal.draft) {
      state.workflowModal.draft.intervalSeconds = toNumber(event.target.value, 0);
    }
  });

  elements.workflowStartDelayInput.addEventListener('input', (event) => {
    if (state.workflowModal.draft) {
      state.workflowModal.draft.startDelaySeconds = toNumber(event.target.value, 0);
    }
  });

  elements.workflowOverlapPolicySelect.addEventListener('change', (event) => {
    if (state.workflowModal.draft) {
      state.workflowModal.draft.overlapPolicy = event.target.value;
    }
  });

  elements.workflowActivationPolicySelect.addEventListener('change', (event) => {
    if (state.workflowModal.draft) {
      state.workflowModal.draft.tabActivationPolicy = event.target.value;
    }
  });

  elements.workflowDescriptionInput.addEventListener('input', (event) => {
    if (state.workflowModal.draft) {
      state.workflowModal.draft.description = event.target.value;
    }
  });

  elements.workflowNotesInput.addEventListener('input', (event) => {
    if (state.workflowModal.draft) {
      state.workflowModal.draft.notes = event.target.value;
    }
  });

  elements.applyWorkflowTemplateButton.addEventListener('click', () => {
    if (!state.workflowModal.draft) {
      return;
    }

    const template = getTemplate(elements.workflowTemplateSelect.value);
    if (!template) {
      return;
    }

    const existingId = state.workflowModal.draft.id;
    const existingName = state.workflowModal.draft.name;
    const nextDraft = hydrateWorkflowDraft(template.workflow);
    if (existingId) {
      nextDraft.id = existingId;
      nextDraft.name = existingName || nextDraft.name;
    }
    state.workflowModal.draft = nextDraft;
    renderWorkflowModal();
  });

  elements.addWorkflowStepButton.addEventListener('click', () => {
    if (!state.workflowModal.draft) {
      return;
    }

    state.workflowModal.draft.steps.push(createDefaultStep(elements.newStepTypeSelect.value || 'keyboard'));
    renderWorkflowSteps();
  });

  elements.workflowSteps.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || !state.workflowModal.draft) {
      return;
    }

    const stepId = button.dataset.stepId;
    const steps = state.workflowModal.draft.steps;
    const index = steps.findIndex((step) => String(step.id) === String(stepId));
    if (index === -1) {
      return;
    }

    if (button.dataset.action === 'delete-step') {
      steps.splice(index, 1);
      if (!steps.length) {
        steps.push(createDefaultStep('keyboard'));
      }
      renderWorkflowSteps();
      return;
    }

    if (button.dataset.action === 'duplicate-step') {
      const duplicate = hydrateStep(steps[index]);
      steps.splice(index + 1, 0, duplicate);
      renderWorkflowSteps();
      return;
    }

    if (button.dataset.action === 'move-step-up' && index > 0) {
      const [step] = steps.splice(index, 1);
      steps.splice(index - 1, 0, step);
      renderWorkflowSteps();
      return;
    }

    if (button.dataset.action === 'move-step-down' && index < steps.length - 1) {
      const [step] = steps.splice(index, 1);
      steps.splice(index + 1, 0, step);
      renderWorkflowSteps();
    }
  });

  function handleStepFieldUpdate(event) {
    if (!state.workflowModal.draft) {
      return;
    }

    const target = event.target;
    const stepId = target.dataset.stepId;
    const field = target.dataset.field;
    if (!stepId || !field) {
      return;
    }

    const step = findDraftStep(stepId);
    if (!step) {
      return;
    }

    if (field === 'command') {
      const replacement = Object.assign(createDefaultStep(target.value), {
        id: step.id,
        delayBeforeMs: step.delayBeforeMs || 0,
        delayAfterMs: step.delayAfterMs || 0,
      });
      const index = state.workflowModal.draft.steps.findIndex((item) => String(item.id) === String(stepId));
      state.workflowModal.draft.steps.splice(index, 1, replacement);
      renderWorkflowSteps();
      return;
    }

    if (field === 'position.useTabDefault') {
      step.position = target.checked ? { useTabDefault: true } : createDefaultPosition();
      renderWorkflowSteps();
      return;
    }

    if (field === 'position.mode') {
      step.position = step.position && step.position.useTabDefault ? createDefaultPosition() : step.position || createDefaultPosition();
      step.position.mode = target.value;
      if (target.value === 'custom') {
        step.position.x = toNumber(step.position.x, 0);
        step.position.y = toNumber(step.position.y, 0);
      }
      renderWorkflowSteps();
      return;
    }

    setNestedValue(step, field, castInputValue(target));
  }

  elements.workflowSteps.addEventListener('input', handleStepFieldUpdate);
  elements.workflowSteps.addEventListener('change', handleStepFieldUpdate);

  elements.workflowForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveWorkflowFromModal({ closeOnSuccess: true });
  });

  elements.testWorkflowButton.addEventListener('click', async () => {
    if (!state.workflowModal.draft) {
      return;
    }

    let workflowId = state.workflowModal.draft.id;
    if (!workflowId) {
      const saved = await saveWorkflowFromModal({ closeOnSuccess: false });
      if (!saved) {
        return;
      }
      workflowId = saved.id;
    }

    const response = await emitWithAck('workflow:run-once', {
      tabId: Number(state.workflowModal.tabId),
      workflowId,
    });

    if (!response.ok) {
      flash(response.error || 'Failed to run workflow once.');
      return;
    }

    flash('Workflow test run started.', 'success');
  });

  elements.duplicateWorkflowButton.addEventListener('click', () => {
    if (!state.workflowModal.draft) {
      return;
    }

    state.workflowModal.draft = hydrateWorkflowDraft({
      ...state.workflowModal.draft,
      id: null,
      name: `${state.workflowModal.draft.name || 'Workflow'} Copy`,
    });
    state.workflowModal.mode = 'create';
    renderWorkflowModal();
  });

  elements.scanBrowsersButton.addEventListener('click', scanBrowsers);
  elements.browserTypeSelect.addEventListener('change', () => {
    const selected = state.browserCatalog.find(browser => browser.type === elements.browserTypeSelect.value);
    if (selected) {
      state.browserModal.draft.type = selected.type;
      state.browserModal.draft.executablePath = selected.executablePath;
      elements.browserExecutablePathInput.value = selected.executablePath;
      elements.browserExecutablePathInput.readOnly = true;
    } else if (elements.browserTypeSelect.value === 'custom') {
      state.browserModal.draft.type = 'custom';
      elements.browserExecutablePathInput.readOnly = false;
      elements.browserAdvancedSettings.open = true;
      elements.browserExecutablePathInput.focus();
    }
  });

  elements.closeBrowserModalButton.addEventListener('click', () => {
    closeBrowserModal();
  });

  elements.cancelBrowserButton.addEventListener('click', () => {
    closeBrowserModal();
  });

  elements.browserForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (state.scanningBrowsers || elements.saveBrowserButton.disabled) return;
    if (!elements.browserTypeSelect.value) {
      flash('Choose an installed browser or Custom browser first.');
      return;
    }
    if (elements.browserTypeSelect.value === 'custom' && !elements.browserExecutablePathInput.value.trim() && elements.browserLaunchModeSelect.value !== 'connectOverCDP') {
      elements.browserAdvancedSettings.open = true;
      flash('Enter a custom browser path, or select an installed browser.');
      return;
    }
    const payload = {
      type: elements.browserTypeSelect.value,
      launchMode: elements.browserLaunchModeSelect.value,
      connectOverCDP: elements.browserLaunchModeSelect.value === 'connectOverCDP',
      executablePath: elements.browserExecutablePathInput.value.trim(),
      userDataDir: elements.browserUserDataDirInput.value.trim(),
      cdpUrl: elements.browserCdpUrlInput.value.trim(),
      args: elements.browserArgsTextarea.value,
      headless: elements.browserHeadlessInput.checked,
      activateTabOnInteraction: elements.browserActivateTabInput.checked,
      optimizeForHiddenExecution: elements.browserOptimizeForHiddenExecutionInput.checked,
      powerSaving: Boolean(currentBrowserConfig().powerSaving),
    };

    state.applyingBrowser = true;
    elements.scanBrowsersButton.disabled = true;
    elements.saveBrowserButton.disabled = true;
    elements.saveBrowserButton.textContent = 'Applying…';
    const response = await emitWithAck('browser:update', payload);
    state.applyingBrowser = false;
    elements.scanBrowsersButton.disabled = false;
    elements.saveBrowserButton.disabled = false;
    elements.saveBrowserButton.textContent = 'Apply Browser Settings';
    if (!response.ok) {
      flash(response.error || 'Failed to apply browser settings.');
      return;
    }

    closeBrowserModal();
    flash('Browser ready. Use Add New Tab to create a tab.', 'success');
  });

  socket.on('connect', () => {
    state.connected = true;
    socket.emit('dashboard:visibility', { visible: !document.hidden });
    renderConnectionState();
  });

  socket.on('disconnect', () => {
    state.connected = false;
    renderConnectionState();
  });

  function renderSnapshot() {
    renderConnectionState();
    renderStats();
    renderSavedConfigControls();
    const tabsChanged = renderTabs();
    syncTabRuntimeMetrics();
    if (tabsChanged) renderLogs();
  }

  socket.on('state:snapshot', (snapshot) => {
    state.snapshot = snapshot;
    if (!document.hidden) renderSnapshot();
  });
  document.addEventListener('visibilitychange', () => {
    if (state.connected) socket.emit('dashboard:visibility', { visible: !document.hidden });
    if (!document.hidden) { renderSnapshot(); renderLogs(); }
  });

  socket.on('logs:bootstrap', (entries) => {
    replaceLogs(entries);
  });

  socket.on('logs:batch', entries => appendLogs(entries));

  socket.on('log:entry', (entry) => {
    appendLogs([entry]);
  });

  renderDashboard();
})();
