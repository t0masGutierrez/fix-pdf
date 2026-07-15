const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

test('release metadata matches the existing Obsidian community listing', () => {
  const manifest = readJson('manifest.json');
  const pkg = readJson('package.json');
  const versions = readJson('versions.json');

  assert.equal(manifest.id, 'fit-pdf');
  assert.equal(manifest.name, 'Fix PDF');
  assert.equal(pkg.name, 'fix-pdf');
  assert.equal(manifest.version, pkg.version);
  assert.equal(versions[pkg.version], manifest.minAppVersion);
});
