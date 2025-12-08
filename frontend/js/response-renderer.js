/**
 * Response Renderer Component
 * Parses and renders markdown-style formatted responses with source citations
 */

class ResponseRenderer {
  constructor(options = {}) {
    // Configuration
    this.animationDuration = options.animationDuration || 300;
    this.enableAnimations = options.enableAnimations !== undefined ? options.enableAnimations : true;
  }

  /**
   * Render a complete response with formatting and sources
   * @param {Object} response - The response object
   * @param {string} response.answer - The response text to render
   * @param {Array} response.sources - Array of source objects
   * @returns {HTMLElement} The rendered response element
   */
  render(response) {
    if (!response || typeof response.answer !== 'string') {
      console.error('Invalid response object');
      return this.createErrorElement('Unable to render response');
    }

    // Create container
    const container = document.createElement('div');
    container.className = 'rendered-response';
    
    // Parse and render the answer text
    const contentElement = this.parseAndRender(response.answer);
    container.appendChild(contentElement);
    
    // Render source citations if available
    if (response.sources && response.sources.length > 0) {
      const sourcesElement = this.renderSources(response.sources);
      container.appendChild(sourcesElement);
    }
    
    // Apply reveal animation
    if (this.enableAnimations) {
      this.applyRevealAnimation(container);
    }
    
    return container;
  }

  /**
   * Parse markdown-style text and render as HTML
   * @param {string} text - The text to parse
   * @returns {HTMLElement} The rendered content element
   */
  parseAndRender(text) {
    const container = document.createElement('div');
    container.className = 'response-content';
    
    // Split text into blocks (paragraphs, lists, code blocks, etc.)
    const blocks = this.parseBlocks(text);
    
    // Render each block
    blocks.forEach(block => {
      const element = this.renderBlock(block);
      if (element) {
        container.appendChild(element);
      }
    });
    
    return container;
  }

  /**
   * Parse text into blocks
   * @param {string} text - The text to parse
   * @returns {Array} Array of block objects
   */
  parseBlocks(text) {
    const blocks = [];
    
    // Check for Related Questions section and extract it
    const relatedQuestionsMatch = text.match(/\*\*Related Questions\*\*:\s*\n((?:\s*-\s*.+\n?)+)/i);
    let mainText = text;
    let relatedQuestions = [];
    
    if (relatedQuestionsMatch) {
      // Extract the questions
      const questionsText = relatedQuestionsMatch[1];
      const questionMatches = questionsText.match(/-\s*(.+)/g);
      if (questionMatches) {
        relatedQuestions = questionMatches.map(q => q.replace(/^-\s*/, '').trim());
      }
      // Remove the Related Questions section from main text
      mainText = text.replace(/\*\*Related Questions\*\*:\s*\n(?:\s*-\s*.+\n?)+/i, '').trim();
    }
    
    const lines = mainText.split('\n');
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i];
      
      // Skip empty lines
      if (line.trim() === '') {
        i++;
        continue;
      }
      
      // Check for headings (# ## ###)
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        blocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          content: headingMatch[2]
        });
        i++;
        continue;
      }
      
      // Check for code blocks (```)
      if (line.trim().startsWith('```')) {
        const codeBlock = this.parseCodeBlock(lines, i);
        blocks.push(codeBlock.block);
        i = codeBlock.nextIndex;
        continue;
      }
      
      // Check for unordered lists (- or *)
      if (line.match(/^\s*[-*]\s+/)) {
        const listBlock = this.parseList(lines, i, 'ul');
        blocks.push(listBlock.block);
        i = listBlock.nextIndex;
        continue;
      }
      
      // Check for ordered lists (1. 2. etc.)
      if (line.match(/^\s*\d+\.\s+/)) {
        const listBlock = this.parseList(lines, i, 'ol');
        blocks.push(listBlock.block);
        i = listBlock.nextIndex;
        continue;
      }
      
      // Otherwise, treat as paragraph
      const paragraphBlock = this.parseParagraph(lines, i);
      blocks.push(paragraphBlock.block);
      i = paragraphBlock.nextIndex;
    }
    
    // Add related questions block at the end if we have any
    if (relatedQuestions.length > 0) {
      blocks.push({
        type: 'relatedQuestions',
        questions: relatedQuestions
      });
    }
    
    return blocks;
  }

  /**
   * Parse a code block
   * @param {Array} lines - All lines
   * @param {number} startIndex - Starting index
   * @returns {Object} Block object and next index
   */
  parseCodeBlock(lines, startIndex) {
    const language = lines[startIndex].trim().substring(3).trim();
    const codeLines = [];
    let i = startIndex + 1;
    
    // Find closing ```
    while (i < lines.length && !lines[i].trim().startsWith('```')) {
      codeLines.push(lines[i]);
      i++;
    }
    
    return {
      block: {
        type: 'code',
        language: language || 'text',
        content: codeLines.join('\n')
      },
      nextIndex: i + 1
    };
  }

  /**
   * Parse a list (ordered or unordered)
   * @param {Array} lines - All lines
   * @param {number} startIndex - Starting index
   * @param {string} listType - 'ul' or 'ol'
   * @returns {Object} Block object and next index
   */
  parseList(lines, startIndex, listType) {
    const items = [];
    let i = startIndex;
    const pattern = listType === 'ul' ? /^\s*[-*]\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
    
    while (i < lines.length) {
      const match = lines[i].match(pattern);
      if (!match) {
        break;
      }
      items.push(match[1]);
      i++;
    }
    
    return {
      block: {
        type: 'list',
        listType: listType,
        items: items
      },
      nextIndex: i
    };
  }

  /**
   * Parse a paragraph
   * @param {Array} lines - All lines
   * @param {number} startIndex - Starting index
   * @returns {Object} Block object and next index
   */
  parseParagraph(lines, startIndex) {
    const paragraphLines = [];
    let i = startIndex;
    
    while (i < lines.length) {
      const line = lines[i];
      
      // Stop at empty line or special syntax
      if (line.trim() === '' || 
          line.match(/^#{1,3}\s+/) ||
          line.trim().startsWith('```') ||
          line.match(/^\s*[-*]\s+/) ||
          line.match(/^\s*\d+\.\s+/)) {
        break;
      }
      
      paragraphLines.push(line);
      i++;
    }
    
    return {
      block: {
        type: 'paragraph',
        content: paragraphLines.join(' ')
      },
      nextIndex: i
    };
  }

  /**
   * Render a block element
   * @param {Object} block - The block to render
   * @returns {HTMLElement} The rendered element
   */
  renderBlock(block) {
    switch (block.type) {
      case 'heading':
        return this.renderHeading(block);
      case 'paragraph':
        return this.renderParagraph(block);
      case 'list':
        return this.renderList(block);
      case 'code':
        return this.renderCodeBlock(block);
      case 'relatedQuestions':
        return this.renderRelatedQuestions(block);
      default:
        return null;
    }
  }

  /**
   * Render a heading
   * @param {Object} block - The heading block
   * @returns {HTMLElement} The heading element
   */
  renderHeading(block) {
    const tag = `h${block.level}`;
    const element = document.createElement(tag);
    element.innerHTML = this.parseInlineFormatting(block.content);
    return element;
  }

  /**
   * Render a paragraph
   * @param {Object} block - The paragraph block
   * @returns {HTMLElement} The paragraph element
   */
  renderParagraph(block) {
    const element = document.createElement('p');
    element.innerHTML = this.parseInlineFormatting(block.content);
    return element;
  }

  /**
   * Render a list
   * @param {Object} block - The list block
   * @returns {HTMLElement} The list element
   */
  renderList(block) {
    const element = document.createElement(block.listType);
    
    block.items.forEach(itemText => {
      const li = document.createElement('li');
      li.innerHTML = this.parseInlineFormatting(itemText);
      element.appendChild(li);
    });
    
    return element;
  }

  /**
   * Render a code block
   * @param {Object} block - The code block
   * @returns {HTMLElement} The code block element
   */
  renderCodeBlock(block) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    
    if (block.language) {
      code.className = `language-${block.language}`;
    }
    
    code.textContent = block.content;
    pre.appendChild(code);
    
    return pre;
  }

  /**
   * Render related questions as clickable boxes
   * @param {Object} block - The related questions block
   * @returns {HTMLElement} The related questions element
   */
  renderRelatedQuestions(block) {
    const container = document.createElement('div');
    container.className = 'related-questions';
    
    const title = document.createElement('div');
    title.className = 'related-questions-title';
    title.textContent = 'Related Questions:';
    container.appendChild(title);
    
    const questionsGrid = document.createElement('div');
    questionsGrid.className = 'related-questions-grid';
    
    block.questions.forEach(question => {
      // Clean up the question text (remove brackets if present)
      const cleanQuestion = question.replace(/^\[|\]$/g, '').trim();

      const questionBox = document.createElement('button');
      questionBox.className = 'related-question-card';

      // Add Material icon
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.textContent = 'chat_bubble';
      icon.style.fontSize = '18px';
      icon.style.position = 'relative';
      icon.style.zIndex = '1';

      // Add question text
      const textSpan = document.createElement('span');
      textSpan.textContent = cleanQuestion;
      textSpan.style.position = 'relative';
      textSpan.style.zIndex = '1';

      questionBox.appendChild(icon);
      questionBox.appendChild(textSpan);
      questionBox.dataset.query = cleanQuestion;
      questionBox.setAttribute('aria-label', `Ask: ${cleanQuestion}`);

      // Click is handled by global event listener in app.js via the class and data-query

      questionsGrid.appendChild(questionBox);
    });
    
    container.appendChild(questionsGrid);
    
    return container;
  }

  /**
   * Parse inline formatting (bold, italic, code)
   * @param {string} text - The text to parse
   * @returns {string} HTML string with inline formatting
   */
  parseInlineFormatting(text) {
    // Escape HTML first
    let result = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Parse inline code (`code`)
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Parse bold (**text** or __text__)
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    
    // Parse italic (*text* or _text_)
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    result = result.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    return result;
  }

  /**
   * Render source citations
   * @param {Array} sources - Array of source objects
   * @returns {HTMLElement} The sources element
   */
  renderSources(sources) {
    const container = document.createElement('div');
    container.className = 'source-citations';
    
    const title = document.createElement('div');
    title.className = 'source-citations-title';
    title.textContent = 'Sources:';
    container.appendChild(title);
    
    const linksContainer = document.createElement('div');
    linksContainer.className = 'source-citations-links';
    
    sources.forEach((source, index) => {
      const link = this.renderSourceLink(source, index + 1);
      linksContainer.appendChild(link);
    });
    
    container.appendChild(linksContainer);
    
    return container;
  }

  /**
   * Render a single source link
   * @param {Object} source - The source object
   * @param {number} index - The source index (for numbering)
   * @returns {HTMLElement} The source link element
   */
  renderSourceLink(source, index) {
    const link = document.createElement('a');
    link.className = 'source-citation-link';
    link.setAttribute('aria-label', `Source ${index}: ${source.title || 'Untitled'}`);
    
    // Check if this is a PDF link (GCS bucket or .pdf extension)
    const url = source.url || source.link || '#';
    const isPDF = url.includes('.pdf') || url.includes('storage.cloud.google.com') || url.includes('storage.googleapis.com');
    
    if (isPDF) {
      // Make it open in PDF viewer instead of new tab
      link.href = '#';
      link.classList.add('pdf-source');
      link.dataset.pdfUrl = url;
      link.dataset.pdfTitle = source.title || `Source ${index}`;
      link.dataset.pdfSnippet = source.snippet || '';
      
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.openPDFViewer(url, source.snippet || '', source.title || `Source ${index}`);
      });
    } else {
      // Apply text fragment highlighting for web sources
      const shouldHighlight = source.snippet &&
                              source.snippet.trim().length > 0 &&
                              !url.includes('#') &&  // Don't override existing anchors
                              supportsTextFragments();

      if (shouldHighlight) {
        const fragment = extractTextFragment(source.snippet, { maxWords: 40 });
        if (fragment) {
          link.href = buildTextFragmentUrl(url, fragment);
        } else {
          link.href = url;
        }
      } else {
        link.href = url;

        // For browsers that don't support text fragments, show snippet in tooltip
        if (!supportsTextFragments() && source.snippet) {
          link.title = `Snippet: ${source.snippet.substring(0, 150)}${source.snippet.length > 150 ? '...' : ''}`;
        }
      }

      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    
    // Add icon
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined source-citation-icon';
    icon.textContent = isPDF ? 'description' : 'link';
    icon.setAttribute('aria-hidden', 'true');
    
    // Add text
    const text = document.createElement('span');
    text.className = 'source-citation-text';
    text.textContent = source.title || `Source ${index}`;
    
    link.appendChild(icon);
    link.appendChild(text);
    
    return link;
  }

  /**
   * Open the PDF viewer with a document
   * @param {string} url - PDF URL
   * @param {string} snippet - Text snippet to highlight
   * @param {string} title - Document title
   */
  openPDFViewer(url, snippet, title) {
    // Use global PDF viewer instance if available
    if (window.pdfViewer) {
      window.pdfViewer.open(url, snippet, title);
    } else {
      // Fallback: open in new tab
      window.open(url, '_blank');
    }
  }

  /**
   * Apply smooth reveal animation to an element
   * @param {HTMLElement} element - The element to animate
   */
  applyRevealAnimation(element) {
    // Set initial state
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    element.style.transition = `opacity ${this.animationDuration}ms ease-out, transform ${this.animationDuration}ms ease-out`;
    
    // Trigger animation on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
      });
    });
    
    // Clean up transition after animation completes
    setTimeout(() => {
      element.style.transition = '';
    }, this.animationDuration);
  }

  /**
   * Create an error element
   * @param {string} message - The error message
   * @returns {HTMLElement} The error element
   */
  createErrorElement(message) {
    const element = document.createElement('div');
    element.className = 'response-error';
    element.textContent = message;
    return element;
  }

  /**
   * Render response into a target element
   * @param {Object} response - The response object
   * @param {HTMLElement} targetElement - The target element to render into
   */
  renderInto(response, targetElement) {
    if (!targetElement) {
      console.error('Target element not provided');
      return;
    }
    
    const rendered = this.render(response);
    targetElement.innerHTML = '';
    targetElement.appendChild(rendered);
  }

  /**
   * Update animation settings
   * @param {Object} settings - Animation settings
   */
  updateSettings(settings) {
    if (settings.animationDuration !== undefined) {
      this.animationDuration = settings.animationDuration;
    }
    if (settings.enableAnimations !== undefined) {
      this.enableAnimations = settings.enableAnimations;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResponseRenderer;
}
