# Fit PDF

Fit PDF is an Obsidian plugin that opens PDF files using Fit Height by default instead of Fit Width.

Obsidian's built-in PDF viewer currently initializes PDFs at `page-width`. This plugin switches newly opened PDFs to PDF.js `page-height`, so an entire page fits vertically in the reading pane.

## Features

- Sets newly opened PDF views to Fit Height.
- Applies only once per opened PDF file, so manual zoom changes afterward are not repeatedly overridden.

## Installation

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
