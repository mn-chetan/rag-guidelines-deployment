/**
 * Feedback Component
 * Manages feedback state tracking, UI updates, and submission
 */

class Feedback {
  constructor(options = {}) {
    // Dependencies
    this.apiClient = options.apiClient || null;
    this.conversation = options.conversation || null;
    
    // Configuration
    this.activeClass = 'active';
    this.feedbackSubmittedClass = 'feedback-submitted';
    this.confirmationDuration = 2000; // Duration to show confirmation (ms)
    
    // State tracking - map of entry ID to feedback type
    this.feedbackState = new Map();
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize the feedback component
   */
  initialize() {
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for feedback buttons
   */
  setupEventListeners() {
    const conversationDisplay = document.getElementById('conversation-display');
    if (!conversationDisplay) {
      console.error('Conversation display element not found');
      return;
    }

    // Use event delegation for feedback buttons
    conversationDisplay.addEventListener('click', (event) => {
      const target = event.target;
      
      // Handle feedback button clicks
      if (target.classList.contains('feedback-btn')) {
        event.preventDefault();
        this.handleFeedbackClick(target);
      }
    });
  }

  /**
   * Handle feedback button click
   * @param {HTMLElement} button - The clicked feedback button
   */
  async handleFeedbackClick(button) {
    const feedbackType = button.dataset.feedback;
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

    // Store previous state for rollback
    const previousFeedback = this.feedbackState.get(entryId) || null;

    // Check if this is toggling off existing feedback
    const newFeedback = previousFeedback === feedbackType ? null : feedbackType;

    // Optimistic update - update state and UI immediately
    this.setFeedbackState(entryId, newFeedback);
    this.updateFeedbackUI(entryElement, newFeedback);

    // Update conversation entry
    if (this.conversation) {
      this.conversation.updateEntry(entryId, {
        feedback: newFeedback
      });
    }

    // Show visual confirmation
    this.showFeedbackConfirmation(button, newFeedback);

    // Send feedback to backend API and rollback on failure
    if (newFeedback) {
      const success = await this.submitFeedback(entry, newFeedback, entryId, entryElement, previousFeedback);
      if (!success) {
        // Rollback already handled in submitFeedback
      }
    }
  }

  /**
   * Set feedback state for an entry
   * @param {string} entryId - The entry ID
   * @param {string|null} feedbackType - 'positive', 'negative', or null
   */
  setFeedbackState(entryId, feedbackType) {
    if (feedbackType === null) {
      this.feedbackState.delete(entryId);
    } else {
      this.feedbackState.set(entryId, feedbackType);
    }
  }

  /**
   * Get feedback state for an entry
   * @param {string} entryId - The entry ID
   * @returns {string|null} The feedback type or null
   */
  getFeedbackState(entryId) {
    return this.feedbackState.get(entryId) || null;
  }

  /**
   * Update feedback UI to show selected option
   * @param {HTMLElement} entryElement - The conversation entry element
   * @param {string|null} feedbackType - 'positive', 'negative', or null
   */
  updateFeedbackUI(entryElement, feedbackType) {
    const feedbackButtons = entryElement.querySelectorAll('.feedback-btn');
    
    feedbackButtons.forEach(btn => {
      const btnFeedbackType = btn.dataset.feedback;
      
      if (feedbackType && btnFeedbackType === feedbackType) {
        // Highlight selected button
        btn.classList.add(this.activeClass);
        btn.setAttribute('aria-pressed', 'true');
      } else {
        // Remove highlight from unselected buttons
        btn.classList.remove(this.activeClass);
        btn.setAttribute('aria-pressed', 'false');
      }
    });
    
    // Update the entry element to show feedback has been submitted
    if (feedbackType) {
      entryElement.classList.add(this.feedbackSubmittedClass);
    } else {
      entryElement.classList.remove(this.feedbackSubmittedClass);
    }
  }

  /**
   * Show visual confirmation after feedback submission
   * @param {HTMLElement} button - The feedback button that was clicked
   * @param {string|null} feedbackType - The feedback type or null if toggled off
   */
  showFeedbackConfirmation(button, feedbackType) {
    if (!feedbackType) {
      // No confirmation needed when toggling off
      return;
    }
    
    // Add animation class
    button.classList.add('feedback-confirmed');
    
    // Scale animation
    button.style.transform = 'scale(1.2)';
    
    setTimeout(() => {
      button.style.transform = 'scale(1)';
      button.classList.remove('feedback-confirmed');
    }, 300);
    
    // Show a brief confirmation message
    this.showConfirmationMessage(button, feedbackType);
  }

  /**
   * Show a brief confirmation message near the button
   * @param {HTMLElement} button - The feedback button
   * @param {string} feedbackType - 'positive' or 'negative'
   */
  showConfirmationMessage(button, feedbackType) {
    const entryElement = button.closest('.conversation-entry');
    if (!entryElement) return;
    
    // Remove existing confirmation if present
    const existingConfirmation = entryElement.querySelector('.feedback-confirmation-message');
    if (existingConfirmation) {
      existingConfirmation.remove();
    }
    
    // Create confirmation message
    const confirmationMessage = document.createElement('div');
    confirmationMessage.className = 'feedback-confirmation-message';
    confirmationMessage.textContent = feedbackType === 'positive' 
      ? 'Thanks for your feedback!' 
      : 'Feedback recorded. We\'ll work to improve!';
    confirmationMessage.setAttribute('role', 'status');
    confirmationMessage.setAttribute('aria-live', 'polite');
    
    // Insert after feedback buttons
    const feedbackButtonsContainer = button.closest('.feedback-buttons');
    if (feedbackButtonsContainer) {
      feedbackButtonsContainer.parentNode.insertBefore(
        confirmationMessage, 
        feedbackButtonsContainer.nextSibling
      );
    }
    
    // Auto-remove after duration
    setTimeout(() => {
      confirmationMessage.remove();
    }, this.confirmationDuration);
  }

  /**
   * Submit feedback to backend API with rollback on failure
   * @param {Object} entry - The conversation entry
   * @param {string} feedbackType - 'positive' or 'negative'
   * @param {string} entryId - The entry ID for rollback
   * @param {HTMLElement} entryElement - The entry element for UI rollback
   * @param {string|null} previousFeedback - Previous feedback state for rollback
   * @returns {boolean} True if successful, false otherwise
   */
  async submitFeedback(entry, feedbackType, entryId, entryElement, previousFeedback) {
    if (!this.apiClient) {
      console.warn('API client not configured, feedback not sent to server');
      return true; // Consider it success if no API client (local-only mode)
    }

    try {
      const feedbackData = {
        query: entry.query,
        response: entry.answer,
        rating: feedbackType,
        session_id: this.getSessionId(),
        timestamp: Date.now()
      };

      await this.apiClient.submitFeedback(feedbackData);

      console.log('Feedback submitted successfully:', feedbackType);
      return true;

    } catch (error) {
      console.error('Error submitting feedback to server:', error);

      // Rollback to previous state
      this.setFeedbackState(entryId, previousFeedback);
      this.updateFeedbackUI(entryElement, previousFeedback);

      // Update conversation entry
      if (this.conversation) {
        this.conversation.updateEntry(entryId, {
          feedback: previousFeedback
        });
      }

      // Show error notification to user
      this.showErrorNotification(entryElement, 'Failed to save feedback. Please try again.');

      return false;
    }
  }

  /**
   * Show error notification near the feedback buttons
   * @param {HTMLElement} entryElement - The conversation entry element
   * @param {string} message - Error message to display
   */
  showErrorNotification(entryElement, message) {
    if (!entryElement) return;

    // Remove existing error if present
    const existingError = entryElement.querySelector('.feedback-error-message');
    if (existingError) {
      existingError.remove();
    }

    // Create error message
    const errorMessage = document.createElement('div');
    errorMessage.className = 'feedback-error-message';
    errorMessage.textContent = message;
    errorMessage.setAttribute('role', 'alert');
    errorMessage.setAttribute('aria-live', 'assertive');

    // Insert after feedback buttons
    const feedbackButtonsContainer = entryElement.querySelector('.feedback-buttons');
    if (feedbackButtonsContainer) {
      feedbackButtonsContainer.parentNode.insertBefore(
        errorMessage,
        feedbackButtonsContainer.nextSibling
      );
    }

    // Auto-remove after duration
    setTimeout(() => {
      errorMessage.remove();
    }, this.confirmationDuration * 2); // Show errors longer than confirmations
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
   * Restore feedback state for an entry (e.g., after re-rendering)
   * @param {string} entryId - The entry ID
   * @param {HTMLElement} entryElement - The entry element
   */
  restoreFeedbackState(entryId, entryElement) {
    const feedbackType = this.getFeedbackState(entryId);
    if (feedbackType) {
      this.updateFeedbackUI(entryElement, feedbackType);
    }
  }

  /**
   * Clear all feedback state
   */
  clearAllFeedback() {
    this.feedbackState.clear();
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
    this.feedbackState.clear();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Feedback;
}
