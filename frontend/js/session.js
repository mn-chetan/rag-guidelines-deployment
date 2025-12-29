/**
 * Session Management Component
 * Handles session ID generation, conversation persistence, and session lifecycle
 */

class SessionManager {
  constructor(options = {}) {
    // Dependencies
    this.conversation = options.conversation;
    this.newChatButton = options.newChatButton || document.getElementById('new-chat-btn');
    this.conversationListElement = options.conversationListElement || document.getElementById('conversation-list');
    
    // Configuration
    this.storageKey = options.storageKey || 'auditor-assistant-sessions';
    this.currentSessionKey = options.currentSessionKey || 'auditor-assistant-current-session';
    this.maxStoredSessions = options.maxStoredSessions || 50;
    
    // State
    this.currentSessionId = null;
    this.sessions = [];
    this.isSaving = false;
    this.pendingSave = false;
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize the session manager
   */
  initialize() {
    // Generate or load current session ID
    this.currentSessionId = this.loadCurrentSessionId() || this.generateSessionId();
    this.saveCurrentSessionId();
    
    // Load session history from localStorage
    this.loadSessionHistory();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Render conversation list
    this.renderConversationList();
    
    // Load the current session's conversation if it exists
    this.loadCurrentSessionConversation();
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // New Chat button
    if (this.newChatButton) {
      this.newChatButton.addEventListener('click', () => this.startNewSession());
    }
    
    // Save conversation before page unload
    window.addEventListener('beforeunload', () => {
      this.saveCurrentSession();
    });
    
    // Periodically save the current session (every 30 seconds)
    this.autoSaveInterval = setInterval(() => {
      this.saveCurrentSession();
    }, 30000);
  }

  /**
   * Generate a unique session ID
   * @returns {string} Unique session identifier
   */
  generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `session-${timestamp}-${random}`;
  }

  /**
   * Get the current session ID
   * @returns {string} Current session ID
   */
  getCurrentSessionId() {
    return this.currentSessionId;
  }

  /**
   * Start a new chat session
   * Clears conversation history and resets the session
   */
  startNewSession() {
    // Save current session before starting new one
    this.saveCurrentSession();
    
    // Generate new session ID
    this.currentSessionId = this.generateSessionId();
    this.saveCurrentSessionId();
    
    // Clear conversation if available
    if (this.conversation) {
      this.conversation.clear();
    }
    
    // Render updated conversation list
    this.renderConversationList();
    
    // Dispatch custom event for other components
    this.dispatchSessionEvent('session-started', {
      sessionId: this.currentSessionId
    });
  }

  /**
   * Save the current session to localStorage
   */
  saveCurrentSession() {
    if (!this.conversation) {
      return;
    }
    
    // Prevent concurrent saves
    if (this.isSaving) {
      this.pendingSave = true;
      return;
    }
    
    this.isSaving = true;
    
    try {
      const entries = this.conversation.getEntries();
      
      // Only save if there are entries
      if (entries.length === 0) {
        this.isSaving = false;
        return;
      }
      
      // Create session object
      const session = {
        id: this.currentSessionId,
        createdAt: this.getSessionCreatedAt(this.currentSessionId),
        updatedAt: Date.now(),
        entries: entries,
        title: this.generateSessionTitle(entries)
      };
      
      // Update or add session to sessions array
      const existingIndex = this.sessions.findIndex(s => s.id === this.currentSessionId);
      if (existingIndex >= 0) {
        this.sessions[existingIndex] = session;
      } else {
        this.sessions.unshift(session); // Add to beginning
      }
      
      // Limit stored sessions
      if (this.sessions.length > this.maxStoredSessions) {
        this.sessions = this.sessions.slice(0, this.maxStoredSessions);
      }
      
      // Save to localStorage
      this.saveSessionHistory();
    } finally {
      this.isSaving = false;
      
      // Process pending save if any
      if (this.pendingSave) {
        this.pendingSave = false;
        this.saveCurrentSession();
      }
    }
  }

  /**
   * Load session history from localStorage
   */
  loadSessionHistory() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.sessions = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load session history:', error);
      this.sessions = [];
    }
  }

  /**
   * Save session history to localStorage with quota handling
   */
  saveSessionHistory() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.sessions));
    } catch (error) {
      // Handle localStorage quota exceeded
      if (error.name === 'QuotaExceededError' || error.code === 22) {
        console.warn('localStorage quota exceeded, pruning old sessions...');
        this.pruneOldSessions();
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(this.sessions));
        } catch (retryError) {
          console.error('Failed to save session history after pruning:', retryError);
        }
      } else {
        console.error('Failed to save session history:', error);
      }
    }
  }

  /**
   * Prune old sessions to free up localStorage space
   */
  pruneOldSessions() {
    // Keep only the most recent half of sessions
    const keepCount = Math.max(5, Math.floor(this.sessions.length / 2));
    if (this.sessions.length > keepCount) {
      // Sort by timestamp (newest first) and keep only recent ones
      this.sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      this.sessions = this.sessions.slice(0, keepCount);
      console.log(`Pruned sessions, keeping ${keepCount} most recent`);
    }
  }

  /**
   * Load current session ID from localStorage
   * @returns {string|null} Session ID or null
   */
  loadCurrentSessionId() {
    try {
      return localStorage.getItem(this.currentSessionKey);
    } catch (error) {
      console.error('Failed to load current session ID:', error);
      return null;
    }
  }

  /**
   * Save current session ID to localStorage
   */
  saveCurrentSessionId() {
    try {
      localStorage.setItem(this.currentSessionKey, this.currentSessionId);
    } catch (error) {
      console.error('Failed to save current session ID:', error);
    }
  }

  /**
   * Load the current session's conversation
   */
  loadCurrentSessionConversation() {
    if (!this.conversation) {
      return;
    }
    
    const session = this.sessions.find(s => s.id === this.currentSessionId);
    if (session && session.entries && session.entries.length > 0) {
      // Restore conversation entries
      session.entries.forEach(entry => {
        this.conversation.addEntry(entry);
      });
    }
  }

  /**
   * Load a specific session by ID
   * @param {string} sessionId - The session ID to load
   */
  loadSession(sessionId) {
    // Save current session first
    this.saveCurrentSession();
    
    // Find the session
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      console.error('Session not found:', sessionId);
      return;
    }
    
    // Set as current session
    this.currentSessionId = sessionId;
    this.saveCurrentSessionId();
    
    // Clear and restore conversation
    if (this.conversation) {
      this.conversation.clear();
      
      if (session.entries && session.entries.length > 0) {
        session.entries.forEach(entry => {
          this.conversation.addEntry(entry);
        });
      }
    }
    
    // Update UI
    this.renderConversationList();
    
    // Dispatch event
    this.dispatchSessionEvent('session-loaded', {
      sessionId: sessionId
    });
  }

  /**
   * Delete a session by ID
   * @param {string} sessionId - The session ID to delete
   */
  async deleteSession(sessionId) {
    // Don't delete current session
    if (sessionId === this.currentSessionId) {
      console.warn('Cannot delete current session');
      return;
    }
    
    // Get session title for confirmation message
    const session = this.sessions.find(s => s.id === sessionId);
    const sessionTitle = session ? session.title : 'this conversation';
    
    // Show confirmation dialog
    const confirmed = await confirmationDialog.show({
      title: 'Delete Conversation?',
      message: `Delete "${sessionTitle}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (!confirmed) {
      return;
    }
    
    // Remove from sessions array
    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    
    // Save updated history
    this.saveSessionHistory();
    
    // Update UI
    this.renderConversationList();
  }

  /**
   * Generate a title for a session based on its entries
   * @param {Array} entries - Conversation entries
   * @returns {string} Session title
   */
  generateSessionTitle(entries) {
    if (!entries || entries.length === 0) {
      return 'New Conversation';
    }
    
    // Use the first query as the title, truncated
    const firstQuery = entries[0].query;
    const maxLength = 50;
    
    if (firstQuery.length <= maxLength) {
      return firstQuery;
    }
    
    return firstQuery.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get session created timestamp
   * @param {string} sessionId - Session ID
   * @returns {number} Timestamp
   */
  getSessionCreatedAt(sessionId) {
    // Extract timestamp from session ID
    const match = sessionId.match(/session-(\d+)-/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return Date.now();
  }

  /**
   * Render the conversation list in the sidebar
   */
  renderConversationList() {
    if (!this.conversationListElement) {
      return;
    }
    
    // Clear existing list
    this.conversationListElement.innerHTML = '';
    
    // Group sessions by time period
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;
    
    const groups = {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: []
    };
    
    // Categorize sessions
    this.sessions.forEach(session => {
      const age = now - session.updatedAt;
      
      if (age < oneDay) {
        groups.today.push(session);
      } else if (age < 2 * oneDay) {
        groups.yesterday.push(session);
      } else if (age < oneWeek) {
        groups.lastWeek.push(session);
      } else if (age < oneMonth) {
        groups.lastMonth.push(session);
      } else {
        groups.older.push(session);
      }
    });
    
    // Render groups
    this.renderSessionGroup('Today', groups.today);
    this.renderSessionGroup('Yesterday', groups.yesterday);
    this.renderSessionGroup('Last 7 Days', groups.lastWeek);
    this.renderSessionGroup('Last 30 Days', groups.lastMonth);
    this.renderSessionGroup('Older', groups.older);
    
    // Show message if no sessions
    if (this.sessions.length === 0) {
      const emptyMessage = document.createElement('li');
      emptyMessage.className = 'conversation-list-empty';
      emptyMessage.textContent = 'No conversation history yet';
      this.conversationListElement.appendChild(emptyMessage);
    }
  }

  /**
   * Render a group of sessions
   * @param {string} groupTitle - Title for the group
   * @param {Array} sessions - Sessions in this group
   */
  renderSessionGroup(groupTitle, sessions) {
    if (sessions.length === 0) {
      return;
    }
    
    // Create group header
    const groupHeader = document.createElement('li');
    groupHeader.className = 'conversation-group-header';
    groupHeader.textContent = groupTitle;
    groupHeader.setAttribute('role', 'presentation');
    this.conversationListElement.appendChild(groupHeader);
    
    // Create session items
    sessions.forEach(session => {
      const item = document.createElement('li');
      item.className = 'conversation-list-item';
      item.setAttribute('role', 'listitem');
      
      // Mark current session
      if (session.id === this.currentSessionId) {
        item.classList.add('active');
      }
      
      // Create button for session
      const button = document.createElement('button');
      button.className = 'conversation-list-button';
      button.setAttribute('aria-label', `Load conversation: ${session.title}`);
      
      const title = document.createElement('span');
      title.className = 'conversation-title';
      title.textContent = session.title;
      
      const timestamp = document.createElement('span');
      timestamp.className = 'conversation-timestamp';
      timestamp.textContent = this.formatTimestamp(session.updatedAt);
      
      button.appendChild(title);
      button.appendChild(timestamp);
      
      // Click handler to load session
      button.addEventListener('click', () => {
        this.loadSession(session.id);
      });
      
      item.appendChild(button);
      
      // Add delete button (only for non-current sessions)
      if (session.id !== this.currentSessionId) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'conversation-delete-button';
        deleteBtn.setAttribute('aria-label', `Delete conversation: ${session.title}`);
        deleteBtn.innerHTML = '×';
        
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteSession(session.id);
        });
        
        item.appendChild(deleteBtn);
      }
      
      this.conversationListElement.appendChild(item);
    });
  }

  /**
   * Format timestamp for display
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} Formatted time string
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }

  /**
   * Dispatch a custom session event
   * @param {string} eventName - Name of the event
   * @param {Object} detail - Event detail data
   */
  dispatchSessionEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      detail: detail,
      bubbles: true
    });
    window.dispatchEvent(event);
  }

  /**
   * Get all sessions
   * @returns {Array} Array of session objects
   */
  getSessions() {
    return [...this.sessions]; // Return a copy
  }

  /**
   * Get a specific session by ID
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session object or null
   */
  getSession(sessionId) {
    return this.sessions.find(s => s.id === sessionId) || null;
  }

  /**
   * Clear all session history
   */
  clearAllSessions() {
    this.sessions = [];
    this.saveSessionHistory();
    this.renderConversationList();
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    // Save current session
    this.saveCurrentSession();
    
    // Clear auto-save interval
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
}
