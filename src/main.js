const { Modal, Notice, Plugin, PluginSettingTab, Setting } = require('obsidian');

const ZOOM_NONE = 'none';
const ZOOM_FIT_HEIGHT = 'page-height';
const ZOOM_FIT_WIDTH = 'page-width';

const SIDEBAR_NONE = 'none';
const SIDEBAR_THUMBNAILS = 'thumbnails';
const SIDEBAR_TOC = 'toc';
const SIDEBAR_REVEAL = 'reveal';

const SIDEBAR_LEAVE = 'leave';
const SIDEBAR_OPEN = 'open';
const SIDEBAR_CLOSED = 'closed';

const OPEN_NONE = 'none';
const OPEN_PAGE = 'page';
const OPEN_PERCENT = 'percent';

const INHERIT = 'inherit';

const PDF_HISTORY_KEY = 'pdfjs.history';

const DEFAULT_SETTINGS = Object.freeze({
  zoomMode: ZOOM_FIT_HEIGHT,
  sidebarMode: SIDEBAR_NONE,
  sidebarState: SIDEBAR_LEAVE,
  openMode: OPEN_NONE,
  openPage: 1,
  openPercent: 0,
  files: {},
});

const DEFAULT_FILE_SETTINGS = Object.freeze({
  zoomMode: INHERIT,
  sidebarMode: INHERIT,
  sidebarState: INHERIT,
  openMode: INHERIT,
  openPage: null,
  openPercent: null,
});

const ZOOM_OPTIONS = [
  [ZOOM_FIT_HEIGHT, 'Fit height'],
  [ZOOM_FIT_WIDTH, 'Fit width'],
  [ZOOM_NONE, 'Default'],
];

const SIDEBAR_MODE_OPTIONS = [
  [SIDEBAR_NONE, 'None'],
  [SIDEBAR_THUMBNAILS, 'Thumbnails'],
  [SIDEBAR_TOC, 'Table of contents'],
  [SIDEBAR_REVEAL, 'Reveal page in table of contents'],
];

const SIDEBAR_STATE_OPTIONS = [
  [SIDEBAR_LEAVE, 'Default'],
  [SIDEBAR_OPEN, 'Open'],
  [SIDEBAR_CLOSED, 'Closed'],
];

const OPEN_MODE_OPTIONS = [
  [OPEN_NONE, 'None'],
  [OPEN_PAGE, 'Page number'],
  [OPEN_PERCENT, 'Page percentage'],
];

const UI_COPY = Object.freeze({
  zoomOptions: ZOOM_OPTIONS,
  sidebarStateOptions: SIDEBAR_STATE_OPTIONS,
  openModeOptions: OPEN_MODE_OPTIONS,
  descriptions: Object.freeze({
    zoom: 'Choose the zoom applied when a PDF opens.',
    sidebarPanel: 'Choose the PDF sidebar panel when a PDF opens.',
    sidebarState: 'Choose whether the PDF sidebar should open, close, or not change.',
    startPosition: 'Choose whether a PDF opens at a page number or page percentage.',
    startPage: 'The page number to open when start position is set to page number.',
    startPercentage: 'The page percentage to open when start position is set to page percentage.',
    perFileSettings: 'Use the Fix PDF option in an open PDF file menu to override these defaults for individual PDF.',
  }),
});

class FixPdfPlugin extends Plugin {
  async onload() {
    this.applied = new WeakMap();
    this.pending = new WeakMap();
    this.settingsVersion = 0;
    await this.loadSettings();

    this.patchPdfHistory();
    this.addSettingTab(new FixPdfSettingTab(this.app, this));

    const applyAll = () => {
      this.applyToOpenPdfLeaves();
      this.applyToActivePdfLeaf();
    };

    this.registerEvent(this.app.workspace.on('file-open', applyAll));
    this.registerEvent(this.app.workspace.on('layout-change', applyAll));
    this.registerEvent(this.app.workspace.on('active-leaf-change', applyAll));
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => this.onFileMenu(menu, file)));

    if (this.app.vault && typeof this.app.vault.on === 'function') {
      this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.onFileRename(file, oldPath)));
      this.registerEvent(this.app.vault.on('delete', (file) => this.onFileDelete(file)));
    }

    this.app.workspace.onLayoutReady(() => {
      applyAll();
      window.setTimeout(applyAll, 250);
      window.setTimeout(applyAll, 1000);
      window.setTimeout(applyAll, 2500);

      // Safety net for PDFs restored/opened without a workspace event.
      // Each leaf/file/settings revision is changed only once.
      this.registerInterval(window.setInterval(applyAll, 2000));
    });
  }

  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings() {
    this.settings = normalizeSettings(this.settings);
    await this.saveData(this.settings);
    this.settingsVersion += 1;
    this.applied = new WeakMap();
    this.pending = new WeakMap();
    this.applyToOpenPdfLeaves();
    this.applyToActivePdfLeaf();
  }

  async updateSettings(patch) {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    await this.saveSettings();
  }

  async setFileSettings(filePath, fileSettings) {
    const files = { ...this.settings.files };
    const normalized = normalizeFileSettings(fileSettings);
    if (isDefaultFileSettings(normalized)) {
      delete files[filePath];
    } else {
      files[filePath] = normalized;
    }
    await this.updateSettings({ files });
  }

  async resetFileSettings(filePath) {
    const files = { ...this.settings.files };
    delete files[filePath];
    await this.updateSettings({ files });
  }

  onFileRename(file, oldPath) {
    if (!oldPath || !this.settings.files[oldPath]) return;

    const files = { ...this.settings.files };
    files[file.path] = files[oldPath];
    delete files[oldPath];
    this.updateSettings({ files });
  }

  onFileDelete(file) {
    if (!file || !this.settings.files[file.path]) return;

    const files = { ...this.settings.files };
    delete files[file.path];
    this.updateSettings({ files });
  }

  onFileMenu(menu, file) {
    if (!isPdfFile(file)) return;

    menu.addItem((item) => {
      item
        .setSection('action')
        .setTitle('Fix PDF')
        .setIcon('lucide-file-cog')
        .onClick(() => new FixPdfFileModal(this.app, this, file).open());
    });
  }

  patchPdfHistory() {
    if (this.settings.zoomMode !== ZOOM_FIT_HEIGHT) return;

    try {
      if (typeof this.app.loadLocalStorage !== 'function' || typeof this.app.saveLocalStorage !== 'function') return;

      const raw = this.app.loadLocalStorage(PDF_HISTORY_KEY);
      if (!raw) return;

      const history = JSON.parse(raw);
      if (!history || !Array.isArray(history.files)) return;

      let changed = false;
      for (const file of history.files) {
        if (file && file.zoom === ZOOM_FIT_WIDTH) {
          file.zoom = ZOOM_FIT_HEIGHT;
          changed = true;
        }
      }

      if (changed) {
        this.app.saveLocalStorage(PDF_HISTORY_KEY, JSON.stringify(history));
      }
    } catch (error) {
      console.warn('fix-pdf: could not patch PDF history', error);
    }
  }

  applyToOpenPdfLeaves() {
    const seen = new Set();
    for (const leaf of this.app.workspace.getLeavesOfType('pdf')) {
      seen.add(leaf);
      this.applyToLeaf(leaf);
    }
    if (typeof this.app.workspace.iterateAllLeaves === 'function') {
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (!seen.has(leaf)) {
          this.applyToLeaf(leaf);
        }
      });
    }
  }

  applyToActivePdfLeaf() {
    this.applyToLeaf(this.app.workspace.activeLeaf);
  }

  applyToLeaf(leaf) {
    const view = leaf && leaf.view;
    if (!isPdfView(view)) return;

    const filePath = getPdfFilePath(view);
    const applyKey = `${filePath}:${this.settingsVersion}`;
    if (this.applied.get(leaf) === applyKey) return;

    const run = (viewerChild) => this.applyToViewerChild(leaf, applyKey, filePath, viewerChild);

    try {
      if (view.viewer && typeof view.viewer.then === 'function') {
        view.viewer.then(run);
      } else if (view.viewer && view.viewer.child) {
        run(view.viewer.child);
      }
    } catch (error) {
      console.warn('fix-pdf: could not access PDF viewer', error);
    }
  }

  applyToViewerChild(leaf, applyKey, filePath, viewerChild) {
    const obsidianPdfViewer = viewerChild && viewerChild.pdfViewer;
    const pdfViewer = obsidianPdfViewer && obsidianPdfViewer.pdfViewer;
    const eventBus = obsidianPdfViewer && obsidianPdfViewer.eventBus;

    this.applied = this.applied || new WeakMap();
    this.pending = this.pending || new WeakMap();

    if (!pdfViewer || !eventBus || this.applied.get(leaf) === applyKey || this.pending.get(leaf) === applyKey) return;

    const options = getEffectivePdfOptions(this.settings, filePath);
    const readyPromise = pdfViewer.firstPagePromise || (pdfViewer._pagesCapability && pdfViewer._pagesCapability.promise);
    const startPositionEnabled = hasStartPosition(options);
    let positioned = !startPositionEnabled;
    let landed = !startPositionEnabled;
    let userMoved = false;
    let listeningForUserMove = false;
    let cleanupUserMoveListeners = () => {};
    this.pending.set(leaf, applyKey);

    const stopPositioning = () => {
      positioned = true;
      cleanupUserMoveListeners();
    };

    const markApplied = () => {
      stopPositioning();
      this.pending.delete(leaf);
      this.applied.set(leaf, applyKey);
    };

    const listenForUserMove = () => {
      if (!startPositionEnabled || userMoved || listeningForUserMove) return;

      const targets = getViewerInteractionTargets(leaf, viewerChild, obsidianPdfViewer, pdfViewer);
      if (targets.length === 0) return;
      listeningForUserMove = true;

      const events = ['wheel', 'pointerdown', 'mousedown', 'touchstart', 'keydown'];
      const listenerOptions = { capture: true, passive: true };
      const onUserMove = (event) => {
        if (!landed || positioned) return;
        if (event && event.isTrusted === false) return;

        userMoved = true;
        stopPositioning();
      };

      for (const target of targets) {
        for (const eventName of events) {
          target.addEventListener(eventName, onUserMove, listenerOptions);
        }
      }

      cleanupUserMoveListeners = () => {
        for (const target of targets) {
          for (const eventName of events) {
            target.removeEventListener(eventName, onUserMove, listenerOptions);
          }
        }
        cleanupUserMoveListeners = () => {};
        listeningForUserMove = false;
      };
    };

    const applyOptions = (allowPosition, allowSidebarChange, verifyLanding = false) => {
      if (this.applied.get(leaf) === applyKey) return;

      this.applyZoom(pdfViewer, eventBus, options);

      if (verifyLanding && landed && isStartPositionApplied(pdfViewer, options)) {
        stopPositioning();
      } else if (allowPosition && !positioned && !userMoved) {
        landed = this.applyStartPosition(pdfViewer, eventBus, options);
        if (landed) {
          listenForUserMove();
        }
      }

      this.applySidebar(obsidianPdfViewer, eventBus, options, allowSidebarChange);
    };

    const scheduleOptions = () => {
      if (this.applied.get(leaf) === applyKey) {
        this.pending.delete(leaf);
        return;
      }
      if (startPositionEnabled && !isActiveLeaf(this.app && this.app.workspace, leaf)) {
        this.pending.delete(leaf);
        return;
      }

      applyOptions(true, true);
      window.setTimeout(() => applyOptions(true, false, true), 250);
      window.setTimeout(() => applyOptions(true, false, true), 1000);
      window.setTimeout(() => applyOptions(true, false, true), 2500);
      window.setTimeout(() => applyOptions(true, false, true), 5000);
      window.setTimeout(() => {
        applyOptions(true, false, true);
        if (!startPositionEnabled || positioned || isStartPositionApplied(pdfViewer, options)) {
          markApplied();
          return;
        }
        this.pending.delete(leaf);
        cleanupUserMoveListeners();
      }, 10000);
    };

    if (readyPromise && typeof readyPromise.then === 'function') {
      readyPromise.then(scheduleOptions).catch(scheduleOptions);
    } else {
      window.setTimeout(scheduleOptions, 0);
    }
  }

  applyZoom(pdfViewer, eventBus, options) {
    if (!options.zoomMode || options.zoomMode === ZOOM_NONE) return;

    try {
      if (pdfViewer.currentScaleValue !== options.zoomMode) {
        pdfViewer.currentScaleValue = options.zoomMode;
      }
      if (typeof pdfViewer.updateScale === 'function') {
        pdfViewer.updateScale({ drawingDelay: 0 });
      }
      if (pdfViewer.currentScaleValue !== options.zoomMode) {
        eventBus.dispatch('scalechanged', {
          source: this,
          value: options.zoomMode,
        });
      }
      if (typeof pdfViewer.update === 'function') {
        pdfViewer.update();
      }
    } catch (error) {
      console.warn('fix-pdf: could not set PDF zoom', error);
    }
  }

  applyStartPosition(pdfViewer, eventBus, options) {
    const targetPage = getTargetPage(options, getPdfPageCount(pdfViewer));
    if (!targetPage) return true;

    try {
      let attempted = false;
      if (typeof pdfViewer._setCurrentPageNumber === 'function') {
        pdfViewer._setCurrentPageNumber(targetPage, true);
        attempted = true;
      }
      if (typeof pdfViewer.currentPageNumber === 'number') {
        pdfViewer.currentPageNumber = targetPage;
        attempted = true;
      }
      if (typeof pdfViewer.scrollPageIntoView === 'function') {
        pdfViewer.scrollPageIntoView({ pageNumber: targetPage });
        attempted = true;
      }
      if (typeof pdfViewer.currentPageNumber === 'number') {
        return pdfViewer.currentPageNumber === targetPage;
      }
      return attempted;
    } catch (error) {
      console.warn('fix-pdf: could not set PDF start page', error);
      return false;
    }
  }

  applySidebar(obsidianPdfViewer, eventBus, options, allowSidebarChange = true) {
    const sidebar = obsidianPdfViewer && obsidianPdfViewer.pdfSidebar;
    if (!sidebar || typeof sidebar.switchView !== 'function') return;

    try {
      if (allowSidebarChange) {
        if (options.sidebarMode === SIDEBAR_THUMBNAILS) {
          sidebar.switchView(1, true);
        } else if (options.sidebarMode === SIDEBAR_TOC || options.sidebarMode === SIDEBAR_REVEAL) {
          sidebar.switchView(2, true);
        } else if (options.sidebarState === SIDEBAR_OPEN && !sidebar.isOpen) {
          sidebar.switchView(sidebar.active || 1, true);
        }
      }

      if (options.sidebarMode === SIDEBAR_REVEAL) {
        const reveal = () => eventBus.dispatch('currentoutlineitem', { source: this });
        reveal();
        window.setTimeout(reveal, 250);
        window.setTimeout(reveal, 1000);
      }

      if (allowSidebarChange && options.sidebarState === SIDEBAR_CLOSED) {
        sidebar.switchView(0, true);
      }
    } catch (error) {
      console.warn('fix-pdf: could not set PDF sidebar', error);
    }
  }

}

class FixPdfSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Fix PDF' });

    renderPdfControls(containerEl, this.plugin.settings, {
      inherited: this.plugin.settings,
      onChange: async (patch) => {
        await this.plugin.updateSettings(patch);
        this.display();
      },
    });

    new Setting(containerEl)
      .setName('Per-file settings')
      .setDesc(UI_COPY.descriptions.perFileSettings);
  }
}

class FixPdfFileModal extends Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.draft = getFileSettingsDraft(plugin.settings, file.path);
  }

  onOpen() {
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    const titleEl = contentEl.createEl('h2', { text: 'Fix PDF' });
    titleEl.style.marginTop = '0';
    titleEl.style.marginBlockStart = '0';
    contentEl.createEl('p', {
      text: this.file.path,
      cls: 'setting-item-description',
    });

    renderPdfControls(contentEl, this.draft, {
      inherited: this.draft,
      onChange: (patch) => {
        this.draft = getFileSettingsDraft({ ...this.draft, ...patch }, this.file.path);
      },
    });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('Save PDF')
          .setCta()
          .onClick(async () => {
            await this.plugin.setFileSettings(this.file.path, this.draft);
            new Notice('Saved PDF settings');
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Reset PDF')
          .onClick(async () => {
            await this.plugin.resetFileSettings(this.file.path);
            new Notice('Fix PDF settings reset for this PDF.');
            this.close();
          });
      });
  }
}

function renderPdfControls(containerEl, values, options) {
  const inherited = options.inherited || DEFAULT_SETTINGS;
  let openMode = values.openMode;
  let openPage = values.openPage;
  let openPercent = values.openPercent;
  let startPageInputEl = null;
  let startPercentageInputEl = null;
  const updateStartInputs = (resetInactive) => {
    if (startPageInputEl) {
      startPageInputEl.disabled = openMode !== OPEN_PAGE;
      if (resetInactive && startPageInputEl.disabled) {
        openPage = DEFAULT_SETTINGS.openPage;
        startPageInputEl.value = String(openPage);
      }
    }
    if (startPercentageInputEl) {
      startPercentageInputEl.disabled = openMode !== OPEN_PERCENT;
      if (resetInactive && startPercentageInputEl.disabled) {
        openPercent = DEFAULT_SETTINGS.openPercent;
        startPercentageInputEl.value = String(openPercent);
      }
    }
  };

  addDropdownSetting(containerEl, {
    name: 'Zoom',
    desc: UI_COPY.descriptions.zoom,
    value: values.zoomMode,
    options: ZOOM_OPTIONS,
    onChange: (zoomMode) => options.onChange({ zoomMode }),
  });

  addDropdownSetting(containerEl, {
    name: 'Sidebar panel',
    desc: UI_COPY.descriptions.sidebarPanel,
    value: values.sidebarMode,
    options: SIDEBAR_MODE_OPTIONS,
    onChange: (sidebarMode) => options.onChange({ sidebarMode }),
  });

  addDropdownSetting(containerEl, {
    name: 'Sidebar state',
    desc: UI_COPY.descriptions.sidebarState,
    value: values.sidebarState,
    options: SIDEBAR_STATE_OPTIONS,
    onChange: (sidebarState) => options.onChange({ sidebarState }),
  });

  addDropdownSetting(containerEl, {
    name: 'Start position',
    desc: UI_COPY.descriptions.startPosition,
    value: values.openMode,
    options: OPEN_MODE_OPTIONS,
    onChange: (mode) => {
      openMode = mode;
      updateStartInputs(true);
      const patch = { openMode: mode };
      if (mode !== OPEN_PAGE) {
        patch.openPage = DEFAULT_SETTINGS.openPage;
      }
      if (mode !== OPEN_PERCENT) {
        patch.openPercent = DEFAULT_SETTINGS.openPercent;
      }
      options.onChange(patch);
    },
  });

  new Setting(containerEl)
    .setName('Start page')
    .setDesc(UI_COPY.descriptions.startPage)
    .addText((text) => {
      text
        .setPlaceholder(String(inherited.openPage || 1))
        .setValue(formatNumberInputValue(values.openPage));
      startPageInputEl = text.inputEl;
      updateStartInputs(true);
      text.inputEl.addEventListener('blur', () => {
        openPage = parsePositiveInteger(text.inputEl.value, DEFAULT_SETTINGS.openPage);
        text.setValue(String(openPage));
        options.onChange({ openPage });
      });
    });

  new Setting(containerEl)
    .setName('Start percentage')
    .setDesc(UI_COPY.descriptions.startPercentage)
    .addText((text) => {
      text
        .setPlaceholder(String(inherited.openPercent || 0))
        .setValue(formatNumberInputValue(values.openPercent));
      startPercentageInputEl = text.inputEl;
      updateStartInputs(true);
      text.inputEl.addEventListener('blur', () => {
        openPercent = parsePercent(text.inputEl.value, DEFAULT_SETTINGS.openPage);
        text.setValue(String(openPercent));
        options.onChange({ openPercent });
      });
    });
}

function addDropdownSetting(containerEl, config) {
  new Setting(containerEl)
    .setName(config.name)
    .setDesc(config.desc)
    .addDropdown((dropdown) => {
      for (const [value, label] of config.options) {
        dropdown.addOption(value, label);
      }
      dropdown.setValue(config.value).onChange(config.onChange);
    });
}

function normalizeSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const files = {};
  const sourceFiles = source.files && typeof source.files === 'object' ? source.files : {};

  for (const [path, fileSettings] of Object.entries(sourceFiles)) {
    const normalized = normalizeFileSettings(fileSettings);
    if (!isDefaultFileSettings(normalized)) {
      files[path] = normalized;
    }
  }

  return {
    zoomMode: normalizeOption(source.zoomMode, ZOOM_OPTIONS, DEFAULT_SETTINGS.zoomMode),
    sidebarMode: normalizeOption(source.sidebarMode, SIDEBAR_MODE_OPTIONS, DEFAULT_SETTINGS.sidebarMode),
    sidebarState: normalizeOption(source.sidebarState, SIDEBAR_STATE_OPTIONS, DEFAULT_SETTINGS.sidebarState),
    openMode: normalizeOption(source.openMode, OPEN_MODE_OPTIONS, DEFAULT_SETTINGS.openMode),
    openPage: parsePositiveInteger(source.openPage, DEFAULT_SETTINGS.openPage),
    openPercent: parsePercent(source.openPercent, DEFAULT_SETTINGS.openPercent),
    files,
  };
}

function normalizeFileSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};

  return {
    zoomMode: normalizeOption(source.zoomMode, ZOOM_OPTIONS, DEFAULT_FILE_SETTINGS.zoomMode, true),
    sidebarMode: normalizeOption(source.sidebarMode, SIDEBAR_MODE_OPTIONS, DEFAULT_FILE_SETTINGS.sidebarMode, true),
    sidebarState: normalizeOption(source.sidebarState, SIDEBAR_STATE_OPTIONS, DEFAULT_FILE_SETTINGS.sidebarState, true),
    openMode: normalizeOption(source.openMode, OPEN_MODE_OPTIONS, DEFAULT_FILE_SETTINGS.openMode, true),
    openPage: source.openPage === null ? null : parsePositiveInteger(source.openPage, DEFAULT_FILE_SETTINGS.openPage),
    openPercent: source.openPercent === null ? null : parsePercent(source.openPercent, DEFAULT_FILE_SETTINGS.openPercent),
  };
}

function isDefaultFileSettings(settings) {
  const normalized = normalizeFileSettings(settings);
  return Object.keys(DEFAULT_FILE_SETTINGS).every((key) => normalized[key] === DEFAULT_FILE_SETTINGS[key]);
}

function getEffectivePdfOptions(settings, filePath) {
  const normalized = normalizeSettings(settings);
  const fileSettings = normalizeFileSettings(normalized.files[filePath]);
  const effective = { ...normalized };
  delete effective.files;

  for (const key of ['zoomMode', 'sidebarMode', 'sidebarState', 'openMode']) {
    if (fileSettings[key] !== INHERIT) {
      effective[key] = fileSettings[key];
    }
  }

  if (fileSettings.openPage !== null) {
    effective.openPage = fileSettings.openPage;
  }
  if (fileSettings.openPercent !== null) {
    effective.openPercent = fileSettings.openPercent;
  }

  return effective;
}

function getFileSettingsDraft(settings, filePath) {
  const effective = getEffectivePdfOptions(settings, filePath);

  return {
    zoomMode: effective.zoomMode,
    sidebarMode: effective.sidebarMode,
    sidebarState: effective.sidebarState,
    openMode: effective.openMode,
    openPage: effective.openMode === OPEN_PAGE ? effective.openPage : DEFAULT_SETTINGS.openPage,
    openPercent: effective.openMode === OPEN_PERCENT ? effective.openPercent : DEFAULT_SETTINGS.openPercent,
  };
}

function getTargetPage(options, pagesCount) {
  if (!options || options.openMode === OPEN_NONE) return null;

  if (options.openMode === OPEN_PAGE) {
    return clampPage(options.openPage, pagesCount);
  }

  if (options.openMode === OPEN_PERCENT && pagesCount > 0) {
    const percent = parsePercent(options.openPercent, 0);
    const page = Math.round(1 + ((pagesCount - 1) * percent) / 100);
    return clampPage(page, pagesCount);
  }

  return null;
}

function hasStartPosition(options) {
  return !!options && (options.openMode === OPEN_PAGE || options.openMode === OPEN_PERCENT);
}

function isStartPositionApplied(pdfViewer, options) {
  const targetPage = getTargetPage(options, getPdfPageCount(pdfViewer));
  if (!targetPage) return true;
  return typeof pdfViewer.currentPageNumber === 'number' && pdfViewer.currentPageNumber === targetPage;
}

function getViewerInteractionTargets(leaf, viewerChild, obsidianPdfViewer, pdfViewer) {
  const targets = [];
  const addTarget = (target) => {
    if (!target || targets.includes(target)) return;
    if (typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return;
    targets.push(target);
  };

  addTarget(viewerChild && viewerChild.containerEl);
  addTarget(obsidianPdfViewer && obsidianPdfViewer.containerEl);
  addTarget(pdfViewer && pdfViewer.container);
  addTarget(pdfViewer && pdfViewer.viewer);
  addTarget(pdfViewer && pdfViewer.viewerElement);
  addTarget(pdfViewer && pdfViewer.div);
  addTarget(leaf && leaf.view && leaf.view.containerEl);
  addTarget(leaf && leaf.containerEl);

  return targets;
}

function getPdfPageCount(pdfViewer) {
  if (!pdfViewer) return 0;
  if (Number.isFinite(pdfViewer.pagesCount)) return pdfViewer.pagesCount;
  if (Array.isArray(pdfViewer._pages)) return pdfViewer._pages.length;
  return 0;
}

function getPdfFilePath(view) {
  return (view.file && view.file.path) || (view.getState && view.getState().file) || '__no_file__';
}

function isPdfView(view) {
  if (!view) return false;
  const filePath = getPdfFilePath(view);
  if (String(filePath).toLowerCase().endsWith('.pdf')) return true;
  if (view.file && String(view.file.extension || '').toLowerCase() === 'pdf') return true;
  return typeof view.getViewType === 'function' && view.getViewType() === 'pdf';
}

function isActiveLeaf(workspace, leaf) {
  if (!workspace) return true;
  if ('activeLeaf' in workspace && workspace.activeLeaf === leaf) return true;

  const viewEl = leaf && leaf.view && leaf.view.containerEl;
  const leafEl = viewEl && typeof viewEl.closest === 'function'
    ? viewEl.closest('.workspace-leaf')
    : null;
  const fallbackEl = !leafEl && leaf && typeof leaf.getContainer === 'function'
    ? leaf.getContainer()
    : leaf && leaf.containerEl;
  const activeEl = leafEl || fallbackEl;

  if (activeEl && activeEl.classList && activeEl.classList.contains('mod-active')) return true;
  if (activeEl && typeof activeEl.hasClass === 'function' && activeEl.hasClass('mod-active')) return true;

  return !('activeLeaf' in workspace);
}

function isPdfFile(file) {
  return !!file && String(file.extension || '').toLowerCase() === 'pdf';
}

function normalizeOption(value, options, fallback, allowInherit) {
  if (allowInherit && value === INHERIT) return INHERIT;
  const valid = new Set(options.map(([option]) => option));
  return valid.has(value) ? value : fallback;
}

function parsePositiveInteger(value, fallback) {
  if (value === null && fallback === null) return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePercent(value, fallback) {
  if (value === null && fallback === null) return null;
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

function formatNumberInputValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function clampPage(page, pagesCount) {
  const parsed = parsePositiveInteger(page, 1);
  if (!pagesCount || pagesCount < 1) return parsed;
  return Math.min(pagesCount, Math.max(1, parsed));
}

FixPdfPlugin.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
FixPdfPlugin.DEFAULT_FILE_SETTINGS = DEFAULT_FILE_SETTINGS;
FixPdfPlugin.UI_COPY = UI_COPY;
FixPdfPlugin.normalizeSettings = normalizeSettings;
FixPdfPlugin.normalizeFileSettings = normalizeFileSettings;
FixPdfPlugin.getEffectivePdfOptions = getEffectivePdfOptions;
FixPdfPlugin.getFileSettingsDraft = getFileSettingsDraft;
FixPdfPlugin.getTargetPage = getTargetPage;
FixPdfPlugin.renderPdfControls = renderPdfControls;

module.exports = FixPdfPlugin;
