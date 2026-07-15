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
  [ZOOM_NONE, 'Leave as is'],
];

const SIDEBAR_MODE_OPTIONS = [
  [SIDEBAR_NONE, 'None'],
  [SIDEBAR_THUMBNAILS, 'Thumbnails'],
  [SIDEBAR_TOC, 'Table of contents'],
  [SIDEBAR_REVEAL, 'Reveal page in table of contents'],
];

const SIDEBAR_STATE_OPTIONS = [
  [SIDEBAR_LEAVE, 'Leave as is'],
  [SIDEBAR_OPEN, 'Open'],
  [SIDEBAR_CLOSED, 'Closed'],
];

const OPEN_MODE_OPTIONS = [
  [OPEN_NONE, 'None'],
  [OPEN_PAGE, 'Specific page'],
  [OPEN_PERCENT, 'Percentage through PDF'],
];

class FixPdfPlugin extends Plugin {
  async onload() {
    this.applied = new WeakMap();
    this.settingsVersion = 0;
    await this.loadSettings();

    this.patchPdfHistory();
    this.addSettingTab(new FixPdfSettingTab(this.app, this));

    const applyAll = () => this.applyToOpenPdfLeaves();

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
    this.applyToOpenPdfLeaves();
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
    for (const leaf of this.app.workspace.getLeavesOfType('pdf')) {
      this.applyToLeaf(leaf);
    }
  }

  applyToLeaf(leaf) {
    const view = leaf && leaf.view;
    if (!view || typeof view.getViewType !== 'function' || view.getViewType() !== 'pdf') return;

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

    if (!pdfViewer || !eventBus || this.applied.get(leaf) === applyKey) return;

    const options = getEffectivePdfOptions(this.settings, filePath);
    const readyPromise = pdfViewer.firstPagePromise || (pdfViewer._pagesCapability && pdfViewer._pagesCapability.promise);
    let positioned = false;

    const applyOptions = (allowPosition) => {
      this.applyZoom(pdfViewer, eventBus, options);

      if (allowPosition && !positioned) {
        positioned = true;
        this.applyStartPosition(pdfViewer, eventBus, options);
      }

      this.applySidebar(obsidianPdfViewer, eventBus, options);
    };

    const scheduleOptions = () => {
      if (this.applied.get(leaf) === applyKey) return;

      applyOptions(true);
      window.setTimeout(() => applyOptions(false), 250);
      window.setTimeout(() => applyOptions(false), 1000);
      window.setTimeout(() => {
        applyOptions(false);
        this.applied.set(leaf, applyKey);
      }, 2500);
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
    if (!targetPage) return;

    try {
      eventBus.dispatch('pagenumberchanged', {
        source: this,
        value: String(targetPage),
      });

      if (typeof pdfViewer.currentPageNumber === 'number') {
        pdfViewer.currentPageNumber = targetPage;
      }
    } catch (error) {
      console.warn('fix-pdf: could not set PDF start page', error);
    }
  }

  applySidebar(obsidianPdfViewer, eventBus, options) {
    const sidebar = obsidianPdfViewer && obsidianPdfViewer.pdfSidebar;
    if (!sidebar || typeof sidebar.switchView !== 'function') return;

    try {
      if (options.sidebarMode === SIDEBAR_THUMBNAILS) {
        sidebar.switchView(1, true);
      } else if (options.sidebarMode === SIDEBAR_TOC || options.sidebarMode === SIDEBAR_REVEAL) {
        sidebar.switchView(2, true);
      } else if (options.sidebarState === SIDEBAR_OPEN && !sidebar.isOpen) {
        sidebar.switchView(sidebar.active || 1, true);
      }

      if (options.sidebarMode === SIDEBAR_REVEAL) {
        const reveal = () => eventBus.dispatch('currentoutlineitem', { source: this });
        reveal();
        window.setTimeout(reveal, 250);
        window.setTimeout(reveal, 1000);
      }

      if (options.sidebarState === SIDEBAR_CLOSED) {
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
      allowInherit: false,
      inherited: this.plugin.settings,
      onChange: async (patch) => {
        await this.plugin.updateSettings(patch);
        this.display();
      },
    });

    new Setting(containerEl)
      .setName('Per-file settings')
      .setDesc('Use the Fix PDF item in an open PDF file menu to override these defaults for one PDF.');
  }
}

class FixPdfFileModal extends Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.draft = normalizeFileSettings(plugin.settings.files[file.path]);
  }

  onOpen() {
    this.render();
  }

  render() {
    const { contentEl } = this;
    const effective = getEffectivePdfOptions(this.plugin.settings, this.file.path);
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Fix PDF' });
    contentEl.createEl('p', {
      text: this.file.path,
      cls: 'setting-item-description',
    });

    renderPdfControls(contentEl, this.draft, {
      allowInherit: true,
      inherited: effective,
      onChange: (patch) => {
        this.draft = normalizeFileSettings({ ...this.draft, ...patch });
        this.render();
      },
    });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('Save for this PDF')
          .setCta()
          .onClick(async () => {
            await this.plugin.setFileSettings(this.file.path, this.draft);
            new Notice('Fix PDF settings saved for this PDF.');
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Reset file settings')
          .onClick(async () => {
            await this.plugin.resetFileSettings(this.file.path);
            new Notice('Fix PDF settings reset for this PDF.');
            this.close();
          });
      });
  }
}

function renderPdfControls(containerEl, values, options) {
  const allowInherit = !!options.allowInherit;
  const inherited = options.inherited || DEFAULT_SETTINGS;
  const openMode = values.openMode === INHERIT ? inherited.openMode : values.openMode;

  addDropdownSetting(containerEl, {
    name: 'Zoom',
    desc: 'Choose the zoom applied when a PDF opens.',
    value: values.zoomMode,
    options: ZOOM_OPTIONS,
    allowInherit,
    inheritedValue: inherited.zoomMode,
    onChange: (zoomMode) => options.onChange({ zoomMode }),
  });

  addDropdownSetting(containerEl, {
    name: 'Sidebar panel',
    desc: 'Choose which PDF sidebar panel to select when a PDF opens.',
    value: values.sidebarMode,
    options: SIDEBAR_MODE_OPTIONS,
    allowInherit,
    inheritedValue: inherited.sidebarMode,
    onChange: (sidebarMode) => options.onChange({ sidebarMode }),
  });

  addDropdownSetting(containerEl, {
    name: 'Sidebar state',
    desc: 'Choose whether the PDF sidebar should open, close, or be left alone.',
    value: values.sidebarState,
    options: SIDEBAR_STATE_OPTIONS,
    allowInherit,
    inheritedValue: inherited.sidebarState,
    onChange: (sidebarState) => options.onChange({ sidebarState }),
  });

  addDropdownSetting(containerEl, {
    name: 'Start position',
    desc: 'Choose whether PDFs open at a page number or percentage through the document.',
    value: values.openMode,
    options: OPEN_MODE_OPTIONS,
    allowInherit,
    inheritedValue: inherited.openMode,
    onChange: (mode) => options.onChange({ openMode: mode }),
  });

  new Setting(containerEl)
    .setName('Start page')
    .setDesc('The page to open when start position is set to specific page.')
    .addText((text) => {
      text
        .setPlaceholder(String(inherited.openPage || 1))
        .setValue(String(values.openPage || ''))
        .onChange((value) => options.onChange({ openPage: parsePositiveInteger(value, values.openPage) }));
      text.inputEl.disabled = openMode !== OPEN_PAGE;
    });

  new Setting(containerEl)
    .setName('Start percentage')
    .setDesc('The percentage through the PDF to open when start position is set to percentage.')
    .addText((text) => {
      text
        .setPlaceholder(String(inherited.openPercent || 0))
        .setValue(String(values.openPercent ?? ''))
        .onChange((value) => options.onChange({ openPercent: parsePercent(value, values.openPercent) }));
      text.inputEl.disabled = openMode !== OPEN_PERCENT;
    });
}

function addDropdownSetting(containerEl, config) {
  new Setting(containerEl)
    .setName(config.name)
    .setDesc(config.desc)
    .addDropdown((dropdown) => {
      if (config.allowInherit) {
        dropdown.addOption(INHERIT, `Use global setting (${getOptionLabel(config.options, config.inheritedValue)})`);
      }
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

function getPdfPageCount(pdfViewer) {
  if (!pdfViewer) return 0;
  if (Number.isFinite(pdfViewer.pagesCount)) return pdfViewer.pagesCount;
  if (Array.isArray(pdfViewer._pages)) return pdfViewer._pages.length;
  return 0;
}

function getPdfFilePath(view) {
  return (view.file && view.file.path) || (view.getState && view.getState().file) || '__no_file__';
}

function isPdfFile(file) {
  return !!file && String(file.extension || '').toLowerCase() === 'pdf';
}

function normalizeOption(value, options, fallback, allowInherit) {
  if (allowInherit && value === INHERIT) return INHERIT;
  const valid = new Set(options.map(([option]) => option));
  return valid.has(value) ? value : fallback;
}

function getOptionLabel(options, value) {
  const option = options.find(([optionValue]) => optionValue === value);
  return option ? option[1] : value;
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

function clampPage(page, pagesCount) {
  const parsed = parsePositiveInteger(page, 1);
  if (!pagesCount || pagesCount < 1) return parsed;
  return Math.min(pagesCount, Math.max(1, parsed));
}

FixPdfPlugin.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
FixPdfPlugin.DEFAULT_FILE_SETTINGS = DEFAULT_FILE_SETTINGS;
FixPdfPlugin.normalizeSettings = normalizeSettings;
FixPdfPlugin.normalizeFileSettings = normalizeFileSettings;
FixPdfPlugin.getEffectivePdfOptions = getEffectivePdfOptions;
FixPdfPlugin.getTargetPage = getTargetPage;

module.exports = FixPdfPlugin;
