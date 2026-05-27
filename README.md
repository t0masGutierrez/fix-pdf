# Fit PDF

<p align="center">
  <img src="assets/logo.png" width="128" alt="Fit PDF icon">
</p>

Fit PDF is an Obsidian plugin that opens PDF files with fit height enabled by default instead of fit width.

Obsidian's built-in PDF viewer currently initializes PDFs at `page-width`. This plugin switches newly opened PDFs to `page-height`, so an entire page fits vertically in the reading pane.

## Features

- Sets newly opened PDF views to fit height.
- Applies once per opened PDF file, so manual zoom changes afterward are not repeatedly overridden.

## Installation

To install, run these commands:

```bash
git clone https://github.com/t0masGutierrez/fit-pdf.git
cd fit-pdf
scripts/install-to-vault.sh "/path/to/your/vault"
```

This installs dependencies, builds the plugin, and copies into your vault.

Then reload Obsidian and enable Fit PDF from Community plugins.