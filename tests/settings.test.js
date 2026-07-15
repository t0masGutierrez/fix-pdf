const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

function loadPlugin() {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'obsidian') {
      return {
        Modal: class {},
        Notice: class {},
        Plugin: class {},
        PluginSettingTab: class {},
        Setting: class {},
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
