/**
 * SuggestionChips - Edge LLM-powered semantic query suggestions
 * Shows related questions after user pauses typing (500ms debounce)
 */

class SuggestionChips {
  constructor(options) {
    this.inputElement = options.inputElement;
    this.apiClient = options.apiClient;
    this.onSuggestionClick = options.onSuggestionClick || (() => {});

    this.container = null;
    this.debounceTimer = null;
    this.debounceMs = options.debounceMs || 500; // Wait 500ms after last keystroke
    this.minQueryLength = options.minQueryLength || 5;
    this.isEnabled = true;
    this.isLoading = false;
    this.lastQuery = '';

    // Bound event handlers for cleanup
    this.boundHandleInput = this.handleInput.bind(this);
    this.boundHandleBlur = this.handleBlur.bind(this);
    this.boundHandleFocus = this.handleFocus.bind(this);

    this.initialize();
  }

  /**
   * Initialize the suggestion chips component
   */
  initialize() {
    if (!this.inputElement) {
      console.error('SuggestionChips: Input element not provided');
      return;
    }

    // Create chips container
    this.createContainer();

    // Set up event listeners
    this.inputElement.addEventListener('input', this.boundHandleInput);
    this.inputElement.addEventListener('blur', this.boundHandleBlur);
    this.inputElement.addEventListener('focus', this.boundHandleFocus);
  }

  /**
   * Create the suggestion chips container
   */
  createContainer() {
    this.container = document.createElement('div');
    this.container.className = 'suggestion-chips-container';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Related questions');
    this.container.style.display = 'none';

    // Insert after input wrapper
    const inputSection = this.inputElement.closest('.query-input-section');
    if (inputSection) {
      const queryForm = inputSection.querySelector('.query-form');
      if (queryForm) {
        queryForm.after(this.container);
      }
    }
  }

  /**
   * Handle input changes
   */
  handleInput() {
    if (!this.isEnabled) return;

    // Clear existing timer
    clearTimeout(this.debounceTimer);

    const query = this.inputElement.value.trim();

    // Hide if query too short
    if (query.length < this.minQueryLength) {
      this.hide();
      return;
    }

    // Don't re-fetch for the same query
    if (query === this.lastQuery) {
      return;
    }

    // Schedule suggestion fetch after debounce
    this.debounceTimer = setTimeout(() => {
      this.fetchSuggestions(query);
    }, this.debounceMs);
  }

  /**
   * Handle focus events
   */
  handleFocus() {
    // Re-show suggestions if we have them and query matches
    const query = this.inputElement.value.trim();
    if (query === this.lastQuery && this.container.childElementCount > 1) {
      this.container.style.display = 'flex';
    }
  }

  /**
   * Handle blur events - hide with delay to allow clicks
   */
  handleBlur() {
    setTimeout(() => {
      if (!this.container.matches(':hover')) {
        this.hide();
      }
    }, 200);
  }

  /**
   * Fetch suggestions from the backend API
   * @param {string} partialQuery
   */
  async fetchSuggestions(partialQuery) {
    if (this.isLoading) return;

    this.isLoading = true;
    this.showLoading();

    try {
      const response = await this.apiClient.post('/suggestions', {
        partial_query: partialQuery,
        context: 'auditing guidelines'
      });

      // Only render if query hasn't changed while we were fetching
      const currentQuery = this.inputElement.value.trim();
      if (currentQuery === partialQuery && response.suggestions && response.suggestions.length > 0) {
        this.lastQuery = partialQuery;
        this.render(response.suggestions);
      } else if (!response.suggestions || response.suggestions.length === 0) {
        this.hide();
      }
    } catch (error) {
      console.warn('Failed to fetch suggestions:', error);
      this.hide();
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Show loading state
   */
  showLoading() {
    this.container.innerHTML = `
      <span class="suggestion-label">Finding related questions...</span>
      <div class="suggestion-loading">
        <div class="suggestion-loading-dot"></div>
        <div class="suggestion-loading-dot"></div>
        <div class="suggestion-loading-dot"></div>
      </div>
    `;
    this.container.style.display = 'flex';
  }

  /**
   * Render suggestion chips
   * @param {Array<string>} suggestions
   */
  render(suggestions) {
    if (!suggestions || suggestions.length === 0) {
      this.hide();
      return;
    }

    this.container.innerHTML = `
      <span class="suggestion-label">Related:</span>
      ${suggestions.map((s, i) => `
        <button
          class="suggestion-chip"
          data-query="${this.escapeHtml(s)}"
          aria-label="Search: ${this.escapeHtml(s)}"
          tabindex="0"
        >
          <span class="suggestion-chip-text">${this.escapeHtml(s)}</span>
          <span class="suggestion-chip-icon material-symbols-outlined">arrow_forward</span>
        </button>
      `).join('')}
    `;

    // Add click handlers
    this.container.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleChipClick(chip.dataset.query);
      });

      // Handle keyboard navigation
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handleChipClick(chip.dataset.query);
        }
      });
    });

    this.container.style.display = 'flex';
  }

  /**
   * Handle suggestion chip click
   * @param {string} query
   */
  handleChipClick(query) {
    if (!query) return;

    // Fill input with query
    this.inputElement.value = query;
    this.inputElement.focus();

    // Trigger input event
    this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));

    // Hide chips
    this.hide();

    // Callback
    this.onSuggestionClick(query);
  }

  /**
   * Hide the suggestion chips
   */
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * Clear suggestions and reset state
   */
  clear() {
    this.hide();
    this.lastQuery = '';
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Enable or disable suggestions
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      clearTimeout(this.debounceTimer);
      this.hide();
    }
  }

  /**
   * Clean up and destroy the component
   */
  destroy() {
    // Clear timer
    clearTimeout(this.debounceTimer);

    // Remove event listeners
    if (this.inputElement) {
      this.inputElement.removeEventListener('input', this.boundHandleInput);
      this.inputElement.removeEventListener('blur', this.boundHandleBlur);
      this.inputElement.removeEventListener('focus', this.boundHandleFocus);
    }

    // Remove DOM element
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.container = null;
    this.lastQuery = '';
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SuggestionChips;
}
