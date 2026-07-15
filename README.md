# Fix PDF

<p align="center">
  <img src="assets/logo.png" width="128" alt="Fix PDF icon">
</p>

Fix PDF is an Obsidian plugin for configuring how PDF files open in Obsidian.

By default, Obsidian initializes PDFs at `page-width`. Fix PDF changes the initial fit to height and adds defaults for the PDF sidebar and start position. You can also override those settings for individual PDFs from the open PDF file menu.

## Features

- Sets newly opened PDF views to fit height.
- Applies once per opened PDF file, so manual zoom changes afterward are not repeatedly overridden.
- Selects the PDF sidebar panel on open: none, thumbnails, table of contents, or reveal current page in table of contents.
- Opens or closes the PDF sidebar by default.
- Opens PDFs at a specific page or percentage through the document.
- Adds a per-file `Fix PDF` menu item for PDF-specific overrides.

## Installation

To install, run these commands:

```bash
git clone https://github.com/t0masGutierrez/fix-pdf.git
cd fix-pdf
scripts/install-to-vault.sh "/path/to/your/vault"
```

This installs dependencies, builds the plugin, and copies into your vault.

Then reload Obsidian and enable Fix PDF from Community plugins.
