/**
 * Response Actions Component
 * Handles response modification, regeneration, and feedback buttons
 */

class ResponseActions {
  constructor(options = {}) {
    // Dependencies
    this.apiClient = options.apiClient || null;
    this.conversation = options.conversation || null;
    
    // Configuration
    this.loadingClass = 'loading';
    this.activeClass = 'active';
    this.disabledClass = 'disabled';
    
    // State tracking
    this.activeOperations = new Map(); // Track ongoing operations by entry ID
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize the component
   */
  initialize() {
    // Set up event delegation for action buttons
    this.setupEventListeners();
  }

  /**
   * Set up event listeners using event delegation
   */
  setupEventListeners() {
    // Listen for clicks on the conversation display
    const conversationDisplay = document.getElementById('conversation-display');
    if (!conversationDisplay) {
      console.error('Conversation display element not found');
      return;
    }

    // Delegate all button clicks
    conversationDisplay.addEventListener('click', (event) => {
      const target = event.target;
      
      // Handle modification buttons
      if (target.classList.contains('modify-btn')) {
        event.preventDefault();
        this.handleModification(target);
        return;
      }
      
      // Handle regenerate button
      if (target.classList.contains('regenerate-btn')) {
        event.preventDefault();
        this.handleRegeneration(target);
        return;
      }
      
      // Feedback buttons are now handled by the Feedback component
      // No need to handle them here
    });
  }

  /**
   * Handle modification button click
   * @param {HTMLElement} button - The clicked button
   */
  async handleModification(button) {
    const modificationType = button.dataset.action;
    const entryElement = button.closest('.conversation-entry');
    
    if (!entryElement) {
      console.error('Could not find conversation entry');
      return;
    }
    
    const entryId = entryElement.dataset.entryId;
    const entry = this.conversation ? this.conversation.getEntryById(entryId) : null;
    
    if (!entry) {
      console.error('Could not find entry in conversation');
      return;
    }
    
    // Check if operation is already in progress
    if (this.activeOperations.has(entryId)) {
      console.log('Operation already in progress for this entry');
      return;
    }
    
    // Show loading state
    this.showLoadingState(entryElement, 'modification');
    this.activeOperations.set(entryId, 'modification');
    
    try {
      // Call API to get modified response
      if (!this.apiClient) {
        throw new Error('API client not configured');
      }
      
      const response = await this.apiClient.queryAPI({
        query: entry.query,
        modification: modificationType,
        session_id: this.getSessionId()
      });
      
      // Update the entry with the modified response
      if (this.conversation) {
        this.conversation.updateEntry(entryId, {
          answer: response.answer,
          sources: response.sources || entry.sources
        });
      }
      
      // Hide loading state
      this.hideLoadingState(entryElement);
      
    } catch (error) {
      console.error('Error modifying response:', error);
      this.showError(entryElement, 'Failed to modify response. Please try again.');
      this.hideLoadingState(entryElement);
    } finally {
      this.activeOperations.delete(entryId);
    }
  }

  /**
   * Handle regeneration button click
   * @param {HTMLElement} button - The clicked button
   */
  async handleRegeneration(button) {
    const entryElement = button.closest('.conversation-entry');
    
    if (!entryElement) {
      console.error('Could not find conversation entry');
      return;
    }
    
    const entryId = entryElement.dataset.entryId;
    const entry = this.conversation ? this.conversation.getEntryById(entryId) : null;
    
    if (!entry) {
      console.error('Could not find entry in conversation');
      return;
    }
    
    // Check if operation is already in progress
    if (this.activeOperations.has(entryId)) {
      console.log('Operation already in progress for this entry');
      return;
    }
    
    // Show loading state
    this.showLoadingState(entryElement, 'regeneration');
    this.activeOperations.set(entryId, 'regeneration');
    
    try {
      // Call API to regenerate response
      if (!this.apiClient) {
        throw new Error('API client not configured');
      }
      
      const response = await this.apiClient.queryAPI({
        query: entry.query,
        session_id: this.getSessionId()
      });
      
      // Update the entry with the regenerated response
      if (this.conversation) {
        this.conversation.updateEntry(entryId, {
          answer: response.answer,
          sources: response.sources || []
        });
      }
      
      // Hide loading state
      this.hideLoadingState(entryElement);
      
    } catch (error) {
      console.error('Error regenerating response:', error);
      this.showError(entryElement, 'Failed to regenerate response. Please try again.');
      this.hideLoadingState(entryElement);
    } finally {
      this.activeOperations.delete(entryId);
    }
  }



  /**
   * Show loading state on an entry
   * @param {HTMLElement} entryElement - The entry element
   * @param {string} operationType - Type of operation ('modification' or 'regeneration')
   */
  showLoadingState(entryElement, operationType) {
    const responseElement = entryElement.querySelector('.conversation-response');
    if (!responseElement) return;
    
    // Add loading class
    responseElement.classList.add(this.loadingClass);
    
    // Disable all action buttons
    const buttons = entryElement.querySelectorAll('.action-btn, .feedback-btn');
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.classList.add(this.disabledClass);
    });
    
    // Show loading indicator
    let loadingIndicator = entryElement.querySelector('.response-loading-indicator');
    if (!loadingIndicator) {
      loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'response-loading-indicator';
      loadingIndicator.innerHTML = `
        <div class="loading-spinner-small"></div>
        <span class="loading-text-small">${operationType === 'modification' ? 'Modifying response...' : 'Regenerating response...'}</span>
      `;
      
      const responseContent = responseElement.querySelector('.response-content');
      if (responseContent) {
        responseContent.style.opacity = '0.5';
      }
      
      responseElement.insertBefore(loadingIndicator, responseElement.firstChild);
    }
  }

  /**
   * Hide loading state on an entry
   * @param {HTMLElement} entryElement - The entry element
   */
  hideLoadingState(entryElement) {
    const responseElement = entryElement.querySelector('.conversation-response');
    if (!responseElement) return;
    
    // Remove loading class
    responseElement.classList.remove(this.loadingClass);
    
    // Re-enable all action buttons
    const buttons = entryElement.querySelectorAll('.action-btn, .feedback-btn');
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.classList.remove(this.disabledClass);
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
   * Show error message on an entry
   * @param {HTMLElement} entryElement - The entry element
   * @param {string} message - Error message
   */
  showError(entryElement, message) {
    const responseElement = entryElement.querySelector('.conversation-response');
    if (!responseElement) return;
    
    // Remove existing error if present
    const existingError = entryElement.querySelector('.response-error-message');
    if (existingError) {
      existingError.remove();
    }
    
    // Create error element
    const errorElement = document.createElement('div');
    errorElement.className = 'response-error-message';
    errorElement.textContent = message;
    errorElement.setAttribute('role', 'alert');
    
    // Insert error before actions
    const responseActions = responseElement.querySelector('.response-actions');
    if (responseActions) {
      responseElement.insertBefore(errorElement, responseActions);
    } else {
      responseElement.appendChild(errorElement);
    }
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      errorElement.remove();
    }, 5000);
  }



  /**
   * Update feedback UI to highlight selected button
   * @param {HTMLElement} entryElement - The entry element
   * @param {string} feedbackType - Type of feedback ('positive' or 'negative')
   */
  updateFeedbackUI(entryElement, feedbackType) {
    const feedbackButtons = entryElement.querySelectorAll('.feedback-btn');
    
    feedbackButtons.forEach(button => {
      const buttonType = button.dataset.feedback;
      
      if (buttonType === feedbackType) {
        button.classList.add(this.activeClass);
        button.setAttribute('aria-pressed', 'true');
      } else {
        button.classList.remove(this.activeClass);
        button.setAttribute('aria-pressed', 'false');
      }
    });
  }

  /**
   * Show feedback confirmation animation
   * @param {HTMLElement} button - The feedback button
   */
  showFeedbackConfirmation(button) {
    // Animate button with scale effect
    button.style.transform = 'scale(1.2)';
    
    setTimeout(() => {
      button.style.transform = 'scale(1)';
    }, 200);
  }

  /**
   * Get current session ID
   * @returns {string} Session ID
   */
  getSessionId() {
    // Try to get from global app session manager
    if (typeof app !== 'undefined' && app.session && app.session.getCurrentSessionId) {
      return app.session.getCurrentSessionId();
    }
    
    // Fallback to localStorage
    let sessionId = localStorage.getItem('auditor-assistant-current-session');
    if (!sessionId) {
      sessionId = this.generateSessionId();
      localStorage.setItem('auditor-assistant-current-session', sessionId);
    }
    
    return sessionId;
  }

  /**
   * Generate a new session ID
   * @returns {string} New session ID
   */
  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set API client
   * @param {Object} apiClient - The API client instance
   */
  setApiClient(apiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Set conversation instance
   * @param {Object} conversation - The conversation instance
   */
  setConversation(conversation) {
    this.conversation = conversation;
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    this.activeOperations.clear();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResponseActions;
}
