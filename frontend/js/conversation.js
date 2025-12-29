/**
 * Conversation History Component
 * Manages conversation state, chronological ordering, and display
 */

class Conversation {
  constructor(options = {}) {
    // DOM elements
    this.displayElement = options.displayElement || document.getElementById('conversation-display');
    
    // State - store conversation history in memory (session-based)
    this.entries = [];
    
    // Configuration
    this.autoScroll = options.autoScroll !== undefined ? options.autoScroll : true;
    
    // Optional sidebar reference for updating source links
    this.sidebar = options.sidebar || null;
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize the conversation component
   */
  initialize() {
    if (!this.displayElement) {
      console.error('Conversation display element not found');
      return;
    }
    
    // Show welcome message on initialization
    this.showWelcomeMessage();
  }

  /**
   * Add a new entry to the conversation history
   * @param {Object} entry - The conversation entry
   * @param {string} entry.query - The user's query text
   * @param {string} entry.answer - The system's response text
   * @param {Array} entry.sources - Array of source objects with title and url
   * @param {number} entry.timestamp - Timestamp of the entry (optional, defaults to now)
   * @param {string} entry.id - Unique identifier for the entry (optional, auto-generated)
   * @param {boolean} entry.streaming - Whether this entry is being streamed
   * @returns {string} The entry ID
   */
  addEntry(entry) {
    // Validate required fields
    if (!entry || typeof entry.query !== 'string') {
      console.error('Invalid entry: query is required');
      return null;
    }
    
    // Create complete entry with defaults
    const completeEntry = {
      id: entry.id || this.generateEntryId(),
      query: entry.query,
      answer: entry.answer || '',
      sources: entry.sources || [],
      timestamp: entry.timestamp || Date.now(),
      feedback: entry.feedback || null,
      streaming: entry.streaming || false,
      images: entry.images || []  // Store image metadata
    };
    
    // Add to entries array
    this.entries.push(completeEntry);
    
    // Sort entries by timestamp to maintain chronological order
    this.sortEntriesByTimestamp();
    
    // Render the new entry
    this.renderEntry(completeEntry);
    
    // Update sidebar with latest response sources
    if (this.sidebar && typeof this.sidebar.updateSourceLinks === 'function' && completeEntry.sources.length > 0) {
      this.sidebar.updateSourceLinks(completeEntry.sources, completeEntry.query || '');
    }
    
    // Auto-scroll to latest message
    if (this.autoScroll) {
      this.scrollToLatest();
    }
    
    return completeEntry.id;
  }

  /**
   * Update an existing entry
   * @param {string} entryId - The entry ID to update
   * @param {Object} updates - Fields to update
   */
  updateEntry(entryId, updates) {
    const entry = this.entries.find(e => e.id === entryId);
    if (!entry) {
      console.error('Entry not found:', entryId);
      return null;
    }
    
    // Update entry
    Object.assign(entry, updates);
    
    // Re-render the entry
    const entryElement = this.displayElement.querySelector(`[data-entry-id="${entryId}"]`);
    if (entryElement) {
      // Update answer content with proper formatting
      const responseContent = entryElement.querySelector('.response-content');
      if (responseContent && updates.answer !== undefined) {
        // Use ResponseRenderer for proper markdown formatting
        if (typeof ResponseRenderer !== 'undefined') {
          const renderer = new ResponseRenderer({ enableAnimations: false });
          const rendered = renderer.render({ answer: updates.answer, sources: entry.sources || [] }, entry.query || '');
          responseContent.innerHTML = '';
          if (rendered instanceof HTMLElement) {
            responseContent.appendChild(rendered);
          } else {
            responseContent.innerHTML = rendered;
          }
        } else {
          responseContent.innerHTML = this.formatAnswer(updates.answer);
        }
      }
      
      // Update sources if provided
      if (updates.sources && this.sidebar && typeof this.sidebar.updateSourceLinks === 'function') {
        this.sidebar.updateSourceLinks(updates.sources, entry.query || '');
      }
      
      // Auto-scroll if streaming
      if (entry.streaming && this.autoScroll) {
        this.scrollToLatest();
      }
    }
    
    return entry;
  }

  /**
   * Format answer text (placeholder for markdown/formatting)
   */
  formatAnswer(text) {
    // Simple formatting - replace newlines with <br>
    return text.replace(/\n/g, '<br>');
  }

  /**
   * Sort entries by timestamp in chronological order (oldest first)
   */
  sortEntriesByTimestamp() {
    this.entries.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Generate a unique entry ID
   * @returns {string} Unique identifier
   */
  generateEntryId() {
    return `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Render a conversation entry in the display
   * @param {Object} entry - The entry to render
   */
  renderEntry(entry) {
    // Remove welcome message if it exists
    const welcomeMessage = this.displayElement.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
    
    // Create entry container
    const entryElement = document.createElement('div');
    entryElement.className = 'conversation-entry';
    entryElement.dataset.entryId = entry.id;
    entryElement.setAttribute('role', 'article');
    entryElement.setAttribute('aria-label', 'Conversation exchange');
    
    // Create query element (user message)
    const queryElement = document.createElement('div');
    queryElement.className = 'conversation-query';
    queryElement.setAttribute('role', 'region');
    queryElement.setAttribute('aria-label', 'User query');
    
    const queryContent = document.createElement('div');
    queryContent.className = 'query-content';
    queryContent.textContent = entry.query;

    // Add image indicator if images were uploaded
    if (entry.images && entry.images.length > 0) {
      const imageIndicator = document.createElement('div');
      imageIndicator.className = 'query-image-indicator';
      imageIndicator.innerHTML = `
        <span class="material-symbols-outlined">image</span>
        <span>${entry.images.length} image(s) uploaded</span>
      `;
      queryContent.appendChild(imageIndicator);
    }

    const queryTimestamp = document.createElement('div');
    queryTimestamp.className = 'query-timestamp';
    queryTimestamp.textContent = this.formatTimestamp(entry.timestamp);

    queryElement.appendChild(queryContent);
    queryElement.appendChild(queryTimestamp);
    
    // Create response element (system message)
    const responseElement = document.createElement('div');
    responseElement.className = 'conversation-response';
    responseElement.setAttribute('role', 'region');
    responseElement.setAttribute('aria-label', 'System response');
    
    const responseContent = document.createElement('div');
    responseContent.className = 'response-content';
    const formattedResponse = this.formatResponse(entry.answer, entry.sources);
    
    // If formatResponse returns an HTMLElement, append it; otherwise set innerHTML
    if (formattedResponse instanceof HTMLElement) {
      responseContent.appendChild(formattedResponse);
    } else {
      responseContent.innerHTML = formattedResponse;
    }
    
    // Create response actions container
    const responseActions = document.createElement('div');
    responseActions.className = 'response-actions';
    
    // Add action buttons
    const actionsHTML = `
      <div class="response-action-buttons">
        <button class="action-btn copy-verdict-btn" data-action="copy-verdict" aria-label="Copy verdict to clipboard">
          📋 Copy Verdict
        </button>
        <button class="action-btn modify-btn" data-action="shorter" aria-label="Make response shorter">
          Shorter
        </button>
        <button class="action-btn modify-btn" data-action="more" aria-label="Tell me more">
          More detail
        </button>
        <button class="action-btn regenerate-btn" data-action="regenerate" aria-label="Regenerate response">
          Regenerate
        </button>
      </div>
      <div class="feedback-buttons">
        <button class="feedback-btn thumbs-up" data-feedback="positive" aria-label="Thumbs up">
          👍
        </button>
        <button class="feedback-btn thumbs-down" data-feedback="negative" aria-label="Thumbs down">
          👎
        </button>
      </div>
    `;
    responseActions.innerHTML = actionsHTML;
    
    responseElement.appendChild(responseContent);
    responseElement.appendChild(responseActions);
    
    // Append query and response to entry
    entryElement.appendChild(queryElement);
    entryElement.appendChild(responseElement);
    
    // Append entry to display
    this.displayElement.appendChild(entryElement);
  }

  /**
   * Format response text using ResponseRenderer
   * @param {string} text - The response text
   * @param {Array} sources - Array of source objects
   * @returns {HTMLElement} Formatted response element
   */
  formatResponse(text, sources = []) {
    // Use ResponseRenderer if available, otherwise fall back to basic formatting
    if (typeof ResponseRenderer !== 'undefined') {
      const renderer = new ResponseRenderer({ enableAnimations: false });
      return renderer.render({ answer: text, sources: sources });
    }
    
    // Fallback: Basic HTML escaping and line break handling
    const container = document.createElement('div');
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    
    container.innerHTML = `<p>${escaped}</p>`;
    return container;
  }

  /**
   * Format timestamp for display
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} Formatted time string
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    
    // If today, show time only
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
    
    // If this year, show month and day
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
    
    // Otherwise show full date
    return date.toLocaleDateString('en-US', { 
      year: 'numeric',
      month: 'short', 
      day: 'numeric' 
    });
  }

  /**
   * Scroll to the latest message
   */
  scrollToLatest() {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      // Scroll the display element to the bottom
      this.displayElement.scrollTop = this.displayElement.scrollHeight;
      
      // Also try smooth scroll if supported
      if (typeof this.displayElement.scrollTo === 'function') {
        this.displayElement.scrollTo({
          top: this.displayElement.scrollHeight,
          behavior: 'smooth'
        });
      }
    });
  }

  /**
   * Get all conversation entries
   * @returns {Array} Array of conversation entries
   */
  getEntries() {
    return [...this.entries]; // Return a copy to prevent external modification
  }

  /**
   * Get a specific entry by ID
   * @param {string} id - The entry ID
   * @returns {Object|null} The entry or null if not found
   */
  getEntryById(id) {
    return this.entries.find(entry => entry.id === id) || null;
  }

  /**
   * Re-render a specific entry
   * @param {string} id - The entry ID
   */
  reRenderEntry(id) {
    const entryElement = this.displayElement.querySelector(`[data-entry-id="${id}"]`);
    if (!entryElement) {
      return;
    }
    
    const entry = this.getEntryById(id);
    if (!entry) {
      return;
    }
    
    // Remove old element
    entryElement.remove();
    
    // Re-render
    this.renderEntry(entry);
    
    // Scroll to latest if auto-scroll is enabled
    if (this.autoScroll) {
      this.scrollToLatest();
    }
  }

  /**
   * Clear all conversation history
   */
  clear() {
    // Clear entries array
    this.entries = [];
    
    // Clear display
    this.displayElement.innerHTML = '';
    
    // Clear sidebar source links
    if (this.sidebar && typeof this.sidebar.clear === 'function') {
      this.sidebar.clear();
    }
    
    // Restore welcome message
    this.showWelcomeMessage();
  }

  /**
   * Show welcome message
   */
  showWelcomeMessage() {
    const welcomeHTML = `
      <div class="welcome-message">
        <div class="welcome-header animate-fade-in">
          <div class="welcome-icon-container">
            <span class="material-symbols-outlined welcome-icon">psychology</span>
          </div>
          <h2 class="welcome-title">Guideline Assistant</h2>
        </div>
        <p class="welcome-subtitle animate-fade-in animate-delay-150">
          Ask questions about guidelines to get answers with source citations. Upload images for visual analysis.
        </p>
        <div class="suggestion-grid">
          <button class="suggestion-card card-purple animate-fade-in animate-delay-300" data-query="I see images of burning tarot cards. Is this inappropriate and flaggable?">
            <div class="card-icon">
              <span class="material-symbols-outlined">auto_awesome</span>
            </div>
            <div class="card-content">
              <span class="card-text">I see images of burning tarot cards. Is this inappropriate and flaggable?</span>
            </div>
            <div class="card-arrow">
              <span class="material-symbols-outlined">arrow_forward</span>
            </div>
          </button>
          <button class="suggestion-card card-blue animate-fade-in animate-delay-450" data-query="I see a logo in the center of the image. Should I flag it or not?">
            <div class="card-icon">
              <span class="material-symbols-outlined">branding_watermark</span>
            </div>
            <div class="card-content">
              <span class="card-text">I see a logo in the center of the image. Should I flag it or not?</span>
            </div>
            <div class="card-arrow">
              <span class="material-symbols-outlined">arrow_forward</span>
            </div>
          </button>
          <button class="suggestion-card card-orange animate-fade-in animate-delay-600" data-query="The image shows a 3d figure toy holding a toy gun. Should I flag it?">
            <div class="card-icon">
              <span class="material-symbols-outlined">toys</span>
            </div>
            <div class="card-content">
              <span class="card-text">The image shows a 3d figure toy holding a toy gun. Should I flag it?</span>
            </div>
            <div class="card-arrow">
              <span class="material-symbols-outlined">arrow_forward</span>
            </div>
          </button>
          <button class="suggestion-card card-green animate-fade-in animate-delay-750" data-query="I see marijuana leaves in the background of the image but it is not focal point. Should I flag it?">
            <div class="card-icon">
              <span class="material-symbols-outlined">nature</span>
            </div>
            <div class="card-content">
              <span class="card-text">I see marijuana leaves in the background of the image but it is not focal point. Should I flag it?</span>
            </div>
            <div class="card-arrow">
              <span class="material-symbols-outlined">arrow_forward</span>
            </div>
          </button>
        </div>
        <div class="welcome-footer animate-fade-in animate-delay-900">
          <span class="material-symbols-outlined">info</span>
          <span>Tip: Try uploading images with your questions for more accurate guideline analysis</span>
        </div>
      </div>
    `;
    this.displayElement.innerHTML = welcomeHTML;
  }

  /**
   * Get the number of entries in the conversation
   * @returns {number} Number of entries
   */
  getEntryCount() {
    return this.entries.length;
  }

  /**
   * Get the latest entry
   * @returns {Object|null} The latest entry or null if no entries
   */
  getLatestEntry() {
    if (this.entries.length === 0) {
      return null;
    }
    return this.entries[this.entries.length - 1];
  }

  /**
   * Check if conversation is empty
   * @returns {boolean} True if no entries
   */
  isEmpty() {
    return this.entries.length === 0;
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
  module.exports = Conversation;
}
