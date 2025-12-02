/**
 * PDF Viewer Component
 * Simple iframe-based PDF viewer with split-pane layout
 */

class PDFViewer {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('pdf-viewer-container');
    this.onClose = options.onClose || (() => {});
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.initialize();
  }

  initialize() {
    if (!this.container) {
      console.error('PDF viewer container not found');
      return;
    }
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="pdf-viewer-header">
        <div class="pdf-viewer-title">
          <span class="pdf-icon">📄</span>
          <span class="pdf-title-text">Document Viewer</span>
        </div>
        <div class="pdf-viewer-controls">
          <button class="pdf-close-btn" id="pdf-close" aria-label="Close viewer">×</button>
        </div>
      </div>
      <div class="pdf-viewer-content" id="pdf-content">
        <iframe id="pdf-iframe" class="pdf-iframe"></iframe>
      </div>
    `;
  }

  handleKeyDown(e) {
    if (e.key === 'Escape' && this.isOpen()) {
      this.close();
    }
  }

  setupEventListeners() {
    const closeBtn = this.container.querySelector('#pdf-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
    
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Open PDF in viewer
   * @param {string} url - PDF URL (unused, using backend proxy)
   * @param {string} snippet - Text snippet (for future highlighting)
   * @param {string} title - Document title
   */
  open(url, snippet = '', title = 'Document') {
    // Use backend proxy to serve PDF (avoids CORS/auth issues)
    const pdfUrl = 'https://auditor-rag-api-438886470292.us-central1.run.app/pdf';
    
    this.updateTitle(title);
    this.show();
    
    const iframe = this.container.querySelector('#pdf-iframe');
    if (iframe) {
      iframe.src = pdfUrl;
    }
  }

  updateTitle(title) {
    const titleEl = this.container.querySelector('.pdf-title-text');
    if (titleEl) {
      titleEl.textContent = title;
    }
  }

  show() {
    this.container.classList.add('open');
    document.body.classList.add('pdf-viewer-open');
  }

  close() {
    this.container.classList.remove('open');
    document.body.classList.remove('pdf-viewer-open');
    
    const iframe = this.container.querySelector('#pdf-iframe');
    if (iframe) {
      iframe.src = '';
    }
    this.onClose();
  }

  isOpen() {
    return this.container.classList.contains('open');
  }

  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.close();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PDFViewer;
}
