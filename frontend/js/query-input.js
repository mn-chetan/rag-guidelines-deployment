/**
 * Query Input Component
 * Handles user input, keyboard shortcuts, and suggestion integration
 */

class QueryInput {
  constructor(options = {}) {
    // DOM elements
    this.inputElement = options.inputElement || document.getElementById('query-input');
    this.formElement = options.formElement || document.getElementById('query-form');
    this.submitButton = options.submitButton || document.getElementById('submit-btn');
    this.loadingIndicator = options.loadingIndicator || document.getElementById('loading-indicator');
    
    // Dependencies
    this.onSubmit = options.onSubmit || (() => {});
    
    // State
    this.isLoading = false;
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize the query input component
   */
  initialize() {
    if (!this.inputElement || !this.formElement) {
      console.error('Query input elements not found');
      return;
    }

    // Set up event listeners
    this.setupEventListeners();
    
    // Auto-resize textarea
    this.setupAutoResize();
  }

  /**
   * Set up all event listeners
   */
  setupEventListeners() {
    // Form submission
    this.formElement.addEventListener('submit', (e) => this.handleSubmit(e));
    
    // Keyboard navigation
    this.inputElement.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  /**
   * Set up auto-resize for textarea
   */
  setupAutoResize() {
    this.inputElement.addEventListener('input', () => {
      // Reset height to auto to get the correct scrollHeight
      this.inputElement.style.height = 'auto';
      
      // Set height to scrollHeight (content height)
      const maxHeight = 200; // Match CSS max-height
      const newHeight = Math.min(this.inputElement.scrollHeight, maxHeight);
      this.inputElement.style.height = newHeight + 'px';
    });
  }

  /**
   * Handle form submission
   */
  handleSubmit(event) {
    event.preventDefault();
    
    const query = this.getValue().trim();
    
    // Don't submit empty queries
    if (!query || this.isLoading) {
      return;
    }
    
    // Call the submit callback
    this.onSubmit(query);
    
    // Clear input after submission
    this.clear();
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(event) {
    const key = event.key;
    
    // Enter key - submit query (without Shift)
    if (key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.handleSubmit(event);
      return;
    }
    
    // Escape key - clear input
    if (key === 'Escape') {
      event.preventDefault();
      this.clear();
      return;
    }
  }

  /**
   * Set loading state
   */
  setLoading(loading) {
    this.isLoading = loading;
    
    if (loading) {
      // Disable input and button
      this.inputElement.disabled = true;
      this.submitButton.disabled = true;
      
      // Show loading indicator
      if (this.loadingIndicator) {
        this.loadingIndicator.classList.remove('hidden');
      }
    } else {
      // Enable input and button
      this.inputElement.disabled = false;
      this.submitButton.disabled = false;
      
      // Hide loading indicator
      if (this.loadingIndicator) {
        this.loadingIndicator.classList.add('hidden');
      }
      
      // Focus input
      this.focus();
    }
  }

  /**
   * Get current input value
   */
  getValue() {
    return this.inputElement.value;
  }

  /**
   * Set input value
   */
  setValue(value) {
    this.inputElement.value = value;
    
    // Trigger input event for auto-resize
    this.inputElement.dispatchEvent(new Event('input'));
  }

  /**
   * Clear input
   */
  clear() {
    this.setValue('');
  }

  /**
   * Focus input
   */
  focus() {
    this.inputElement.focus();
  }

  /**
   * Move cursor to end of input
   */
  moveCursorToEnd() {
    const length = this.inputElement.value.length;
    this.inputElement.setSelectionRange(length, length);
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    // Remove event listeners would go here if we stored references
    // For now, the component will be garbage collected when the page unloads
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueryInput;
}
