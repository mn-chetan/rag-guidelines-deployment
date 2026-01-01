/**
 * GhostText - Ghost text autocomplete overlay for input fields
 * Shows grayed-out completion suggestions that can be accepted with Tab or Arrow keys
 */

class GhostText {
  constructor(options) {
    this.inputElement = options.inputElement;
    this.trie = options.trie;
    this.onAccept = options.onAccept || (() => {});

    this.ghostElement = null;
    this.hintElement = null;
    this.currentSuggestion = '';
    this.isEnabled = true;

    // Bound event handlers for cleanup
    this.boundHandleInput = this.handleInput.bind(this);
    this.boundHandleKeydown = this.handleKeydown.bind(this);
    this.boundHandleBlur = this.handleBlur.bind(this);
    this.boundHandleFocus = this.handleFocus.bind(this);

    this.initialize();
  }

  /**
   * Initialize the ghost text component
   */
  initialize() {
    if (!this.inputElement) {
      console.error('GhostText: Input element not provided');
      return;
    }

    // Create ghost text overlay
    this.createGhostElement();

    // Set up event listeners
    this.inputElement.addEventListener('input', this.boundHandleInput);
    this.inputElement.addEventListener('keydown', this.boundHandleKeydown);
    this.inputElement.addEventListener('blur', this.boundHandleBlur);
    this.inputElement.addEventListener('focus', this.boundHandleFocus);
  }

  /**
   * Create the ghost text overlay element
   */
  createGhostElement() {
    // Ensure the input wrapper has relative positioning
    const wrapper = this.inputElement.closest('.input-wrapper');
    if (wrapper) {
      wrapper.style.position = 'relative';
    }

    // Create ghost text element
    this.ghostElement = document.createElement('div');
    this.ghostElement.className = 'ghost-text';
    this.ghostElement.setAttribute('aria-hidden', 'true');

    // Copy computed styles from input for perfect alignment
    const computed = window.getComputedStyle(this.inputElement);
    this.ghostElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      color: var(--md-sys-color-on-surface-variant, #666);
      opacity: 0.4;
      white-space: pre-wrap;
      overflow: hidden;
      padding: ${computed.padding};
      font-family: ${computed.fontFamily};
      font-size: ${computed.fontSize};
      line-height: ${computed.lineHeight};
      z-index: 0;
      display: none;
    `;

    // Insert ghost element as sibling of input
    this.inputElement.parentNode.insertBefore(this.ghostElement, this.inputElement);

    // Create keyboard hint element
    this.hintElement = document.createElement('div');
    this.hintElement.className = 'ghost-hint';
    this.hintElement.setAttribute('aria-hidden', 'true');
    this.hintElement.textContent = 'Tab to accept';
    this.hintElement.style.cssText = `
      position: absolute;
      right: 48px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 11px;
      color: var(--md-sys-color-on-surface-variant, #666);
      opacity: 0.5;
      pointer-events: none;
      display: none;
    `;

    // Insert hint after input
    if (wrapper) {
      wrapper.appendChild(this.hintElement);
    }
  }

  /**
   * Handle input changes
   */
  handleInput() {
    if (!this.isEnabled) return;
    this.updateGhost();
  }

  /**
   * Handle focus events
   */
  handleFocus() {
    if (!this.isEnabled) return;
    this.updateGhost();
  }

  /**
   * Handle blur events
   */
  handleBlur() {
    // Small delay to allow Tab key to register before hiding
    setTimeout(() => this.hideGhost(), 100);
  }

  /**
   * Update the ghost text based on current input
   */
  updateGhost() {
    const input = this.inputElement.value;

    // Hide if input too short
    if (input.length < 2) {
      this.hideGhost();
      return;
    }

    // Get suggestions from trie
    const suggestions = this.trie.search(input, 1);

    if (suggestions.length === 0) {
      this.hideGhost();
      return;
    }

    const suggestion = suggestions[0];

    // Only show if suggestion starts with current input (case-insensitive)
    if (!suggestion.toLowerCase().startsWith(input.toLowerCase())) {
      this.hideGhost();
      return;
    }

    // Don't show if suggestion equals current input
    if (suggestion.toLowerCase() === input.toLowerCase()) {
      this.hideGhost();
      return;
    }

    this.currentSuggestion = suggestion;

    // Display ghost text: user's text + grayed completion
    // We need to show the full suggestion but the user's typed portion will be invisible
    // (covered by the actual input which has z-index above)
    this.ghostElement.textContent = suggestion;
    this.ghostElement.style.display = 'block';

    // Show hint
    if (this.hintElement) {
      this.hintElement.style.display = 'block';
    }
  }

  /**
   * Hide the ghost text overlay
   */
  hideGhost() {
    this.currentSuggestion = '';

    if (this.ghostElement) {
      this.ghostElement.style.display = 'none';
    }

    if (this.hintElement) {
      this.hintElement.style.display = 'none';
    }
  }

  /**
   * Handle keydown events for accepting suggestions
   * @param {KeyboardEvent} event
   */
  handleKeydown(event) {
    if (!this.currentSuggestion) return;

    // Tab - accept full suggestion
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      this.acceptSuggestion();
      return;
    }

    // Right arrow at end of input - accept next word
    if (event.key === 'ArrowRight') {
      const selectionAtEnd = this.inputElement.selectionStart === this.inputElement.value.length;
      if (selectionAtEnd) {
        event.preventDefault();
        this.acceptNextWord();
        return;
      }
    }

    // Escape - dismiss suggestion
    if (event.key === 'Escape') {
      this.hideGhost();
      return;
    }
  }

  /**
   * Accept the full suggestion
   */
  acceptSuggestion() {
    if (!this.currentSuggestion) return;

    const previousValue = this.inputElement.value;
    this.inputElement.value = this.currentSuggestion;

    // Trigger input event for other listeners
    this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));

    // Move cursor to end
    this.inputElement.selectionStart = this.inputElement.selectionEnd = this.currentSuggestion.length;

    this.hideGhost();

    // Callback
    this.onAccept(this.currentSuggestion, previousValue);
  }

  /**
   * Accept the next word from the suggestion
   */
  acceptNextWord() {
    if (!this.currentSuggestion) return;

    const current = this.inputElement.value;
    const remaining = this.currentSuggestion.substring(current.length);

    if (!remaining) {
      this.hideGhost();
      return;
    }

    // Find next word boundary (space or end)
    const trimmedRemaining = remaining.trimStart();
    const leadingSpaces = remaining.length - trimmedRemaining.length;
    const nextSpaceIndex = trimmedRemaining.indexOf(' ');

    let nextWord;
    if (nextSpaceIndex === -1) {
      // No more spaces, accept rest
      nextWord = remaining;
    } else {
      // Include leading spaces + word + trailing space
      nextWord = remaining.substring(0, leadingSpaces + nextSpaceIndex + 1);
    }

    this.inputElement.value = current + nextWord;

    // Trigger input event
    this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));

    // Move cursor to end
    this.inputElement.selectionStart = this.inputElement.selectionEnd = this.inputElement.value.length;

    // Update ghost (may hide if complete)
    this.updateGhost();
  }

  /**
   * Enable or disable ghost text
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.hideGhost();
    }
  }

  /**
   * Update the trie reference (for when sessions change)
   * @param {AutocompleteTrie} trie
   */
  setTrie(trie) {
    this.trie = trie;
    this.updateGhost();
  }

  /**
   * Clean up and destroy the component
   */
  destroy() {
    // Remove event listeners
    if (this.inputElement) {
      this.inputElement.removeEventListener('input', this.boundHandleInput);
      this.inputElement.removeEventListener('keydown', this.boundHandleKeydown);
      this.inputElement.removeEventListener('blur', this.boundHandleBlur);
      this.inputElement.removeEventListener('focus', this.boundHandleFocus);
    }

    // Remove DOM elements
    if (this.ghostElement && this.ghostElement.parentNode) {
      this.ghostElement.parentNode.removeChild(this.ghostElement);
    }

    if (this.hintElement && this.hintElement.parentNode) {
      this.hintElement.parentNode.removeChild(this.hintElement);
    }

    this.ghostElement = null;
    this.hintElement = null;
    this.currentSuggestion = '';
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GhostText;
}
