/**
 * Text Fragment URL Utilities
 * Provides functions for creating deep-linking URLs with text highlighting
 * using the Text Fragments API (https://wicg.github.io/scroll-to-text-fragment/)
 */

/**
 * Check if browser supports Text Fragments API
 * @returns {boolean} True if supported
 */
function supportsTextFragments() {
  // Primary check: fragmentDirective API
  if ('fragmentDirective' in document) {
    return true;
  }

  // Fallback: User-agent detection for known supporting browsers
  const ua = navigator.userAgent.toLowerCase();
  const isChrome = ua.includes('chrome') && !ua.includes('edg');
  const isEdge = ua.includes('edg');
  const isSafari = ua.includes('safari') && !ua.includes('chrome');

  // Chrome 80+, Edge 80+, Safari 16.1+ support Text Fragments
  return isChrome || isEdge || isSafari;
}

/**
 * Sanitize text for use in URL fragment
 * @param {string} text - Text to sanitize
 * @returns {string} Cleaned text
 */
function sanitizeFragment(text) {
  // First decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  let decoded = textarea.value;
  
  return decoded
    .replace(/[<>]/g, '')           // Remove HTML tags
    .replace(/[""]/g, '"')          // Normalize smart quotes
    .replace(/['']/g, "'")          // Normalize smart apostrophes
    .replace(/…/g, '.')              // Replace ellipsis character with period
    .replace(/\.{2,}/g, '.')         // Replace multiple dots with single period
    .replace(/&nbsp;/g, ' ')         // Normalize non-breaking spaces
    .replace(/\s*\[\d+\]\s*/g, ' ')  // Remove reference markers [1], [2]
    .replace(/\s+/g, ' ')            // Collapse whitespace
    .replace(/\.\s*\./g, '.')        // Clean up any double periods from replacements
    .trim();
}

/**
 * Common English stop words to ignore when extracting keywords
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
  'until', 'while', 'about', 'against', 'what', 'which', 'who', 'whom', 'this',
  'that', 'these', 'those', 'am', 'been', 'being', 'both', 'it', 'its', 'i', 'me', 'my'
]);

/**
 * Extract keywords from text (remove stop words, lowercase, get unique terms)
 * @param {string} text - Text to extract keywords from
 * @returns {Set<string>} Set of lowercase keywords
 */
function extractKeywords(text) {
  if (!text) return new Set();
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
  
  return new Set(words);
}

/**
 * Clean snippet text for processing
 * @param {string} text - Raw snippet text
 * @returns {string} Cleaned text
 */
function cleanSnippet(text) {
  let cleaned = text
    .replace(/^#+\s+/gm, '')             // Remove markdown headings
    .replace(/\*\*(.*?)\*\*/g, '$1')     // Remove bold
    .replace(/__(.*?)__/g, '$1')         // Remove italic
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')  // Remove links
    .replace(/`(.*?)`/g, '$1')           // Remove code
    .replace(/…/g, '.')                  // Ellipsis to period
    .replace(/\.{2,}/g, '.')             // Multiple dots to period
    .replace(/&nbsp;/g, ' ')             // Normalize nbsp
    .replace(/\s*\[\d+\]\s*/g, ' ')      // Remove reference markers
    .replace(/\s+/g, ' ')                // Collapse whitespace
    .trim();
  
  // Decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = cleaned;
  return textarea.value;
}

/**
 * Extract optimal text fragment from snippet using query keywords
 * @param {string} snippet - The source snippet text
 * @param {Object} options - Options for extraction
 * @param {string} options.query - User's query (for keyword matching)
 * @param {number} options.maxWords - Maximum words in fragment (default: 10)
 * @param {number} options.minWords - Minimum words in fragment (default: 3)
 * @returns {string} Extracted text fragment
 */
function extractTextFragment(snippet, options = {}) {
  const query = options.query || '';
  const maxWords = options.maxWords || 10;
  const minWords = options.minWords || 3;

  if (!snippet || typeof snippet !== 'string') {
    return '';
  }

  // Clean the snippet
  const cleaned = cleanSnippet(snippet.split(/\n+/)[0] || snippet);
  
  // Extract keywords from query
  const queryKeywords = extractKeywords(query);
  
  // Split into sentences
  const sentences = cleaned.split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  if (sentences.length === 0) {
    return sanitizeFragment(cleaned.split(/\s+/).slice(0, maxWords).join(' '));
  }
  
  // Score each sentence by keyword overlap
  const scoredSentences = sentences.map(sentence => {
    const words = sentence.split(/\s+/);
    const wordCount = words.length;
    
    // Skip if too short or too long
    if (wordCount < minWords || wordCount > maxWords) {
      return { sentence, score: -1, wordCount };
    }
    
    // Calculate keyword overlap score
    const sentenceKeywords = extractKeywords(sentence);
    let score = 0;
    
    for (const keyword of queryKeywords) {
      if (sentenceKeywords.has(keyword)) {
        score += 2;  // Exact match
      } else {
        // Check for partial match (e.g., "kyc" matches "kyc-related")
        for (const sentenceWord of sentenceKeywords) {
          if (sentenceWord.includes(keyword) || keyword.includes(sentenceWord)) {
            score += 1;
            break;
          }
        }
      }
    }
    
    // Bonus for shorter sentences (prefer concise)
    if (wordCount <= 6) score += 1;
    
    return { sentence, score, wordCount };
  });
  
  // Sort by score (highest first), then by word count (shorter first)
  scoredSentences.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.wordCount - b.wordCount;
  });
  
  // Return best match if it has any keyword overlap
  if (scoredSentences.length > 0 && scoredSentences[0].score > 0) {
    return sanitizeFragment(scoredSentences[0].sentence);
  }
  
  // Fallback: return first sentence that fits word limits
  const validSentence = scoredSentences.find(s => s.score >= 0);
  if (validSentence) {
    return sanitizeFragment(validSentence.sentence);
  }
  
  // Last resort: first N words
  return sanitizeFragment(cleaned.split(/\s+/).slice(0, maxWords).join(' '));
}

/**
 * Build a Text Fragment URL
 * @param {string} baseUrl - The base URL
 * @param {string} fragmentText - The text to highlight
 * @returns {string} URL with text fragment
 */
function buildTextFragmentUrl(baseUrl, fragmentText) {
  if (!baseUrl || !fragmentText) {
    return baseUrl;
  }

  // Remove any existing hash/fragment
  const urlWithoutHash = baseUrl.split('#')[0];

  // Encode the fragment text
  const encoded = encodeURIComponent(fragmentText);

  // Construct Text Fragment URL
  // Format: #:~:text=textStart
  return `${urlWithoutHash}#:~:text=${encoded}`;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    supportsTextFragments,
    sanitizeFragment,
    extractTextFragment,
    buildTextFragmentUrl
  };
}
