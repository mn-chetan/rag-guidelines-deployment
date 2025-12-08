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
  return text
    .replace(/[<>]/g, '')        // Remove HTML tags
    .replace(/[""]/g, '"')       // Normalize smart quotes
    .replace(/[''/]/g, "'")      // Normalize smart apostrophes
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim();
}

/**
 * Extract optimal text fragment from snippet
 * @param {string} snippet - The source snippet text
 * @param {Object} options - Options for extraction
 * @param {number} options.maxWords - Maximum words in fragment (default: 40)
 * @param {number} options.minWords - Minimum words for sentence extraction (default: 15)
 * @returns {string} Extracted text fragment
 */
function extractTextFragment(snippet, options = {}) {
  const maxWords = options.maxWords || 40;
  const minWords = options.minWords || 15;

  if (!snippet || typeof snippet !== 'string') {
    return '';
  }

  // 1. If snippet has multiple paragraphs/passages, take only the first one
  // Discovery Engine may return multiple snippets joined with newlines
  const firstParagraph = snippet.split(/\n+/)[0];

  // 2. Clean the snippet - remove markdown formatting
  let cleaned = firstParagraph
    .replace(/\*\*(.*?)\*\*/g, '$1')    // Remove bold **text**
    .replace(/__(.*?)__/g, '$1')         // Remove italic __text__
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove [links](url)
    .replace(/`(.*?)`/g, '$1')           // Remove `code`
    .replace(/\s+/g, ' ')                // Collapse multiple spaces
    .trim();

  // 2. Try to extract first complete sentence
  const sentenceMatch = cleaned.match(/^[^.!?]+[.!?]/);
  if (sentenceMatch) {
    const firstSentence = sentenceMatch[0].trim();
    const wordCount = firstSentence.split(/\s+/).length;

    // Use sentence if it's within our word range
    if (wordCount >= minWords && wordCount <= maxWords) {
      return sanitizeFragment(firstSentence);
    }
  }

  // 3. Fallback: Take first N words
  const words = cleaned.split(/\s+/);
  const fragmentWords = words.slice(0, Math.min(maxWords, words.length));
  const fragment = fragmentWords.join(' ');

  return sanitizeFragment(fragment);
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
