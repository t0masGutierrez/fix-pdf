# Fit PDF

<p align="center">
  <img src="assets/logo.png" width="128" alt="Fit PDF icon">
</p>

Fit PDF is an Obsidian plugin that opens PDF files using Fit Height by default instead of Fit Width.

Obsidian's built-in PDF viewer currently initializes PDFs at `page-width`. This plugin switches newly opened PDFs to `page-height`, so an entire page fits vertically in the reading pane.

## Features

- Sets newly opened PDF views to Fit Height.
- Applies only once per opened PDF file, so manual zoom changes afterward are not repeatedly overridden.

## Development

Validate the plugin files:

```bash
npm ci
npm test
```

`package-lock.json` is committed so GitHub and local installs use reproducible dependency resolution.

## Release

Obsidian only downloads supported release assets. For this plugin, a release should upload:

- `main.js`
- `manifest.json`

Keep `versions.json` in the repository root for Obsidian metadata, but do not upload it as a release asset.

New releases are automated by `.github/workflows/release.yml`. To publish, bump the version in `manifest.json`, `package.json`, and `versions.json`, commit the changes, then push an exact SemVer tag with no leading `v`:

```bash
git tag 1.0.1
git push origin master 1.0.1
```

The workflow validates the files, creates the GitHub release, uploads only supported assets, and creates a GitHub artifact attestation for `main.js`.
