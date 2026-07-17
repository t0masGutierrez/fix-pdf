const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

function createSettingMock() {
  return class SettingMock {
    constructor(containerEl) {
      this.containerEl = containerEl;
      if (containerEl && Array.isArray(containerEl.settings)) {
        containerEl.settings.push(this);
      }
    }

    setName(name) {
      this.name = name;
      return this;
    }

    setDesc(desc) {
      this.desc = desc;
      return this;
    }

    addDropdown(callback) {
      const dropdown = {
        options: [],
        addOption(value, label) {
          this.options.push([value, label]);
          return this;
        },
        setValue(value) {
          this.value = value;
          return this;
        },
        onChange(handler) {
          this.changeHandler = handler;
          return this;
        },
      };
      callback(dropdown);
      this.dropdown = dropdown;
      return this;
    }

    addText(callback) {
      const listeners = {};
      const text = {
        inputEl: {
          disabled: false,
          value: '',
          addEventListener(eventName, handler) {
            listeners[eventName] = handler;
          },
        },
        listeners,
        setPlaceholder(value) {
          this.placeholder = value;
          return this;
        },
        setValue(value) {
          this.value = value;
          this.inputEl.value = value;
          return this;
        },
        onChange(handler) {
          this.changeHandler = handler;
          return this;
        },
      };
      callback(text);
      this.text = text;
      return this;
    }

    addButton(callback) {
      const button = {
        setButtonText(text) {
          this.text = text;
          return this;
        },
        setCta() {
          this.cta = true;
          return this;
        },
        onClick(handler) {
          this.clickHandler = handler;
          return this;
        },
      };
      callback(button);
      this.buttons = this.buttons || [];
      this.buttons.push(button);
      return this;
    }
  };
}

function createContentElMock() {
  return {
    emptyCount: 0,
    settings: [],
    empty() {
      this.emptyCount += 1;
      this.settings = [];
    },
    createEl() {
      return { style: {} };
    },
  };
}

function createModalMock(instances) {
  return class ModalMock {
    constructor() {
      this.contentEl = createContentElMock();
      instances.push(this);
    }

    open() {
      this.onOpen();
    }

    close() {}
  };
}

function createMenuMock() {
  const menu = {
    item: null,
    addItem(callback) {
      const item = {
        setSection(section) {
          this.section = section;
          return this;
        },
        setTitle(title) {
          this.title = title;
          return this;
        },
        setIcon(icon) {
          this.icon = icon;
          return this;
        },
        onClick(handler) {
          this.clickHandler = handler;
          return this;
        },
      };
      callback(item);
      this.item = item;
    },
  };
  return menu;
}

function loadPlugin(overrides = {}) {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'obsidian') {
      return {
        Modal: overrides.Modal || class {},
        Notice: overrides.Notice || class {},
        Plugin: class {},
        PluginSettingTab: class {},
        Setting: overrides.Setting || class {},
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve('../src/main.js')];
    return require('../src/main.js');
  } finally {
    Module._load = originalLoad;
  }
}

function renderControls(Plugin, values, onChange) {
  const containerEl = { settings: [] };
  Plugin.renderPdfControls(containerEl, values, {
    inherited: values,
    onChange,
  });
  return containerEl;
}

function getTextSetting(containerEl, name) {
  return containerEl.settings.find((setting) => setting.name === name).text;
}

test('per-file settings override global pdf defaults', () => {
  const Plugin = loadPlugin();
  const settings = Plugin.normalizeSettings({
    zoomMode: 'page-height',
    sidebarMode: 'none',
    sidebarState: 'leave',
    openMode: 'page',
    openPage: 5,
    files: {
      'books/example.pdf': {
        zoomMode: 'page-width',
        sidebarMode: 'reveal',
        sidebarState: 'open',
        openMode: 'percent',
        openPercent: 75,
      },
    },
  });

  assert.deepEqual(Plugin.getEffectivePdfOptions(settings, 'books/example.pdf'), {
    zoomMode: 'page-width',
    sidebarMode: 'reveal',
    sidebarState: 'open',
    openMode: 'percent',
    openPage: 5,
    openPercent: 75,
  });
});

test('per-file edit draft starts from effective pdf settings', () => {
  const Plugin = loadPlugin();
  const settings = Plugin.normalizeSettings({
    zoomMode: 'page-width',
    sidebarMode: 'toc',
    sidebarState: 'closed',
    openMode: 'percent',
    openPage: 12,
    openPercent: 35,
    files: {
      'books/custom.pdf': {
        zoomMode: 'inherit',
        sidebarMode: 'thumbnails',
        sidebarState: 'inherit',
        openMode: 'page',
        openPage: 48,
        openPercent: null,
      },
    },
  });

  assert.deepEqual(Plugin.getFileSettingsDraft(settings, 'books/new.pdf'), {
    zoomMode: 'page-width',
    sidebarMode: 'toc',
    sidebarState: 'closed',
    openMode: 'percent',
    openPage: 1,
    openPercent: 35,
  });

  assert.deepEqual(Plugin.getFileSettingsDraft(settings, 'books/custom.pdf'), {
    zoomMode: 'page-width',
    sidebarMode: 'thumbnails',
    sidebarState: 'closed',
    openMode: 'page',
    openPage: 48,
    openPercent: 0,
  });
  assert(!Object.values(Plugin.getFileSettingsDraft(settings, 'books/custom.pdf')).includes('inherit'));
});

test('numeric inputs allow empty edits and reset to one on blur', () => {
  const changes = [];
  const Plugin = loadPlugin({ Setting: createSettingMock() });

  const pageControls = renderControls(Plugin, {
    zoomMode: 'page-height',
    sidebarMode: 'none',
    sidebarState: 'closed',
    openMode: 'page',
    openPage: 14,
    openPercent: 50,
  }, (patch) => changes.push(patch));
  const pageText = getTextSetting(pageControls, 'Start page');
  pageText.inputEl.value = '';
  if (pageText.changeHandler) pageText.changeHandler('');
  assert.deepEqual(changes, []);

  pageText.listeners.blur();
  assert.equal(pageText.inputEl.value, '1');
  assert.deepEqual(changes, [{ openPage: 1 }]);

  changes.length = 0;
  const percentControls = renderControls(Plugin, {
    zoomMode: 'page-height',
    sidebarMode: 'none',
    sidebarState: 'closed',
    openMode: 'percent',
    openPage: 14,
    openPercent: 50,
  }, (patch) => changes.push(patch));
  const percentText = getTextSetting(percentControls, 'Start percentage');
  percentText.inputEl.value = '';
  if (percentText.changeHandler) percentText.changeHandler('');
  assert.deepEqual(changes, []);

  percentText.listeners.blur();
  assert.equal(percentText.inputEl.value, '1');
  assert.deepEqual(changes, [{ openPercent: 1 }]);
});

test('start page navigates by pdf page index instead of visible page label', () => {
  const Plugin = loadPlugin();
  const plugin = Object.create(Plugin.prototype);
  const dispatched = [];
  const scrolled = [];
  const pdfViewer = {
    pagesCount: 1584,
    currentPageNumber: 1,
    scrollPageIntoView(options) {
      scrolled.push(options);
    },
  };
  const eventBus = {
    dispatch(name, payload) {
      dispatched.push([name, payload]);
      if (name === 'pagenumberchanged' && payload.value === '534') {
        pdfViewer.currentPageNumber = 588;
      }
    },
  };

  plugin.applyStartPosition(pdfViewer, eventBus, {
    openMode: 'page',
    openPage: 534,
  });

  assert.equal(pdfViewer.currentPageNumber, 534);
  assert.deepEqual(scrolled, [{ pageNumber: 534 }]);
  assert.deepEqual(dispatched.filter(([name]) => name === 'pagenumberchanged'), []);
});

test('delayed sidebar reapply does not close a sidebar the user opened', () => {
  const Plugin = loadPlugin();
  const plugin = Object.create(Plugin.prototype);
  const sidebar = {
    isOpen: true,
    active: 1,
    calls: [],
    switchView(view, force) {
      this.calls.push([view, force]);
      this.isOpen = view !== 0;
    },
  };
  const obsidianPdfViewer = { pdfSidebar: sidebar };
  const eventBus = { dispatch() {} };
  const options = {
    sidebarMode: 'none',
    sidebarState: 'closed',
  };

  plugin.applySidebar(obsidianPdfViewer, eventBus, options, true);
  assert.deepEqual(sidebar.calls, [[0, true]]);

  sidebar.isOpen = true;
  plugin.applySidebar(obsidianPdfViewer, eventBus, options, false);
  assert.deepEqual(sidebar.calls, [[0, true]]);
});

test('duplicate pending pdf applies do not close sidebar twice', () => {
  const Plugin = loadPlugin();
  const plugin = Object.create(Plugin.prototype);
  const originalWindow = global.window;
  const timers = [];
  global.window = {
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
  };

  try {
    plugin.applied = new WeakMap();
    plugin.settings = Plugin.normalizeSettings({
      zoomMode: 'none',
      sidebarMode: 'none',
      sidebarState: 'closed',
      openMode: 'none',
      openPage: 1,
      openPercent: 0,
    });
    const leaf = {};
    const sidebar = {
      isOpen: true,
      active: 1,
      calls: [],
      switchView(view, force) {
        this.calls.push([view, force]);
        this.isOpen = view !== 0;
      },
    };
    const viewerChild = {
      pdfViewer: {
        pdfViewer: { pagesCount: 100 },
        eventBus: { dispatch() {} },
        pdfSidebar: sidebar,
      },
    };

    plugin.applyToViewerChild(leaf, 'books/example.pdf:0', 'books/example.pdf', viewerChild);
    plugin.applyToViewerChild(leaf, 'books/example.pdf:0', 'books/example.pdf', viewerChild);
    const initialApplies = timers.filter((timer) => timer.delay === 0);

    for (const timer of initialApplies) {
      timer.callback();
    }

    assert.deepEqual(sidebar.calls, [[0, true]]);
  } finally {
    global.window = originalWindow;
  }
});

test('delayed pdf apply retries start position without reclosing sidebar', () => {
  const Plugin = loadPlugin();
  const plugin = Object.create(Plugin.prototype);
  const originalWindow = global.window;
  const timers = [];
  global.window = {
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
  };

  try {
    let startAttempts = 0;
    plugin.applied = new WeakMap();
    plugin.settings = Plugin.normalizeSettings({
      zoomMode: 'page-height',
      sidebarMode: 'none',
      sidebarState: 'closed',
      openMode: 'page',
      openPage: 544,
      openPercent: 0,
    });
    plugin.applyStartPosition = () => {
      startAttempts += 1;
      return startAttempts > 1;
    };
    const leaf = {};
    const sidebar = {
      isOpen: true,
      active: 1,
      calls: [],
      switchView(view, force) {
        this.calls.push([view, force]);
        this.isOpen = view !== 0;
      },
    };
    const viewerChild = {
      pdfViewer: {
        pdfViewer: { pagesCount: 1000 },
        eventBus: { dispatch() {} },
        pdfSidebar: sidebar,
      },
    };

    plugin.applyToViewerChild(leaf, 'books/calculus.pdf:0', 'books/calculus.pdf', viewerChild);
    timers.find((timer) => timer.delay === 0).callback();
    assert.equal(startAttempts, 1);
    assert.deepEqual(sidebar.calls, [[0, true]]);

    sidebar.isOpen = true;
    timers.find((timer) => timer.delay === 250).callback();
    assert.equal(startAttempts, 2);
    assert.deepEqual(sidebar.calls, [[0, true]]);
  } finally {
    global.window = originalWindow;
  }
});

test('pdf start position retries if the viewer restores a different page after first apply', () => {
  const Plugin = loadPlugin();
  const plugin = Object.create(Plugin.prototype);
  const originalWindow = global.window;
  const timers = [];
  global.window = {
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
  };

  try {
    let startAttempts = 0;
    plugin.applied = new WeakMap();
    plugin.pending = new WeakMap();
    plugin.settings = Plugin.normalizeSettings({
      zoomMode: 'page-height',
      sidebarMode: 'none',
      sidebarState: 'closed',
      openMode: 'page',
      openPage: 754,
      openPercent: 0,
    });
    const pdfViewer = { pagesCount: 1205, currentPageNumber: 1 };
    plugin.applyStartPosition = () => {
      startAttempts += 1;
      pdfViewer.currentScaleValue = 'page-height';
      pdfViewer.currentPageNumber = 754;
      return true;
    };
    const leaf = {};
    const viewerChild = {
      pdfViewer: {
        pdfViewer,
        eventBus: { dispatch() {} },
        pdfSidebar: { switchView() {} },
      },
    };

    plugin.applyToViewerChild(leaf, 'books/calculus/thomas calculus.pdf:0', 'books/calculus/thomas calculus.pdf', viewerChild);
    timers.find((timer) => timer.delay === 0).callback();
    pdfViewer.currentPageNumber = 1;
    timers.find((timer) => timer.delay === 250).callback();

    assert.equal(startAttempts, 2);
    assert.equal(pdfViewer.currentPageNumber, 754);
  } finally {
    global.window = originalWindow;
  }
});

test('delayed pdf apply reapplies zoom after viewer history restores fit width', () => {
  const Plugin = loadPlugin();
  const plugin = Object.create(Plugin.prototype);
  const originalWindow = global.window;
  const timers = [];
  global.window = {
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
  };

  try {
    const pdfViewer = {
      pagesCount: 1308,
      currentPageNumber: 1,
      currentScaleValue: 'page-width',
      updateScale() {},
      update() {},
    };
    plugin.applied = new WeakMap();
    plugin.pending = new WeakMap();
    plugin.settings = Plugin.normalizeSettings({
      zoomMode: 'page-height',
      sidebarMode: 'none',
      sidebarState: 'closed',
      openMode: 'page',
      openPage: 832,
      openPercent: 0,
    });
    plugin.applyStartPosition = () => {
      pdfViewer.currentPageNumber = 832;
      return true;
    };
    const leaf = {};
    const viewerChild = {
      pdfViewer: {
        pdfViewer,
        eventBus: { dispatch() {} },
        pdfSidebar: { switchView() {} },
      },
    };

    plugin.applyToViewerChild(leaf, 'books/calculus/stewart calculus.pdf:0', 'books/calculus/stewart calculus.pdf', viewerChild);
    timers.find((timer) => timer.delay === 0).callback();
    assert.equal(pdfViewer.currentScaleValue, 'page-height');

    pdfViewer.currentScaleValue = 'page-width';
    timers.find((timer) => timer.delay === 250).callback();

    assert.equal(pdfViewer.currentScaleValue, 'page-height');
  } finally {
    global.window = originalWindow;
  }
});

test('user scroll after start page lands cancels delayed start retries', () => {
  const Plugin = loadPlugin();
  const plugin = Object.create(Plugin.prototype);
  const originalWindow = global.window;
  const timers = [];
  global.window = {
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
  };

  try {
    let startAttempts = 0;
    const listeners = {};
    const containerEl = {
      addEventListener(eventName, handler) {
        listeners[eventName] = handler;
      },
      removeEventListener(eventName, handler) {
        if (listeners[eventName] === handler) {
          delete listeners[eventName];
        }
      },
    };
    const pdfViewer = { pagesCount: 1205, currentPageNumber: 1 };
    plugin.applied = new WeakMap();
    plugin.pending = new WeakMap();
    plugin.settings = Plugin.normalizeSettings({
      zoomMode: 'page-height',
      sidebarMode: 'none',
      sidebarState: 'closed',
      openMode: 'page',
      openPage: 754,
      openPercent: 0,
    });
    plugin.applyStartPosition = () => {
      startAttempts += 1;
      pdfViewer.currentPageNumber = 754;
      return true;
    };
    const leaf = {};
    const applyKey = 'books/calculus/thomas calculus.pdf:0';
    const viewerChild = {
      containerEl,
      pdfViewer: {
        pdfViewer,
        eventBus: { dispatch() {} },
        pdfSidebar: { switchView() {} },
      },
    };

    plugin.applyToViewerChild(leaf, applyKey, 'books/calculus/thomas calculus.pdf', viewerChild);
    timers.find((timer) => timer.delay === 0).callback();
    assert.equal(typeof listeners.wheel, 'function');

    pdfViewer.currentPageNumber = 757;
    pdfViewer.currentScaleValue = 'page-width';
    listeners.wheel({ isTrusted: true });
    timers.find((timer) => timer.delay === 250).callback();

    assert.equal(startAttempts, 1);
    assert.equal(pdfViewer.currentScaleValue, 'page-height');
    assert.equal(plugin.applied.get(leaf), undefined);
    timers.find((timer) => timer.delay === 10000).callback();
    assert.equal(plugin.applied.get(leaf), applyKey);
  } finally {
    global.window = originalWindow;
  }
});

test('restored inactive pdf tab waits until active before applying start position', () => {
  const Plugin = loadPlugin();
  const plugin = Object.create(Plugin.prototype);
  const originalWindow = global.window;
  const timers = [];
  global.window = {
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
  };

  try {
    const activeLeaf = {};
    const restoredLeaf = {};
    const pdfViewer = {
      pagesCount: 1000,
      currentPageNumber: 1,
      scrollPageIntoView() {},
    };
    plugin.app = { workspace: { activeLeaf } };
    plugin.applied = new WeakMap();
    plugin.settings = Plugin.normalizeSettings({
      zoomMode: 'none',
      sidebarMode: 'none',
      sidebarState: 'closed',
      openMode: 'page',
      openPage: 804,
      openPercent: 0,
    });
    const viewerChild = {
      pdfViewer: {
        pdfViewer,
        eventBus: { dispatch() {} },
        pdfSidebar: { switchView() {} },
      },
    };

    plugin.applyToViewerChild(restoredLeaf, 'books/calculus/stewart calculus.pdf:0', 'books/calculus/stewart calculus.pdf', viewerChild);
    timers.find((timer) => timer.delay === 0).callback();
    assert.equal(pdfViewer.currentPageNumber, 1);
    assert.equal(plugin.applied.get(restoredLeaf), undefined);

    plugin.app.workspace.activeLeaf = restoredLeaf;
    plugin.applyToViewerChild(restoredLeaf, 'books/calculus/stewart calculus.pdf:0', 'books/calculus/stewart calculus.pdf', viewerChild);
    timers.filter((timer) => timer.delay === 0).at(-1).callback();
    assert.equal(pdfViewer.currentPageNumber, 804);
    assert.equal(plugin.applied.get(restoredLeaf), undefined);
    assert.equal(plugin.pending.get(restoredLeaf), 'books/calculus/stewart calculus.pdf:0');

    timers.filter((timer) => timer.delay === 10000).at(-1).callback();
    assert.equal(plugin.applied.get(restoredLeaf), 'books/calculus/stewart calculus.pdf:0');
  } finally {
    global.window = originalWindow;
  }
});

test('active pdf file is handled even when Obsidian reports the view type as markdown', () => {
  const Plugin = loadPlugin();
  const plugin = Object.create(Plugin.prototype);
  const originalWindow = global.window;
  const timers = [];
  global.window = {
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
  };

  try {
    const leaf = {
      view: {
        file: { path: 'books/calculus/thomas calculus.pdf', extension: 'pdf' },
        getViewType: () => 'markdown',
        viewer: {
          child: {
            pdfViewer: {
              pdfViewer: { pagesCount: 1205, currentPageNumber: 1 },
              eventBus: { dispatch() {} },
              pdfSidebar: { switchView() {} },
            },
          },
        },
      },
    };
    plugin.app = { workspace: { activeLeaf: leaf } };
    plugin.applied = new WeakMap();
    plugin.pending = new WeakMap();
    plugin.settings = Plugin.normalizeSettings({
      zoomMode: 'none',
      sidebarMode: 'none',
      sidebarState: 'closed',
      openMode: 'page',
      openPage: 754,
      openPercent: 0,
    });

    plugin.applyToLeaf(leaf);
    timers.find((timer) => timer.delay === 0).callback();

    assert.equal(leaf.view.viewer.child.pdfViewer.pdfViewer.currentPageNumber, 754);
  } finally {
    global.window = originalWindow;
  }
});

test('per-file dropdown changes keep modal focused in place', () => {
  const modals = [];
  const Plugin = loadPlugin({
    Modal: createModalMock(modals),
    Setting: createSettingMock(),
  });
  const plugin = Object.create(Plugin.prototype);
  plugin.app = {};
  plugin.settings = Plugin.normalizeSettings({
    zoomMode: 'page-height',
    sidebarMode: 'none',
    sidebarState: 'closed',
    openMode: 'page',
    openPage: 1,
    openPercent: 0,
  });
  const menu = createMenuMock();

  plugin.onFileMenu(menu, { path: 'books/example.pdf', extension: 'pdf' });
  menu.item.clickHandler();

  const modal = modals[0];
  assert.equal(modal.contentEl.emptyCount, 1);
  const zoom = modal.contentEl.settings.find((setting) => setting.name === 'Zoom').dropdown;
  zoom.changeHandler('page-width');

  assert.equal(modal.draft.zoomMode, 'page-width');
  assert.equal(modal.contentEl.emptyCount, 1);
});

test('per-file start position dropdown toggles fields without rebuilding modal', () => {
  const modals = [];
  const Plugin = loadPlugin({
    Modal: createModalMock(modals),
    Setting: createSettingMock(),
  });
  const plugin = Object.create(Plugin.prototype);
  plugin.app = {};
  plugin.settings = Plugin.normalizeSettings({
    zoomMode: 'page-height',
    sidebarMode: 'none',
    sidebarState: 'closed',
    openMode: 'page',
    openPage: 1,
    openPercent: 0,
  });
  const menu = createMenuMock();

  plugin.onFileMenu(menu, { path: 'books/example.pdf', extension: 'pdf' });
  menu.item.clickHandler();

  const modal = modals[0];
  const startPosition = modal.contentEl.settings.find((setting) => setting.name === 'Start position').dropdown;
  const startPage = getTextSetting(modal.contentEl, 'Start page');
  const startPercentage = getTextSetting(modal.contentEl, 'Start percentage');
  assert.equal(startPage.inputEl.disabled, false);
  assert.equal(startPercentage.inputEl.disabled, true);
  assert.equal(startPercentage.inputEl.value, '0');

  startPosition.changeHandler('percent');

  assert.equal(modal.draft.openMode, 'percent');
  assert.equal(modal.contentEl.emptyCount, 1);
  assert.equal(startPage.inputEl.disabled, true);
  assert.equal(startPage.inputEl.value, '1');
  assert.equal(startPercentage.inputEl.disabled, false);

  startPercentage.inputEl.value = '30';
  startPercentage.listeners.blur();
  assert.equal(modal.draft.openPercent, 30);

  startPosition.changeHandler('page');

  assert.equal(modal.draft.openMode, 'page');
  assert.equal(modal.draft.openPercent, 0);
  assert.equal(startPercentage.inputEl.disabled, true);
  assert.equal(startPercentage.inputEl.value, '0');
  assert.equal(startPage.inputEl.disabled, false);

  startPage.inputEl.value = '544';
  startPage.listeners.blur();
  assert.equal(modal.draft.openPage, 544);

  startPosition.changeHandler('none');

  assert.equal(modal.draft.openMode, 'none');
  assert.equal(modal.draft.openPage, 1);
  assert.equal(modal.draft.openPercent, 0);
  assert.equal(startPage.inputEl.disabled, true);
  assert.equal(startPage.inputEl.value, '1');
  assert.equal(startPercentage.inputEl.disabled, true);
  assert.equal(startPercentage.inputEl.value, '0');
});

test('per-file modal action copy is concise', async () => {
  const modals = [];
  const notices = [];
  const Plugin = loadPlugin({
    Modal: createModalMock(modals),
    Notice: class NoticeMock {
      constructor(message) {
        notices.push(message);
      }
    },
    Setting: createSettingMock(),
  });
  const plugin = Object.create(Plugin.prototype);
  plugin.app = {};
  plugin.settings = Plugin.normalizeSettings({
    zoomMode: 'page-height',
    sidebarMode: 'none',
    sidebarState: 'closed',
    openMode: 'page',
    openPage: 1,
    openPercent: 0,
  });
  let savedFilePath = null;
  plugin.setFileSettings = async (filePath) => {
    savedFilePath = filePath;
  };
  plugin.resetFileSettings = async () => {};
  const menu = createMenuMock();

  plugin.onFileMenu(menu, { path: 'books/example.pdf', extension: 'pdf' });
  menu.item.clickHandler();

  const actionButtons = modals[0].contentEl.settings.find((setting) => setting.buttons).buttons;
  assert.deepEqual(actionButtons.map((button) => button.text), ['Save PDF', 'Reset PDF']);

  await actionButtons[0].clickHandler();

  assert.equal(savedFilePath, 'books/example.pdf');
  assert.deepEqual(notices, ['Saved PDF settings']);
});

test('percentage start position maps to a clamped page number', () => {
  const Plugin = loadPlugin();

  assert.equal(
    Plugin.getTargetPage({ openMode: 'percent', openPercent: 0 }, 200),
    1,
  );
  assert.equal(
    Plugin.getTargetPage({ openMode: 'percent', openPercent: 50 }, 201),
    101,
  );
  assert.equal(
    Plugin.getTargetPage({ openMode: 'percent', openPercent: 100 }, 200),
    200,
  );
});

test('invalid settings normalize back to safe defaults', () => {
  const Plugin = loadPlugin();

  assert.deepEqual(Plugin.normalizeSettings({
    zoomMode: 'sideways',
    sidebarMode: 'wat',
    sidebarState: 'wat',
    openMode: 'wat',
    openPage: -10,
    openPercent: 'many',
  }), Plugin.DEFAULT_SETTINGS);
});

test('settings copy uses concise page wording', () => {
  const Plugin = loadPlugin();

  assert.deepEqual(Plugin.UI_COPY.openModeOptions.map(([, label]) => label), [
    'None',
    'Page number',
    'Page percentage',
  ]);
  assert.deepEqual(Plugin.UI_COPY.zoomOptions.map(([, label]) => label), [
    'Fit height',
    'Fit width',
    'Default',
  ]);
  assert.deepEqual(Plugin.UI_COPY.sidebarStateOptions.map(([, label]) => label), [
    'Default',
    'Open',
    'Closed',
  ]);

  assert.deepEqual(Plugin.UI_COPY.descriptions, {
    zoom: 'Choose the zoom applied when a PDF opens.',
    sidebarPanel: 'Choose the PDF sidebar panel when a PDF opens.',
    sidebarState: 'Choose whether the PDF sidebar should open, close, or not change.',
    startPosition: 'Choose whether a PDF opens at a page number or page percentage.',
    startPage: 'The page number to open when start position is set to page number.',
    startPercentage: 'The page percentage to open when start position is set to page percentage.',
    perFileSettings: 'Use the Fix PDF option in an open PDF file menu to override these defaults for individual PDF.',
  });
});
