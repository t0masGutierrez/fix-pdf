const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('build writes main.js from source and validates metadata', () => {
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    stdio: 'pipe',
  });

  assert.equal(
    fs.readFileSync(path.join(root, 'main.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'src/main.js'), 'utf8'),
  );

  for (const file of ['manifest.json', 'versions.json']) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
  }
});
