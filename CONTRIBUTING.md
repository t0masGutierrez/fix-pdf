# Contributing

Thanks for helping improve Fit PDF.

## Local checks

Run these checks before opening a pull request or publishing a release:

```bash
npm ci
npm test
```

The build generates `main.js` from `src/main.js` and validates plugin metadata.

## Release assets

Obsidian releases should include only:

- `main.js`
- `manifest.json`
- `styles.css`, if the plugin adds styles

Do not upload `versions.json` as a release asset.
