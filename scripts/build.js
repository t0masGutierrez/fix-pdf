const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'main.js');
const output = path.join(root, 'main.js');

for (const file of [source, path.join(root, 'manifest.json'), path.join(root, 'versions.json')]) {
  if (!fs.existsSync(file)) {
    console.error(`Missing ${path.relative(root, file)}`);
    process.exit(1);
  }
}

execFileSync(process.execPath, ['--check', source], { stdio: 'inherit' });

for (const file of ['manifest.json', 'versions.json']) {
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

fs.copyFileSync(source, output);
