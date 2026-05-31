const { Plugin } = require('obsidian');

const TARGET_SCALE = 'page-height';
const WIDTH_SCALE = 'page-width';
const PDF_HISTORY_KEY = 'pdfjs.history';

module.exports = class FitPdfPlugin extends Plugin {
  async onload() {
    this.applied = new WeakMap();

    this.patchPdfHistory();

    const applyAll = () => this.applyToOpenPdfLeaves();

    this.registerEvent(this.app.workspace.on('file-open', applyAll));
    this.registerEvent(this.app.workspace.on('layout-change', applyAll));
    this.registerEvent(this.app.workspace.on('active-leaf-change', applyAll));

    this.app.workspace.onLayoutReady(() => {
      applyAll();
      window.setTimeout(applyAll, 250);
      window.setTimeout(applyAll, 1000);
      window.setTimeout(applyAll, 2500);

      // Cheap safety net for PDFs restored/opened without a workspace event.
      // Each leaf/file is changed only once, so manual zoom changes afterward are not overridden.
      this.registerInterval(window.setInterval(applyAll, 2000));
    });
  }

  patchPdfHistory() {
    try {
      if (typeof this.app.loadLocalStorage !== 'function' || typeof this.app.saveLocalStorage !== 'function') return;

      const raw = this.app.loadLocalStorage(PDF_HISTORY_KEY);
      if (!raw) return;

      const history = JSON.parse(raw);
      if (!history || !Array.isArray(history.files)) return;

      let changed = false;
      for (const file of history.files) {
        if (file && file.zoom === WIDTH_SCALE) {
          file.zoom = TARGET_SCALE;
          changed = true;
        }
      }

      if (changed) {
        this.app.saveLocalStorage(PDF_HISTORY_KEY, JSON.stringify(history));
      }
    } catch (error) {
      console.warn('fit-pdf: could not patch PDF history', error);
    }
  }

  applyToOpenPdfLeaves() {
    for (const leaf of this.app.workspace.getLeavesOfType('pdf')) {
      this.applyToLeaf(leaf);
    }
  }

  applyToLeaf(leaf) {
    const view = leaf && leaf.view;
    if (!view || typeof view.getViewType !== 'function' || view.getViewType() !== 'pdf') return;

    const filePath = (view.file && view.file.path) || (view.getState && view.getState().file) || '__no_file__';
    if (this.applied.get(leaf) === filePath) return;

    const run = (viewerChild) => this.applyToViewerChild(leaf, filePath, viewerChild);

    try {
      if (view.viewer && typeof view.viewer.then === 'function') {
        view.viewer.then(run);
      } else if (view.viewer && view.viewer.child) {
        run(view.viewer.child);
      }
    } catch (error) {
      console.warn('fit-pdf: could not access PDF viewer', error);
    }
  }

  applyToViewerChild(leaf, filePath, viewerChild) {
    const obsidianPdfViewer = viewerChild && viewerChild.pdfViewer;
    const pdfViewer = obsidianPdfViewer && obsidianPdfViewer.pdfViewer;
    const eventBus = obsidianPdfViewer && obsidianPdfViewer.eventBus;

    if (!pdfViewer || !eventBus || this.applied.get(leaf) === filePath) return;

    const setFitHeight = () => {
      try {
        if (pdfViewer.currentScaleValue !== TARGET_SCALE) {
          pdfViewer.currentScaleValue = TARGET_SCALE;
        }
        if (typeof pdfViewer.updateScale === 'function') {
          pdfViewer.updateScale({ drawingDelay: 0 });
        }
        if (pdfViewer.currentScaleValue !== TARGET_SCALE) {
          eventBus.dispatch('scalechanged', {
            source: this,
            value: TARGET_SCALE,
          });
        }
        if (typeof pdfViewer.update === 'function') {
          pdfViewer.update();
        }
      } catch (error) {
        console.warn('fit-pdf: could not set PDF fit height', error);
      }
    };

    const scheduleFitHeight = () => {
      if (this.applied.get(leaf) === filePath) return;
      setFitHeight();
      window.setTimeout(setFitHeight, 250);
      window.setTimeout(setFitHeight, 1000);
      window.setTimeout(() => {
        setFitHeight();
        this.applied.set(leaf, filePath);
      }, 2500);
    };

    const readyPromise = pdfViewer.firstPagePromise || (pdfViewer._pagesCapability && pdfViewer._pagesCapability.promise);
    if (readyPromise && typeof readyPromise.then === 'function') {
      readyPromise.then(scheduleFitHeight).catch(scheduleFitHeight);
    } else {
      window.setTimeout(scheduleFitHeight, 0);
    }
  }
};
