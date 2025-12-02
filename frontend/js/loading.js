/**
 * Loading State Manager
 * Centralized management of loading indicators across the application
 * 
 * Usage:
 * 
 * // Initialize the loading manager
 * const loadingManager = new LoadingManager({
 *   mainLoadingIndicator: document.getElementById('loading-indicator')
 * });
 * 
 * // Show loading for query processing
 * const queryOpId = loadingManager.showQueryLoading({ queryInput: queryInputInstance });
 * 
 * // Show loading for regeneration
 * const regenOpId = loadingManager.showRegenerationLoading(entryElement);
 * 
 * // Show loading for modification
 * const modOpId = loadingManager.showModificationLoading(entryElement);
 * 
 * // Hide loading when done
 * loadingManager.hideLoading(queryOpId, { queryInput: queryInputInstance });
 * loadingManager.hideLoading(regenOpId, { entryElement: entryElement });
 * 
 * // Check if loading
 * if (loadingManager.isLoading()) {
 *   console.log('Operations in progress');
 * }
 * 
 * // Emergency cleanup
 * loadingManager.clearAll();
 */

class LoadingManager {
  constructor(options = {}) {
    // DOM elements
    this.mainLoadingIndicator = options.mainLoadingIndicator || document.getElementById('loading-indicator');
    
    // State tracking
    this.activeOperations = new Set(); // Track all active operations
    this.operationTypes = {
      QUERY: 'query',
      REGENERATION: 'regeneration',
      MODIFICATION: 'modification'
    };
    
    // Configuration
    this.loadingMessages = {
      query: 'Processing your query...',
      regeneration: 'Regenerating response...',
      modification: 'Modifying response...',
      default: 'Loading...'
    };
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize the loading manager
   */
  initialize() {
    if (!this.mainLoadingIndicator) {
      console.warn('Main loading indicator element not found');
    }
  }

  /**
   * Show loading state for query processing
   * @param {Object} options - Loading options
   * @returns {string} Operation ID
   */
  showQueryLoading(options = {}) {
    const operationId = this.generateOperationId('query');
    this.activeOperations.add(operationId);
    
    // Show main loading indicator
    this.showMainLoading(this.operationTypes.QUERY);
    
    // Disable query input if provided
    if (options.queryInput) {
      options.queryInput.setLoading(true);
    }
    
    return operationId;
  }

  /**
   * Show loading state for response regeneration
   * @param {HTMLElement} entryElement - The conversation entry element
   * @returns {string} Operation ID
   */
  showRegenerationLoading(entryElement) {
    const operationId = this.generateOperationId('regeneration');
    this.activeOperations.add(operationId);
    
    // Show loading indicator on the specific entry
    this.showEntryLoading(entryElement, this.operationTypes.REGENERATION);
    
    return operationId;
  }

  /**
   * Show loading state for response modification
   * @param {HTMLElement} entryElement - The conversation entry element
   * @returns {string} Operation ID
   */
  showModificationLoading(entryElement) {
    const operationId = this.generateOperationId('modification');
    this.activeOperations.add(operationId);
    
    // Show loading indicator on the specific entry
    this.showEntryLoading(entryElement, this.operationTypes.MODIFICATION);
    
    return operationId;
  }

  /**
   * Hide loading state for a specific operation
   * @param {string} operationId - The operation ID
   * @param {Object} options - Hide options
   */
  hideLoading(operationId, options = {}) {
    if (!operationId || !this.activeOperations.has(operationId)) {
      return;
    }
    
    this.activeOperations.delete(operationId);
    
    // Determine operation type from ID
    const operationType = this.getOperationTypeFromId(operationId);
    
    // Hide appropriate loading indicators
    if (operationType === this.operationTypes.QUERY) {
      // Only hide main loading if no other operations are active
      if (this.activeOperations.size === 0) {
        this.hideMainLoading();
      }
      
      // Re-enable query input if provided
      if (options.queryInput) {
        options.queryInput.setLoading(false);
      }
    } else if (operationType === this.operationTypes.REGENERATION || 
               operationType === this.operationTypes.MODIFICATION) {
      // Hide entry-specific loading
      if (options.entryElement) {
        this.hideEntryLoading(options.entryElement);
      }
    }
  }

  /**
   * Show main loading indicator
   * @param {string} operationType - Type of operation
   */
  showMainLoading(operationType) {
    if (!this.mainLoadingIndicator) return;
    
    // Update loading message
    const loadingText = this.mainLoadingIndicator.querySelector('.loading-text');
    if (loadingText) {
      loadingText.textContent = this.loadingMessages[operationType] || this.loadingMessages.default;
    }
    
    // Show the indicator
    this.mainLoadingIndicator.classList.remove('hidden');
    this.mainLoadingIndicator.setAttribute('role', 'status');
    this.mainLoadingIndicator.setAttribute('aria-busy', 'true');
  }

  /**
   * Hide main loading indicator
   */
  hideMainLoading() {
    if (!this.mainLoadingIndicator) return;
    
    this.mainLoadingIndicator.classList.add('hidden');
    this.mainLoadingIndicator.setAttribute('aria-busy', 'false');
  }

  /**
   * Show loading indicator on a conversation entry
   * @param {HTMLElement} entryElement - The entry element
   * @param {string} operationType - Type of operation
   */
  showEntryLoading(entryElement, operationType) {
    if (!entryElement) return;
    
    const responseElement = entryElement.querySelector('.conversation-response');
    if (!responseElement) return;
    
    // Add loading class
    responseElement.classList.add('loading');
    
    // Disable all action buttons
    const buttons = entryElement.querySelectorAll('.action-btn, .feedback-btn');
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.classList.add('disabled');
    });
    
    // Create and show loading indicator
    let loadingIndicator = entryElement.querySelector('.response-loading-indicator');
    if (!loadingIndicator) {
      loadingIndicator = this.createEntryLoadingIndicator(operationType);
      
      // Dim the response content
      const responseContent = responseElement.querySelector('.response-content');
      if (responseContent) {
        responseContent.style.opacity = '0.5';
      }
      
      // Insert at the beginning of the response
      responseElement.insertBefore(loadingIndicator, responseElement.firstChild);
    }
  }

  /**
   * Hide loading indicator on a conversation entry
   * @param {HTMLElement} entryElement - The entry element
   */
  hideEntryLoading(entryElement) {
    if (!entryElement) return;
    
    const responseElement = entryElement.querySelector('.conversation-response');
    if (!responseElement) return;
    
    // Remove loading class
    responseElement.classList.remove('loading');
    
    // Re-enable all action buttons
    const buttons = entryElement.querySelectorAll('.action-btn, .feedback-btn');
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('disabled');
    });
    
    // Remove loading indicator
    const loadingIndicator = entryElement.querySelector('.response-loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    
    // Restore content opacity
    const responseContent = responseElement.querySelector('.response-content');
    if (responseContent) {
      responseContent.style.opacity = '1';
    }
  }

  /**
   * Create a loading indicator element for an entry
   * @param {string} operationType - Type of operation
   * @returns {HTMLElement} Loading indicator element
   */
  createEntryLoadingIndicator(operationType) {
    const indicator = document.createElement('div');
    indicator.className = 'response-loading-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner-small';
    
    const text = document.createElement('span');
    text.className = 'loading-text-small';
    text.textContent = this.loadingMessages[operationType] || this.loadingMessages.default;
    
    indicator.appendChild(spinner);
    indicator.appendChild(text);
    
    return indicator;
  }

  /**
   * Check if any operations are currently active
   * @returns {boolean} True if operations are active
   */
  isLoading() {
    return this.activeOperations.size > 0;
  }

  /**
   * Check if a specific operation type is active
   * @param {string} operationType - Type of operation
   * @returns {boolean} True if operation type is active
   */
  isOperationActive(operationType) {
    for (const operationId of this.activeOperations) {
      if (operationId.startsWith(operationType)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate a unique operation ID
   * @param {string} operationType - Type of operation
   * @returns {string} Operation ID
   */
  generateOperationId(operationType) {
    return `${operationType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get operation type from operation ID
   * @param {string} operationId - Operation ID
   * @returns {string} Operation type
   */
  getOperationTypeFromId(operationId) {
    if (operationId.startsWith('query')) return this.operationTypes.QUERY;
    if (operationId.startsWith('regeneration')) return this.operationTypes.REGENERATION;
    if (operationId.startsWith('modification')) return this.operationTypes.MODIFICATION;
    return 'unknown';
  }

  /**
   * Clear all active operations (emergency cleanup)
   */
  clearAll() {
    this.activeOperations.clear();
    this.hideMainLoading();
    
    // Remove all entry loading indicators
    const allLoadingIndicators = document.querySelectorAll('.response-loading-indicator');
    allLoadingIndicators.forEach(indicator => indicator.remove());
    
    // Remove loading class from all responses
    const allResponses = document.querySelectorAll('.conversation-response');
    allResponses.forEach(response => {
      response.classList.remove('loading');
    });
    
    // Re-enable all buttons
    const allButtons = document.querySelectorAll('.action-btn, .feedback-btn');
    allButtons.forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('disabled');
    });
    
    // Restore all content opacity
    const allResponseContent = document.querySelectorAll('.response-content');
    allResponseContent.forEach(content => {
      content.style.opacity = '1';
    });
  }

  /**
   * Destroy the loading manager and clean up
   */
  destroy() {
    this.clearAll();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LoadingManager;
}
