/**
 * Sidebar Component
 * Manages source links display and conversation history in sidebar
 */

class Sidebar {
  constructor(options = {}) {
    this.sourceLinksContainer = options.sourceLinksContainer || 
      document.getElementById('source-links-container');
    
    // Initialize with default message
    this.initialize();
  }

  /**
   * Initialize the sidebar component
   */
  initialize() {
    if (!this.sourceLinksContainer) {
      console.error('Source links container not found');
      return;
    }
    
    // Show initial message
    this.showNoSourcesMessage();
  }

  /**
   * Update source links in sidebar
   * @param {Array} sources - Array of source objects with title and url
   */
  updateSourceLinks(sources) {
    if (!this.sourceLinksContainer) {
      console.error('Source links container not found');
      return;
    }

    // If no sources provided or empty array, show message
    if (!sources || sources.length === 0) {
      this.showNoSourcesMessage();
      return;
    }

    // Clear container
    this.sourceLinksContainer.innerHTML = '';

    // Create links for each source
    sources.forEach((source, index) => {
      const url = source.url || source.link || '#';
      const title = source.title || 'Untitled Document';
      const snippet = source.snippet || '';
      
      // Check if this is a PDF
      const isPDF = url.includes('.pdf') || url.includes('storage.cloud.google.com') || url.includes('storage.googleapis.com');
      
      const link = document.createElement('a');
      link.className = 'sidebar-source-link';
      link.setAttribute('aria-label', `Source ${index + 1}: ${title}`);
      
      if (isPDF) {
        link.href = '#';
        link.classList.add('pdf-source');
        link.addEventListener('click', (e) => {
          e.preventDefault();
          if (window.pdfViewer) {
            window.pdfViewer.open(url, snippet, title);
          } else {
            window.open(url, '_blank');
          }
        });
      } else {
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined source-icon';
      icon.textContent = isPDF ? 'description' : 'link';
      
      const titleSpan = document.createElement('span');
      titleSpan.className = 'source-title';
      titleSpan.textContent = title; // textContent automatically escapes HTML
      
      link.appendChild(icon);
      link.appendChild(titleSpan);
      this.sourceLinksContainer.appendChild(link);
    });
  }

  /**
   * Show message when no sources are available
   */
  showNoSourcesMessage() {
    if (!this.sourceLinksContainer) return;
    
    this.sourceLinksContainer.innerHTML = 
      '<p class="no-sources-message">No sources available for this response.</p>';
  }

  /**
   * Escape HTML to prevent XSS attacks
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Clear all source links
   */
  clear() {
    this.showNoSourcesMessage();
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    this.clear();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Sidebar;
}
