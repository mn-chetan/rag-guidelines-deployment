/**
 * AutocompleteTrie - Prefix-based autocomplete using Trie data structure
 * Provides instant (<10ms) suggestions from query history
 */

class AutocompleteTrie {
  constructor() {
    this.root = {};
    this.queries = []; // Store full queries with metadata for scoring
  }

  /**
   * Insert a query into the trie
   * @param {string} query - The query to insert
   * @param {number} timestamp - Optional timestamp for recency scoring
   */
  insert(query, timestamp = Date.now()) {
    const normalized = query.toLowerCase().trim();
    if (normalized.length < 3) return;

    let node = this.root;
    for (const char of normalized) {
      if (!node[char]) node[char] = {};
      node = node[char];
    }

    // Mark end of word and store metadata
    node.isEnd = true;
    node.fullQuery = query; // Store original casing
    node.count = (node.count || 0) + 1;
    node.lastUsed = Math.max(node.lastUsed || 0, timestamp);

    // Track in queries array for potential future use
    this.queries.push({ query, timestamp });
  }

  /**
   * Find completions for a prefix
   * @param {string} prefix - The prefix to search for
   * @param {number} limit - Maximum number of results
   * @returns {Array} Array of matching queries sorted by relevance
   */
  search(prefix, limit = 5) {
    const normalized = prefix.toLowerCase().trim();
    if (normalized.length < 2) return [];

    // Navigate to prefix node
    let node = this.root;
    for (const char of normalized) {
      if (!node[char]) return [];
      node = node[char];
    }

    // Collect all completions from this node
    const results = [];
    this.collectCompletions(node, results, prefix);

    // Sort by score (frequency + recency + depth bonus)
    const now = Date.now();
    results.sort((a, b) => {
      // Calculate recency bonus (more recent = higher score)
      const recencyA = Math.max(0, 1 - (now - a.lastUsed) / (7 * 24 * 60 * 60 * 1000)); // Decay over 7 days
      const recencyB = Math.max(0, 1 - (now - b.lastUsed) / (7 * 24 * 60 * 60 * 1000));

      const scoreA = a.count * 2 + recencyA * 5 + a.depthBonus;
      const scoreB = b.count * 2 + recencyB * 5 + b.depthBonus;

      return scoreB - scoreA;
    });

    return results.slice(0, limit).map(r => r.query);
  }

  /**
   * Recursively collect all completions from a node
   * @param {Object} node - Current trie node
   * @param {Array} results - Array to store results
   * @param {string} prefix - The original prefix
   * @param {number} depth - Current depth from prefix node
   */
  collectCompletions(node, results, prefix, depth = 0) {
    // Prevent infinite recursion and limit depth
    if (depth > 100) return;

    if (node.isEnd) {
      results.push({
        query: node.fullQuery,
        count: node.count || 1,
        lastUsed: node.lastUsed || 0,
        depthBonus: depth < 10 ? 10 - depth : 0 // Prefer shorter completions
      });
    }

    // Recurse into child nodes
    for (const char in node) {
      if (char !== 'isEnd' && char !== 'fullQuery' && char !== 'count' && char !== 'lastUsed') {
        this.collectCompletions(node[char], results, prefix, depth + 1);
      }
    }
  }

  /**
   * Build trie from session history
   * @param {Array} sessions - Array of session objects with entries
   */
  buildFromSessions(sessions) {
    if (!sessions || !Array.isArray(sessions)) return;

    sessions.forEach(session => {
      if (!session.entries || !Array.isArray(session.entries)) return;

      session.entries.forEach(entry => {
        if (entry.query) {
          this.insert(entry.query, entry.timestamp || Date.now());
        }
      });
    });
  }

  /**
   * Clear and rebuild the trie from sessions
   * @param {Array} sessions - Array of session objects
   */
  rebuild(sessions) {
    this.root = {};
    this.queries = [];
    this.buildFromSessions(sessions);
  }

  /**
   * Get the total number of unique queries in the trie
   * @returns {number} Count of unique queries
   */
  size() {
    let count = 0;
    const countNodes = (node) => {
      if (node.isEnd) count++;
      for (const char in node) {
        if (char !== 'isEnd' && char !== 'fullQuery' && char !== 'count' && char !== 'lastUsed') {
          countNodes(node[char]);
        }
      }
    };
    countNodes(this.root);
    return count;
  }

  /**
   * Check if a query exists exactly in the trie
   * @param {string} query - The query to check
   * @returns {boolean} True if exact match exists
   */
  has(query) {
    const normalized = query.toLowerCase().trim();
    let node = this.root;

    for (const char of normalized) {
      if (!node[char]) return false;
      node = node[char];
    }

    return !!node.isEnd;
  }

  /**
   * Remove a query from the trie
   * @param {string} query - The query to remove
   * @returns {boolean} True if removed successfully
   */
  remove(query) {
    const normalized = query.toLowerCase().trim();
    let node = this.root;
    const path = [{ node: this.root, char: null }];

    // Navigate to the query, recording path
    for (const char of normalized) {
      if (!node[char]) return false;
      node = node[char];
      path.push({ node, char });
    }

    if (!node.isEnd) return false;

    // Mark as not end
    delete node.isEnd;
    delete node.fullQuery;
    delete node.count;
    delete node.lastUsed;

    // Clean up empty nodes from bottom up
    for (let i = path.length - 1; i > 0; i--) {
      const { node: currentNode, char } = path[i];
      const hasChildren = Object.keys(currentNode).some(
        k => k !== 'isEnd' && k !== 'fullQuery' && k !== 'count' && k !== 'lastUsed'
      );

      if (!hasChildren && !currentNode.isEnd && char) {
        delete path[i - 1].node[char];
      } else {
        break;
      }
    }

    return true;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AutocompleteTrie;
}
