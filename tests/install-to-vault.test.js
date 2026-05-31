const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('install script copies only Obsidian-supported release assets', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-pdf-install-'));
  const vaultDir = path.join(tempDir, 'vault');
  const npmCacheDir = path.join(tempDir, 'npm-cache');
  fs.mkdirSync(vaultDir, { recursive: true });

  execFileSync('bash', ['scripts/install-to-vault.sh', vaultDir], {
    cwd: root,
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir,
    },
    stdio: 'pipe',
  });

  const pluginDir = path.join(vaultDir, '.obsidian', 'plugins', 'fit-pdf');
  assert.equal(fs.existsSync(path.join(pluginDir, 'main.js')), true);
  assert.equal(fs.existsSync(path.join(pluginDir, 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(pluginDir, 'versions.json')), false);
});

test('install script rejects the placeholder vault path', () => {
  assert.throws(
    () => execFileSync('bash', ['scripts/install-to-vault.sh', '/path/to/your/vault'], {
      cwd: root,
      stdio: 'pipe',
    }),
    /Command failed/,
  );
});
