/**
 * Main Application Orchestration
 * Wires all components together and manages application lifecycle
 */

// Application state
let app = {
  apiClient: null,
  conversation: null,
  session: null,
  queryInput: null,
  responseActions: null,
  feedback: null,
  sidebar: null,
  loading: null,
  pdfViewer: null,
  autocomplete: null
};

/**
 * Initialize the application
 */
async function initializeApp() {
  console.log('Initializing Guideline Assistant...');

  try {
    // Initialize API client with environment-based URL detection
    const isLocalhost = window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1';

    app.apiClient = new APIClient({
      baseURL: isLocalhost
        ? 'http://localhost:8080'
        : 'https://auditor-rag-api-438886470292.us-central1.run.app',
      timeout: 30000
    });

    console.log(`API Client initialized with baseURL: ${app.apiClient.baseURL}`);

    // Initialize sidebar first (needed by conversation)
    app.sidebar = new Sidebar({
      sourceLinksContainer: document.getElementById('source-links-container')
    });

    // Initialize conversation with sidebar reference
    app.conversation = new Conversation({
      displayElement: document.getElementById('conversation-display'),
      autoScroll: true,
      sidebar: app.sidebar
    });

    // Initialize session management
    app.session = new SessionManager({
      conversation: app.conversation,
      newChatButton: document.getElementById('new-chat-btn'),
      conversationListElement: document.getElementById('conversation-list')
    });

    // Initialize loading manager
    app.loading = new LoadingManager({
      mainLoadingIndicator: document.getElementById('loading-indicator')
    });

    // Initialize PDF viewer
    app.pdfViewer = new PDFViewer({
      container: document.getElementById('pdf-viewer-container')
    });
    // Make it globally accessible for response-renderer
    window.pdfViewer = app.pdfViewer;

    // Initialize query input
    app.queryInput = new QueryInput({
      inputElement: document.getElementById('query-input'),
      formElement: document.getElementById('query-form'),
      submitButton: document.getElementById('submit-btn'),
      loadingIndicator: document.getElementById('loading-indicator'),
      onSubmit: handleQuerySubmit
    });

    // Initialize response actions
    app.responseActions = new ResponseActions({
      apiClient: app.apiClient,
      conversation: app.conversation
    });

    // Initialize feedback component
    app.feedback = new Feedback({
      apiClient: app.apiClient,
      conversation: app.conversation
    });

    // Initialize conversation search
    initializeConversationSearch();

    // Initialize autocomplete (ghost text + suggestion chips)
    initializeAutocomplete();

    // Set up global event listeners
    setupGlobalEventListeners();

    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    showInitializationError(error);
  }
}

/**
 * Handle query submission with streaming
 * @param {string} query - The user's query
 * @param {Array} images - Array of image objects with data, mime_type, filename
 */
async function handleQuerySubmit(query, images = []) {
  console.log('Submitting query:', query, 'with', images.length, 'images');

  // Show loading state
  const operationId = app.loading.showQueryLoading({ queryInput: app.queryInput });

  try {
    // Add query to conversation immediately
    const entryId = app.conversation.addEntry({
      query: query,
      answer: '',
      sources: [],
      timestamp: Date.now(),
      streaming: true,
      images: images.map(img => ({ filename: img.filename, mime_type: img.mime_type }))  // Store metadata only
    });

    // Stream response
    let currentAnswer = '';

    await app.apiClient.queryAPIStream(
      {
        query: query,
        session_id: app.session.getCurrentSessionId(),
        images: images  // Include images in API call
      },
      // On each chunk - guard against deleted entry
      (chunk) => {
        // Check if entry still exists before updating
        if (!app.conversation.getEntryById(entryId)) {
          console.warn('Entry deleted during streaming, ignoring chunk');
          return;
        }
        currentAnswer += chunk;
        app.conversation.updateEntry(entryId, {
          answer: currentAnswer
        });
      },
      // On complete - guard against deleted entry
      (response) => {
        // Check if entry still exists before updating
        if (!app.conversation.getEntryById(entryId)) {
          console.warn('Entry deleted during streaming, ignoring completion');
          app.loading.hideLoading(operationId, { queryInput: app.queryInput });
          return;
        }
        app.conversation.updateEntry(entryId, {
          answer: response.answer,
          sources: response.sources,
          streaming: false
        });

        // Hide loading state
        app.loading.hideLoading(operationId, { queryInput: app.queryInput });
      }
    );

  } catch (error) {
    console.error('Error processing query:', error);

    // Hide loading state
    app.loading.hideLoading(operationId, { queryInput: app.queryInput });

    // Show error message
    showErrorMessage(error.message || 'Failed to process query. Please try again.');
  }
}

/**
 * Set up global event listeners
 */
function setupGlobalEventListeners() {
  // Listen for suggestion card and related question clicks (consolidated)
  document.addEventListener('click', (event) => {
    // Check loading state to prevent duplicate submissions
    if (app.queryInput?.isLoading) {
      return;
    }

    // Handle suggestion card clicks (use closest to handle child element clicks)
    const suggestionCard = event.target.closest('.suggestion-card');
    if (suggestionCard) {
      const query = suggestionCard.dataset.query;
      if (query) {
        handleQuerySubmit(query);
      }
      return;
    }

    // Handle related question card clicks
    const relatedCard = event.target.closest('.related-question-card');
    if (relatedCard) {
      const query = relatedCard.dataset.query;
      if (query) {
        handleQuerySubmit(query);
      }
      return;
    }
  });

  // Listen for copy verdict button clicks
  document.addEventListener('click', async (event) => {
    const copyBtn = event.target.closest('.copy-verdict-btn');
    if (copyBtn) {
      const entry = copyBtn.closest('.conversation-entry');
      if (entry) {
        const responseContent = entry.querySelector('.response-content');
        if (responseContent) {
          const verdictText = extractVerdictText(responseContent.textContent || responseContent.innerText);
          try {
            await navigator.clipboard.writeText(verdictText);
            // Show success feedback
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓ Copied!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.innerHTML = originalText;
              copyBtn.classList.remove('copied');
            }, 2000);
          } catch (err) {
            console.error('Failed to copy:', err);
            showNotification('Failed to copy to clipboard', 'warning');
          }
        }
      }
    }
  });

  // Listen for session events
  window.addEventListener('session-started', (event) => {
    console.log('New session started:', event.detail.sessionId);
  });

  window.addEventListener('session-loaded', (event) => {
    console.log('Session loaded:', event.detail.sessionId);
  });

  // Handle visibility change (save session when tab becomes hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.session) {
      app.session.saveCurrentSession();
    }
  });

  // Handle online/offline events
  window.addEventListener('online', () => {
    console.log('Connection restored');
    showNotification('Connection restored', 'success');
  });

  window.addEventListener('offline', () => {
    console.log('Connection lost');
    showNotification('You are offline. Some features may not work.', 'warning');
  });

  // Handle errors globally
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
  });

  // Set up keyboard shortcuts
  setupKeyboardShortcuts();
}

/**
 * Set up global keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    const key = event.key;
    const isCtrl = event.ctrlKey || event.metaKey;
    const isShift = event.shiftKey;
    
    // Don't trigger shortcuts when typing in input (except specific ones)
    const isInputFocused = document.activeElement.tagName === 'TEXTAREA' ||
                           document.activeElement.tagName === 'INPUT';

    // Ctrl+K - Focus conversation search input
    if (isCtrl && key === 'k') {
      event.preventDefault();
      const searchInput = document.getElementById('conversation-search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // / - Focus conversation search (when not in input)
    if (key === '/' && !isInputFocused) {
      event.preventDefault();
      const searchInput = document.getElementById('conversation-search-input');
      if (searchInput) {
        searchInput.focus();
      }
      return;
    }
    
    // Ctrl+Shift+C - Copy verdict from latest response
    if (isCtrl && isShift && key === 'C') {
      event.preventDefault();
      copyLatestVerdict();
      return;
    }
    
    // Ctrl+N - New chat
    if (isCtrl && key === 'n' && !isShift) {
      event.preventDefault();
      const newChatBtn = document.getElementById('new-chat-btn');
      if (newChatBtn) {
        newChatBtn.click();
      }
      return;
    }
    
    // Escape - Clear input or blur
    if (key === 'Escape') {
      // Handle conversation search
      const searchInput = document.getElementById('conversation-search-input');
      if (searchInput && document.activeElement === searchInput) {
        if (window.clearAllFiltersAndSearch) {
          window.clearAllFiltersAndSearch();
        }
        searchInput.blur();
        return;
      }

      // Handle query input
      const input = document.getElementById('query-input');
      if (input && document.activeElement === input) {
        if (input.value) {
          input.value = '';
          input.dispatchEvent(new Event('input'));
        } else {
          input.blur();
        }
      }
      return;
    }
    
    // 1, 2, 3 keys - Click follow-up questions (when not in input)
    if (!isInputFocused && ['1', '2', '3'].includes(key)) {
      event.preventDefault();
      const index = parseInt(key) - 1;
      clickFollowUpQuestion(index);
      return;
    }
    
    // ? key - Show keyboard shortcuts help (when not in input)
    if (key === '?' && !isInputFocused) {
      event.preventDefault();
      showKeyboardShortcutsHelp();
      return;
    }
  });
}

/**
 * Copy verdict from the latest response
 */
async function copyLatestVerdict() {
  const entries = document.querySelectorAll('.conversation-entry');
  if (entries.length === 0) {
    showNotification('No response to copy', 'warning');
    return;
  }
  
  const latestEntry = entries[entries.length - 1];
  const responseContent = latestEntry.querySelector('.response-content');
  
  if (responseContent) {
    const verdictText = extractVerdictText(responseContent.textContent || responseContent.innerText);
    try {
      await navigator.clipboard.writeText(verdictText);
      showNotification('Verdict copied!', 'success');
    } catch (err) {
      console.error('Failed to copy:', err);
      showNotification('Failed to copy to clipboard', 'warning');
    }
  }
}

/**
 * Click a follow-up question by index
 */
function clickFollowUpQuestion(index) {
  // Find the latest response's follow-up questions
  const entries = document.querySelectorAll('.conversation-entry');
  if (entries.length === 0) return;
  
  const latestEntry = entries[entries.length - 1];
  const followUpCards = latestEntry.querySelectorAll('.related-question-card');
  
  if (followUpCards[index]) {
    followUpCards[index].click();
    // Visual feedback
    followUpCards[index].style.transform = 'scale(0.95)';
    setTimeout(() => {
      followUpCards[index].style.transform = '';
    }, 100);
  }
}

/**
 * Show keyboard shortcuts help modal
 */
function showKeyboardShortcutsHelp() {
  // Remove existing modal if present
  const existingModal = document.querySelector('.shortcuts-modal');
  if (existingModal) {
    existingModal.remove();
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'shortcuts-modal';
  modal.innerHTML = `
    <div class="shortcuts-modal-content">
      <div class="shortcuts-modal-header">
        <h3>⌨️ Keyboard Shortcuts</h3>
        <button class="shortcuts-modal-close" aria-label="Close">×</button>
      </div>
      <div class="shortcuts-modal-body">
        <div class="shortcut-group">
          <div class="shortcut-group-title">Navigation</div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>K</kbd> or <kbd>/</kbd>
            <span>Focus search</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>N</kbd>
            <span>New chat</span>
          </div>
          <div class="shortcut-item">
            <kbd>Esc</kbd>
            <span>Clear input / Unfocus</span>
          </div>
        </div>
        <div class="shortcut-group">
          <div class="shortcut-group-title">Quick Actions</div>
          <div class="shortcut-item">
            <kbd>Enter</kbd>
            <span>Submit query</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>
            <span>Copy verdict</span>
          </div>
          <div class="shortcut-item">
            <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>
            <span>Click follow-up questions</span>
          </div>
        </div>
        <div class="shortcut-group">
          <div class="shortcut-group-title">Help</div>
          <div class="shortcut-item">
            <kbd>?</kbd>
            <span>Show this help</span>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close on click outside or close button
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.classList.contains('shortcuts-modal-close')) {
      modal.remove();
    }
  });
  
  // Close on Escape
  const closeOnEscape = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', closeOnEscape);
    }
  };
  document.addEventListener('keydown', closeOnEscape);
}

/**
 * Show error message to user
 * @param {string} message - Error message
 */
function showErrorMessage(message) {
  const conversationDisplay = document.getElementById('conversation-display');
  if (!conversationDisplay) return;

  // Remove existing error if present
  const existingError = conversationDisplay.querySelector('.global-error-message');
  if (existingError) {
    existingError.remove();
  }

  // Create error element
  const errorElement = document.createElement('div');
  errorElement.className = 'global-error-message';
  errorElement.setAttribute('role', 'alert');
  errorElement.innerHTML = `
    <span class="material-symbols-outlined error-icon">warning</span>
    <div class="error-content">
      <div class="error-title">Error</div>
      <div class="error-text">${escapeHtml(message)}</div>
    </div>
    <button class="error-close" aria-label="Close error message">×</button>
  `;

  // Add close handler
  const closeButton = errorElement.querySelector('.error-close');
  closeButton.addEventListener('click', () => {
    errorElement.remove();
  });

  // Insert at the end of conversation display
  conversationDisplay.appendChild(errorElement);

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (errorElement.parentNode) {
      errorElement.remove();
    }
  }, 10000);

  // Scroll to show error
  errorElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

/**
 * Show notification to user
 * @param {string} message - Notification message
 * @param {string} type - Notification type ('success', 'warning', 'info')
 */
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.setAttribute('role', 'status');
  notification.setAttribute('aria-live', 'polite');
  notification.textContent = message;

  // Add to body
  document.body.appendChild(notification);

  // Trigger animation
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });

  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 5000);
}

/**
 * Show initialization error
 * @param {Error} error - The error that occurred
 */
function showInitializationError(error) {
  const appContainer = document.querySelector('.app-container');
  if (!appContainer) return;

  const errorHTML = `
    <div class="initialization-error">
      <span class="material-symbols-outlined error-icon-large">warning</span>
      <h2>Failed to Initialize Application</h2>
      <p>${escapeHtml(error.message || 'An unexpected error occurred')}</p>
      <button onclick="location.reload()" class="retry-button">Retry</button>
    </div>
  `;

  appContainer.innerHTML = errorHTML;
}

/**
 * Extract verdict and reason from response text for copying
 * @param {string} text - The full response text
 * @returns {string} Extracted verdict and reason
 */
function extractVerdictText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let result = [];
  let capturing = false;
  
  for (const line of lines) {
    // Start capturing at Verdict
    if (line.toLowerCase().includes('verdict')) {
      capturing = true;
      result.push(line);
      continue;
    }
    
    // Stop at Related Questions or Sources
    if (line.toLowerCase().includes('related questions') || 
        line.toLowerCase().includes('sources:')) {
      break;
    }
    
    // Stop at Guideline Reference (include it, then stop)
    if (line.toLowerCase().includes('guideline reference')) {
      result.push(line);
      break;
    }
    
    if (capturing) {
      result.push(line);
    }
  }
  
  // If extraction failed, return first 200 chars
  if (result.length === 0) {
    return text.substring(0, 200) + (text.length > 200 ? '...' : '');
  }
  
  return result.join('\n');
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Initialize conversation search functionality
 */
function initializeConversationSearch() {
  // Initialize search object
  let conversationSearch = null;

  try {
    conversationSearch = new ConversationSearch(app.session);
    console.log('Conversation search initialized');
  } catch (error) {
    console.error('Failed to initialize conversation search:', error);
    return;
  }

  // Get DOM elements
  const searchInput = document.getElementById('conversation-search-input');
  const clearSearchButton = document.getElementById('clear-search-button');
  const filterChips = document.querySelectorAll('.filter-chip');
  const clearAllFilters = document.getElementById('clear-all-filters');

  if (!searchInput) {
    console.warn('Search input not found, skipping search initialization');
    return;
  }

  // Debounced search
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const term = e.target.value.trim();

    // Show/hide clear button
    if (clearSearchButton) {
      clearSearchButton.style.display = term ? 'flex' : 'none';
    }

    searchTimeout = setTimeout(() => {
      performSearch(conversationSearch, term);
    }, 300); // 300ms debounce
  });

  // Clear search
  if (clearSearchButton) {
    clearSearchButton.addEventListener('click', () => {
      searchInput.value = '';
      clearSearchButton.style.display = 'none';
      clearAllFiltersAndSearch();
    });
  }

  // Filter chips
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      performSearch(conversationSearch, searchInput.value.trim());
    });
  });

  // Clear all filters
  if (clearAllFilters) {
    clearAllFilters.addEventListener('click', () => {
      clearAllFiltersAndSearch();
    });
  }

  // Refresh search index when new entry is added
  window.addEventListener('conversation-entry-added', () => {
    if (conversationSearch) {
      conversationSearch.refreshIndex();
    }
  });

  // Refresh search index when session changes
  window.addEventListener('session-started', () => {
    if (conversationSearch) {
      conversationSearch.refreshIndex();
    }
  });

  window.addEventListener('session-loaded', () => {
    if (conversationSearch) {
      conversationSearch.refreshIndex();
    }
  });

  // Helper function: Perform search
  function performSearch(searchInstance, term) {
    if (!searchInstance) return;

    const activeFilters = Array.from(document.querySelectorAll('.filter-chip.active'))
      .map(chip => chip.dataset.filter);

    const results = searchInstance.search(term, activeFilters);
    app.session.renderConversationList(results);
    updateSearchResultsInfo(results, term, activeFilters);
  }

  // Helper function: Update search results info
  function updateSearchResultsInfo(results, term = '', filters = []) {
    const resultsInfo = document.getElementById('search-results-info');
    const resultsCount = document.getElementById('search-results-count');

    if (!resultsInfo || !resultsCount) return;

    const hasActiveSearch = term || filters.length > 0;

    if (!hasActiveSearch || results.length === 0) {
      resultsInfo.style.display = hasActiveSearch ? 'flex' : 'none';
      if (hasActiveSearch && results.length === 0) {
        resultsCount.textContent = 'No matches found';
      }
      return;
    }

    resultsInfo.style.display = 'flex';

    // Calculate total entry matches
    const totalEntryMatches = results.reduce((sum, r) => sum + r.entryCount, 0);

    if (term) {
      resultsCount.textContent = totalEntryMatches > 0
        ? `${totalEntryMatches} ${totalEntryMatches === 1 ? 'match' : 'matches'} in ${results.length} ${results.length === 1 ? 'conversation' : 'conversations'}`
        : `${results.length} ${results.length === 1 ? 'conversation' : 'conversations'}`;
    } else {
      resultsCount.textContent = `${results.length} ${results.length === 1 ? 'conversation' : 'conversations'}`;
    }
  }

  // Helper function: Clear all filters and search (exposed globally for keyboard shortcuts)
  window.clearAllFiltersAndSearch = function() {
    // Clear search input
    const searchInput = document.getElementById('conversation-search-input');
    if (searchInput) {
      searchInput.value = '';
    }

    const clearSearchButton = document.getElementById('clear-search-button');
    if (clearSearchButton) {
      clearSearchButton.style.display = 'none';
    }

    // Clear all filter chips
    document.querySelectorAll('.filter-chip.active').forEach(chip => {
      chip.classList.remove('active');
    });

    // Reset conversation list
    app.session.renderConversationList();
    updateSearchResultsInfo(null);
  };
}

/**
 * Initialize autocomplete functionality (ghost text + suggestion chips)
 */
function initializeAutocomplete() {
  try {
    // Build trie from session history
    const trie = new AutocompleteTrie();
    trie.buildFromSessions(app.session.getSessions());
    console.log(`Autocomplete trie initialized with ${trie.size()} queries`);

    // Initialize ghost text for instant completions
    const ghostText = new GhostText({
      inputElement: document.getElementById('query-input'),
      trie: trie,
      onAccept: (query, previousValue) => {
        console.log('Accepted autocomplete suggestion:', query);
      }
    });

    // Initialize suggestion chips for Edge LLM suggestions
    const suggestionChips = new SuggestionChips({
      inputElement: document.getElementById('query-input'),
      apiClient: app.apiClient,
      debounceMs: 500, // Wait 500ms after last keystroke
      minQueryLength: 5,
      onSuggestionClick: (query) => {
        console.log('Selected suggestion:', query);
        // Clear suggestions after selection
        suggestionChips.clear();
      }
    });

    // Update trie when new entries are added
    window.addEventListener('conversation-entry-added', (event) => {
      if (event.detail?.query) {
        trie.insert(event.detail.query);
        console.log('Added query to autocomplete trie:', event.detail.query);
      }
    });

    // Rebuild trie when session changes
    window.addEventListener('session-started', () => {
      trie.rebuild(app.session.getSessions());
    });

    window.addEventListener('session-loaded', () => {
      trie.rebuild(app.session.getSessions());
    });

    // Disable autocomplete during query submission
    const originalSubmit = handleQuerySubmit;
    // Note: We don't override handleQuerySubmit here, instead we'll use the loading state

    // Store references for cleanup
    app.autocomplete = { trie, ghostText, suggestionChips };

    console.log('Autocomplete initialized successfully');
  } catch (error) {
    console.error('Failed to initialize autocomplete:', error);
    // Non-critical - app continues without autocomplete
  }
}

/**
 * Clean up on page unload
 */
function cleanupApp() {
  console.log('Cleaning up application...');

  // Save current session
  if (app.session) {
    app.session.saveCurrentSession();
    app.session.destroy();
  }

  // Clean up components
  if (app.queryInput) {
    app.queryInput.destroy();
  }

  if (app.responseActions) {
    app.responseActions.destroy();
  }

  if (app.feedback) {
    app.feedback.destroy();
  }

  if (app.conversation) {
    app.conversation.destroy();
  }

  if (app.loading) {
    app.loading.destroy();
  }

  if (app.sidebar) {
    app.sidebar.destroy();
  }

  if (app.pdfViewer) {
    app.pdfViewer.destroy();
    window.pdfViewer = null;
  }

  // Clean up autocomplete
  if (app.autocomplete) {
    if (app.autocomplete.ghostText) {
      app.autocomplete.ghostText.destroy();
    }
    if (app.autocomplete.suggestionChips) {
      app.autocomplete.suggestionChips.destroy();
    }
    app.autocomplete = null;
  }

  console.log('Application cleanup complete');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Clean up on unload
window.addEventListener('beforeunload', cleanupApp);

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    app,
    initializeApp,
    handleQuerySubmit,
    cleanupApp
  };
}
