/**
 * ConversationSearch - Fuzzy search implementation for conversation history
 * Uses Fuse.js for typo-tolerant searching across queries, answers, and session titles
 */

class ConversationSearch {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.searchTerm = '';
    this.activeFilters = new Set();
    this.fuse = null;
    this.initializeFuse();
  }

  /**
   * Initialize Fuse.js search index with flattened conversation data
   */
  initializeFuse() {
    const sessions = this.sessionManager.getSessions();

    // Flatten sessions and entries into searchable items
    const searchableItems = [];
    sessions.forEach(session => {
      // Add session title as searchable
      searchableItems.push({
        type: 'session',
        sessionId: session.id,
        session: session,
        text: session.title,
        timestamp: session.updatedAt
      });

      // Add each entry as searchable (query + answer combined)
      session.entries.forEach(entry => {
        searchableItems.push({
          type: 'entry',
          sessionId: session.id,
          entryId: entry.id,
          session: session,
          entry: entry,
          text: `${entry.query} ${entry.answer}`,
          timestamp: entry.timestamp
        });
      });
    });

    // Configure Fuse.js options for fuzzy matching
    const fuseOptions = {
      includeScore: true,      // Include relevance score
      includeMatches: true,    // Include match indices for highlighting
      threshold: 0.4,          // 0 = exact match, 1 = match anything (0.4 = good balance)
      location: 0,             // Expected position of match
      distance: 100,           // Max distance from location
      minMatchCharLength: 2,   // Minimum match length
      keys: [
        { name: 'text', weight: 1.0 }
      ]
    };

    this.fuse = new Fuse(searchableItems, fuseOptions);
  }

  /**
   * Main search method with fuzzy matching and filtering
   * @param {string} term - Search query
   * @param {Array} filters - Active filter names (e.g., ['today', 'feedback'])
   * @returns {Array} Array of search results grouped by session
   */
  search(term, filters = []) {
    if (!term || term.trim().length < 2) {
      // No search term - apply filters only
      return this.filterOnly(filters);
    }

    // Perform fuzzy search with Fuse.js
    const fuseResults = this.fuse.search(term);

    // Group results by session
    const sessionMap = new Map();

    fuseResults.forEach(result => {
      const item = result.item;
      const sessionId = item.sessionId;

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          session: item.session,
          matches: [],
          maxScore: result.score,
          entryCount: 0
        });
      }

      const sessionResult = sessionMap.get(sessionId);
      sessionResult.matches.push({
        type: item.type,
        score: result.score,
        matches: result.matches, // Fuse.js match indices for highlighting
        item: item
      });

      if (item.type === 'entry') {
        sessionResult.entryCount++;
      }

      // Track best score for sorting (lower = better in Fuse.js)
      if (result.score < sessionResult.maxScore) {
        sessionResult.maxScore = result.score;
      }
    });

    // Convert to array and apply filters
    let results = Array.from(sessionMap.values());
    results = results.filter(result => this.passesFilters(result.session, filters));

    // Sort by relevance (lower score = better match in Fuse.js)
    results.sort((a, b) => a.maxScore - b.maxScore);

    return results;
  }

  /**
   * Filter-only mode when no search term is provided
   * @param {Array} filters - Active filter names
   * @returns {Array} Filtered sessions sorted by recency
   */
  filterOnly(filters) {
    const sessions = this.sessionManager.getSessions();
    const hasActiveFilters = filters.length > 0;
    
    return sessions
      .filter(session => this.passesFilters(session, filters))
      .map(session => ({
        session,
        matches: [],
        maxScore: 0,
        // Only show entry count badge when filters are active
        entryCount: hasActiveFilters ? session.entries.length : 0
      }))
      .sort((a, b) => b.session.updatedAt - a.session.updatedAt);
  }

  /**
   * Check if a session passes all active filters
   * @param {Object} session - Session object
   * @param {Array} filters - Active filter names
   * @returns {boolean} True if session passes all filters
   */
  passesFilters(session, filters) {
    if (filters.length === 0) return true;

    for (const filter of filters) {
      switch (filter) {
        case 'today':
          const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
          if (session.updatedAt < oneDayAgo) return false;
          break;

        case 'week':
          const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
          if (session.updatedAt < oneWeekAgo) return false;
          break;

        case 'month':
          const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
          if (session.updatedAt < oneMonthAgo) return false;
          break;

        case 'feedback':
          const hasFeedback = session.entries.some(e => e.feedback !== null);
          if (!hasFeedback) return false;
          break;

        case 'images':
          const hasImages = session.entries.some(e => e.images && e.images.length > 0);
          if (!hasImages) return false;
          break;
      }
    }

    return true;
  }

  /**
   * Generate highlighted HTML from Fuse.js match indices
   * @param {string} text - Original text
   * @param {Array} matches - Fuse.js matches with indices
   * @returns {string} HTML with highlighted matches
   */
  highlightMatches(text, matches) {
    if (!matches || matches.length === 0) return text;

    // Get match indices from first match key
    const indices = matches[0].indices;
    if (!indices || indices.length === 0) return text;

    // Sort indices by start position
    const sortedIndices = [...indices].sort((a, b) => a[0] - b[0]);

    // Build highlighted HTML
    let result = '';
    let lastIndex = 0;

    sortedIndices.forEach(([start, end]) => {
      // Add text before match
      result += text.substring(lastIndex, start);

      // Add highlighted match
      result += `<span class="search-highlight">${text.substring(start, end + 1)}</span>`;

      lastIndex = end + 1;
    });

    // Add remaining text
    result += text.substring(lastIndex);

    return result;
  }

  /**
   * Re-index search data when sessions change
   * Call this when new conversations are added or modified
   */
  refreshIndex() {
    this.initializeFuse();
  }
}
