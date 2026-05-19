# Fit PDF

Fit PDF is an Obsidian plugin that opens PDF files using Fit Height by default instead of Fit Width.

Obsidian's built-in PDF viewer currently tends to restore or initialize PDFs at `page-width`. This plugin switches newly opened PDF leaves to PDF.js `page-height`, so an entire page fits vertically in the reading pane.

## Features

- Sets newly opened PDF views to Fit Height.
- Updates saved PDF.js history entries from `page-width` to `page-height`.
- Applies only once per opened PDF leaf/file, so manual zoom changes afterward are not repeatedly overridden.
- Works per vault as a normal Obsidian community plugin.

## Installation

### Manual installation

1. Download or clone this repository.
2. Copy these files into your vault:

   ```text
   YOUR_VAULT/.obsidian/plugins/fit-pdf/main.js
   YOUR_VAULT/.obsidian/plugins/fit-pdf/manifest.json
   YOUR_VAULT/.obsidian/plugins/fit-pdf/versions.json
   ```

3. In Obsidian, open Settings -> Community plugins.
4. Turn off Restricted mode if needed.
5. Enable `Fit PDF`.
6. Reopen a PDF.

### BRAT installation

Until this plugin is accepted into the official community plugin list, you can install it with the BRAT plugin by adding this repository URL.

## Development

This plugin is intentionally dependency-free and ships as plain CommonJS JavaScript.

Validate the plugin files:

```bash
npm test
```

or directly:

```bash
node --check main.js
python3 -m json.tool manifest.json >/dev/null
python3 -m json.tool versions.json >/dev/null
```

## Release checklist

1. Update `manifest.json` version.
2. Update `versions.json`.
3. Commit changes.
4. Tag the release, for example:

   ```bash
   git tag 1.0.0
   git push origin main --tags
   ```

5. Create a GitHub release containing at least:
   - `main.js`
   - `manifest.json`
   - `versions.json`

## Notes

This plugin uses Obsidian/PDF.js internals because Obsidian does not currently expose a built-in PDF default zoom setting. If Obsidian later adds a supported API or setting for default PDF zoom, this plugin should migrate to that approach.

## License

MIT
