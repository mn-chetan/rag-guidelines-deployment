/**
 * URL Indexer Module
 * Handles indexing new URLs into the knowledge base
 */

class URLIndexer {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.form = document.getElementById('url-indexer-form');
    this.urlInput = document.getElementById('url-input');
    this.indexBtn = document.getElementById('index-btn');
    this.statusDiv = document.getElementById('index-status');
    this.urlsList = document.getElementById('indexed-urls-list');
    this.indexedURLs = this.loadIndexedURLs();

    this.init();
  }

  init() {
    // Set up form submission
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleIndexURL();
    });

    // Display existing indexed URLs
    this.renderIndexedURLs();
  }

  async handleIndexURL() {
    const url = this.urlInput.value.trim();

    if (!url) {
      this.showStatus('Please enter a URL', 'error');
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      this.showStatus('Please enter a valid URL (e.g., https://example.com)', 'error');
      return;
    }

    // Disable button during indexing
    this.setIndexing(true);
    this.showStatus('Scraping and indexing URL...', 'loading');

    try {
      const result = await this.apiClient.indexURL(url);

      if (result.status === 'success') {
        this.showStatus(
          '✓ Successfully indexed! Content will be searchable in ~5-10 minutes.',
          'success'
        );

        // Add to indexed URLs list
        this.addIndexedURL({
          url: result.url,
          file_path: result.file_path,
          timestamp: new Date().toISOString(),
          message: result.message
        });

        // Clear input
        this.urlInput.value = '';

        // Clear status after 5 seconds
        setTimeout(() => {
          this.hideStatus();
        }, 5000);

      } else {
        this.showStatus(`Error: ${result.message}`, 'error');
      }

    } catch (error) {
      console.error('Indexing error:', error);
      this.showStatus(`Failed to index: ${error.message}`, 'error');
    } finally {
      this.setIndexing(false);
    }
  }

  setIndexing(isIndexing) {
    this.indexBtn.disabled = isIndexing;
    this.urlInput.disabled = isIndexing;

    if (isIndexing) {
      this.indexBtn.classList.add('loading');
    } else {
      this.indexBtn.classList.remove('loading');
    }
  }

  showStatus(message, type) {
    this.statusDiv.textContent = message;
    this.statusDiv.className = `index-status ${type}`;
    this.statusDiv.classList.remove('hidden');
  }

  hideStatus() {
    this.statusDiv.classList.add('hidden');
  }

  addIndexedURL(urlData) {
    // Add to beginning of array
    this.indexedURLs.unshift(urlData);

    // Keep only last 10
    if (this.indexedURLs.length > 10) {
      this.indexedURLs = this.indexedURLs.slice(0, 10);
    }

    // Save to localStorage
    this.saveIndexedURLs();

    // Re-render list
    this.renderIndexedURLs();
  }

  renderIndexedURLs() {
    if (this.indexedURLs.length === 0) {
      this.urlsList.innerHTML = '<p class="no-urls-message">No URLs indexed yet.</p>';
      return;
    }

    const urlItems = this.indexedURLs.map((item, index) => {
      const url = new URL(item.url);
      const domain = url.hostname.replace('www.', '');
      const timeAgo = this.getTimeAgo(item.timestamp);

      return `
        <div class="indexed-url-item" data-index="${index}">
          <div class="indexed-url-header">
            <span class="indexed-url-domain">${this.escapeHtml(domain)}</span>
            <span class="indexed-url-time">${timeAgo}</span>
          </div>
          <a href="${this.escapeHtml(item.url)}"
             class="indexed-url-link"
             target="_blank"
             rel="noopener noreferrer"
             title="${this.escapeHtml(item.url)}">
            ${this.truncateURL(item.url, 40)}
          </a>
          <button class="remove-url-btn" data-index="${index}" aria-label="Remove URL">×</button>
        </div>
      `;
    }).join('');

    this.urlsList.innerHTML = urlItems;

    // Add event listeners for remove buttons
    this.urlsList.querySelectorAll('.remove-url-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.removeIndexedURL(index);
      });
    });
  }

  removeIndexedURL(index) {
    this.indexedURLs.splice(index, 1);
    this.saveIndexedURLs();
    this.renderIndexedURLs();
  }

  loadIndexedURLs() {
    try {
      const stored = localStorage.getItem('indexedURLs');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load indexed URLs:', error);
      return [];
    }
  }

  saveIndexedURLs() {
    try {
      localStorage.setItem('indexedURLs', JSON.stringify(this.indexedURLs));
    } catch (error) {
      console.error('Failed to save indexed URLs:', error);
    }
  }

  getTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
  }

  truncateURL(url, maxLength) {
    if (url.length <= maxLength) return this.escapeHtml(url);

    const start = url.substring(0, maxLength - 3);
    return this.escapeHtml(start) + '...';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
