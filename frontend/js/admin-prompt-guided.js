/**
 * Guided Prompt Builder Component
 * Provides a form-based UI for non-technical users to configure prompts
 */

class GuidedPromptBuilder {
  constructor(options = {}) {
    // Dependencies
    this.apiClient = options.apiClient;
    this.onSave = options.onSave || (() => {});

    // State
    this.config = this.getDefaultConfig();
    this.presets = this.getPresetTemplates();

    // Templates
    this.templateEngine = new PromptTemplateEngine();
  }

  /**
   * Render the guided builder interface
   * @param {HTMLElement} container - Container element
   */
  render(container) {
    container.innerHTML = this.getBuilderHTML();
    this.setupEventListeners(container);
    this.loadSavedConfig();
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      preset: 'content-moderation',
      tone: 'professional',
      maxWords: 100,
      responseFormat: {
        includeVerdict: true,
        includeReasoning: true,
        includeReference: true,
        includeSuggestions: true
      },
      contentRules: {
        leadWithVerdict: true,
        alwaysCiteGuidelines: true,
        useConfidentLanguage: true,
        useBulletPoints: true
      },
      customInstructions: ''
    };
  }

  /**
   * Get preset templates
   */
  getPresetTemplates() {
    return {
      'content-moderation': {
        name: 'Content Moderation',
        description: 'For reviewing user-generated content against guidelines',
        icon: 'fact_check',
        verdictOptions: ['Flag', "Don't Flag", 'Needs Review']
      },
      'compliance-check': {
        name: 'Compliance Check',
        description: 'For ensuring content meets regulatory requirements',
        icon: 'verified_user',
        verdictOptions: ['Compliant', 'Non-Compliant', 'Needs Legal Review']
      },
      'brand-safety': {
        name: 'Brand Safety',
        description: 'For protecting brand reputation and values',
        icon: 'shield',
        verdictOptions: ['Brand Safe', 'Brand Risk', 'Escalate']
      },
      'custom': {
        name: 'Custom Template',
        description: 'Build your own prompt from scratch',
        icon: 'edit',
        verdictOptions: ['Custom Option 1', 'Custom Option 2', 'Custom Option 3']
      }
    };
  }

  /**
   * Get builder HTML
   */
  getBuilderHTML() {
    const config = this.config;
    const presets = this.presets;

    return `
      <div class="guided-prompt-builder">
        <div class="builder-header">
          <h2>Guided Prompt Builder</h2>
          <p class="builder-subtitle">Configure your prompt using simple options below. The template will be generated automatically.</p>
        </div>

        <!-- Mode Switcher -->
        <div class="mode-switcher">
          <button class="mode-btn active" data-mode="guided">
            <span class="material-symbols-outlined">tune</span>
            Guided Mode
          </button>
          <button class="mode-btn" data-mode="advanced">
            <span class="material-symbols-outlined">code</span>
            Advanced Mode
          </button>
        </div>

        <!-- Guided Mode Content -->
        <div class="builder-mode guided-mode active">
          <!-- Preset Selection -->
          <div class="builder-section">
            <h3>
              <span class="material-symbols-outlined">category</span>
              Choose a Preset
            </h3>
            <div class="preset-grid">
              ${Object.entries(presets).map(([key, preset]) => `
                <label class="preset-card ${config.preset === key ? 'selected' : ''}" data-preset="${key}">
                  <input type="radio" name="preset" value="${key}" ${config.preset === key ? 'checked' : ''}>
                  <div class="preset-icon">
                    <span class="material-symbols-outlined">${preset.icon}</span>
                  </div>
                  <div class="preset-content">
                    <div class="preset-name">${preset.name}</div>
                    <div class="preset-description">${preset.description}</div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Tone Selection -->
          <div class="builder-section">
            <h3>
              <span class="material-symbols-outlined">sentiment_satisfied</span>
              Response Tone
            </h3>
            <div class="tone-select-group">
              <label class="tone-option ${config.tone === 'professional' ? 'selected' : ''}">
                <input type="radio" name="tone" value="professional" ${config.tone === 'professional' ? 'checked' : ''}>
                <span>Professional</span>
              </label>
              <label class="tone-option ${config.tone === 'friendly' ? 'selected' : ''}">
                <input type="radio" name="tone" value="friendly" ${config.tone === 'friendly' ? 'checked' : ''}>
                <span>Friendly</span>
              </label>
              <label class="tone-option ${config.tone === 'concise' ? 'selected' : ''}">
                <input type="radio" name="tone" value="concise" ${config.tone === 'concise' ? 'checked' : ''}>
                <span>Concise</span>
              </label>
              <label class="tone-option ${config.tone === 'detailed' ? 'selected' : ''}">
                <input type="radio" name="tone" value="detailed" ${config.tone === 'detailed' ? 'checked' : ''}>
                <span>Detailed</span>
              </label>
            </div>
          </div>

          <!-- Response Length -->
          <div class="builder-section">
            <h3>
              <span class="material-symbols-outlined">format_size</span>
              Response Length
            </h3>
            <div class="length-control">
              <label for="max-words">Maximum words:</label>
              <select id="max-words" class="length-select">
                <option value="50" ${config.maxWords === 50 ? 'selected' : ''}>~50 words (Very Short)</option>
                <option value="100" ${config.maxWords === 100 ? 'selected' : ''}>~100 words (Short)</option>
                <option value="200" ${config.maxWords === 200 ? 'selected' : ''}>~200 words (Medium)</option>
                <option value="300" ${config.maxWords === 300 ? 'selected' : ''}>~300 words (Long)</option>
                <option value="0" ${config.maxWords === 0 ? 'selected' : ''}>No limit</option>
              </select>
            </div>
          </div>

          <!-- Response Format -->
          <div class="builder-section">
            <h3>
              <span class="material-symbols-outlined">view_agenda</span>
              Response Format
            </h3>
            <div class="checkbox-group">
              <label class="checkbox-item">
                <input type="checkbox" name="includeVerdict" ${config.responseFormat.includeVerdict ? 'checked' : ''}>
                <span class="checkbox-label">Include Verdict/Decision</span>
                <span class="checkbox-desc">Show clear verdict at the start</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" name="includeReasoning" ${config.responseFormat.includeReasoning ? 'checked' : ''}>
                <span class="checkbox-label">Include Reasoning</span>
                <span class="checkbox-desc">Explain why the decision was made</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" name="includeReference" ${config.responseFormat.includeReference ? 'checked' : ''}>
                <span class="checkbox-label">Include Guideline Reference</span>
                <span class="checkbox-desc">Cite specific guideline sections</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" name="includeSuggestions" ${config.responseFormat.includeSuggestions ? 'checked' : ''}>
                <span class="checkbox-label">Include Related Questions</span>
                <span class="checkbox-desc">Suggest follow-up questions</span>
              </label>
            </div>
          </div>

          <!-- Content Rules -->
          <div class="builder-section">
            <h3>
              <span class="material-symbols-outlined">rule</span>
              Content Rules
            </h3>
            <div class="checkbox-group">
              <label class="checkbox-item">
                <input type="checkbox" name="leadWithVerdict" ${config.contentRules.leadWithVerdict ? 'checked' : ''}>
                <span class="checkbox-label">Lead with Verdict</span>
                <span class="checkbox-desc">Start response with the decision</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" name="alwaysCiteGuidelines" ${config.contentRules.alwaysCiteGuidelines ? 'checked' : ''}>
                <span class="checkbox-label">Always Cite Guidelines</span>
                <span class="checkbox-desc">Require guideline references in reasoning</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" name="useConfidentLanguage" ${config.contentRules.useConfidentLanguage ? 'checked' : ''}>
                <span class="checkbox-label">Use Confident Language</span>
                <span class="checkbox-desc">Avoid hedging language like "maybe" or "possibly"</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" name="useBulletPoints" ${config.contentRules.useBulletPoints ? 'checked' : ''}>
                <span class="checkbox-label">Use Bullet Points</span>
                <span class="checkbox-desc">Format reasoning as bullet points, not paragraphs</span>
              </label>
            </div>
          </div>

          <!-- Custom Instructions -->
          <div class="builder-section">
            <h3>
              <span class="material-symbols-outlined">note_add</span>
              Custom Instructions (Optional)
            </h3>
            <textarea
              id="custom-instructions"
              class="custom-instructions-input"
              placeholder="Add any additional instructions or special requirements..."
              rows="4"
            >${config.customInstructions}</textarea>
          </div>

          <!-- Preview Generated Template -->
          <div class="builder-section">
            <h3>
              <span class="material-symbols-outlined">preview</span>
              Generated Template Preview
            </h3>
            <div class="template-preview">
              <pre id="template-preview-text" class="template-preview-text"></pre>
            </div>
            <button id="refresh-preview-btn" class="btn-secondary">
              <span class="material-symbols-outlined">refresh</span>
              Refresh Preview
            </button>
          </div>

          <!-- Actions -->
          <div class="builder-actions">
            <button id="save-guided-prompt-btn" class="btn-primary">
              <span class="material-symbols-outlined">save</span>
              Save Prompt
            </button>
            <button id="test-guided-prompt-btn" class="btn-secondary">
              <span class="material-symbols-outlined">play_arrow</span>
              Test Prompt
            </button>
          </div>
        </div>

        <!-- Advanced Mode Content (existing prompt editor) -->
        <div class="builder-mode advanced-mode">
          <p class="mode-description">
            <span class="material-symbols-outlined">info</span>
            Advanced mode allows direct editing of the prompt template with {{query}} and {{context}} variables.
          </p>
          <div class="editor-container">
            <label for="advanced-prompt-editor">Prompt Template:</label>
            <textarea
              id="advanced-prompt-editor"
              class="prompt-editor"
              rows="20"
              placeholder="Enter your custom prompt template..."
            ></textarea>
          </div>
          <div class="builder-actions">
            <button id="save-advanced-prompt-btn" class="btn-primary">
              <span class="material-symbols-outlined">save</span>
              Save Prompt
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Set up event listeners
   */
  setupEventListeners(container) {
    // Mode switcher
    container.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchMode(btn.dataset.mode, container));
    });

    // Preset selection
    container.querySelectorAll('input[name="preset"]').forEach(input => {
      input.addEventListener('change', () => this.handlePresetChange(input.value, container));
    });

    // Tone selection
    container.querySelectorAll('input[name="tone"]').forEach(input => {
      input.addEventListener('change', () => this.handleToneChange(input.value, container));
    });

    // Response format checkboxes
    ['includeVerdict', 'includeReasoning', 'includeReference', 'includeSuggestions'].forEach(name => {
      const checkbox = container.querySelector(`input[name="${name}"]`);
      if (checkbox) {
        checkbox.addEventListener('change', () => this.updateConfig(container));
      }
    });

    // Content rules checkboxes
    ['leadWithVerdict', 'alwaysCiteGuidelines', 'useConfidentLanguage', 'useBulletPoints'].forEach(name => {
      const checkbox = container.querySelector(`input[name="${name}"]`);
      if (checkbox) {
        checkbox.addEventListener('change', () => this.updateConfig(container));
      }
    });

    // Max words
    const maxWordsSelect = container.querySelector('#max-words');
    if (maxWordsSelect) {
      maxWordsSelect.addEventListener('change', () => this.updateConfig(container));
    }

    // Custom instructions
    const customInstructions = container.querySelector('#custom-instructions');
    if (customInstructions) {
      customInstructions.addEventListener('input', () => {
        this.config.customInstructions = customInstructions.value;
        this.updatePreview(container);
      });
    }

    // Refresh preview
    const refreshPreviewBtn = container.querySelector('#refresh-preview-btn');
    if (refreshPreviewBtn) {
      refreshPreviewBtn.addEventListener('click', () => this.updatePreview(container));
    }

    // Save buttons
    const saveGuidedBtn = container.querySelector('#save-guided-prompt-btn');
    if (saveGuidedBtn) {
      saveGuidedBtn.addEventListener('click', () => this.saveGuidedPrompt(container));
    }

    const saveAdvancedBtn = container.querySelector('#save-advanced-prompt-btn');
    if (saveAdvancedBtn) {
      saveAdvancedBtn.addEventListener('click', () => this.saveAdvancedPrompt(container));
    }

    // Test buttons
    const testGuidedBtn = container.querySelector('#test-guided-prompt-btn');
    if (testGuidedBtn) {
      testGuidedBtn.addEventListener('click', () => this.testPrompt(container));
    }

    // Initial preview
    this.updatePreview(container);
  }

  /**
   * Switch between guided and advanced modes
   */
  switchMode(mode, container) {
    // Update mode buttons
    container.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Update mode content
    container.querySelectorAll('.builder-mode').forEach(modeDiv => {
      const isActive = modeDiv.classList.contains(`${mode}-mode`);
      modeDiv.classList.toggle('active', isActive);
    });

    // If switching to advanced, populate with generated template
    if (mode === 'advanced') {
      const template = this.templateEngine.generate(this.config);
      const editor = container.querySelector('#advanced-prompt-editor');
      if (editor && !editor.value) {
        editor.value = template;
      }
    }
  }

  /**
   * Handle preset change
   */
  handlePresetChange(preset, container) {
    this.config.preset = preset;

    // Update selected state
    container.querySelectorAll('.preset-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.preset === preset);
    });

    this.updatePreview(container);
  }

  /**
   * Handle tone change
   */
  handleToneChange(tone, container) {
    this.config.tone = tone;

    // Update selected state
    container.querySelectorAll('.tone-option').forEach(option => {
      const input = option.querySelector('input');
      option.classList.toggle('selected', input.value === tone);
    });

    this.updatePreview(container);
  }

  /**
   * Update configuration from form inputs
   */
  updateConfig(container) {
    // Update response format
    this.config.responseFormat = {
      includeVerdict: container.querySelector('input[name="includeVerdict"]').checked,
      includeReasoning: container.querySelector('input[name="includeReasoning"]').checked,
      includeReference: container.querySelector('input[name="includeReference"]').checked,
      includeSuggestions: container.querySelector('input[name="includeSuggestions"]').checked
    };

    // Update content rules
    this.config.contentRules = {
      leadWithVerdict: container.querySelector('input[name="leadWithVerdict"]').checked,
      alwaysCiteGuidelines: container.querySelector('input[name="alwaysCiteGuidelines"]').checked,
      useConfidentLanguage: container.querySelector('input[name="useConfidentLanguage"]').checked,
      useBulletPoints: container.querySelector('input[name="useBulletPoints"]').checked
    };

    // Update max words
    this.config.maxWords = parseInt(container.querySelector('#max-words').value);

    this.updatePreview(container);
  }

  /**
   * Update template preview
   */
  updatePreview(container) {
    const template = this.templateEngine.generate(this.config);
    const previewText = container.querySelector('#template-preview-text');
    if (previewText) {
      previewText.textContent = template;
    }
  }

  /**
   * Save guided prompt
   */
  async saveGuidedPrompt(container) {
    const template = this.templateEngine.generate(this.config);
    await this.savePrompt(template, this.config);
  }

  /**
   * Save advanced prompt
   */
  async saveAdvancedPrompt(container) {
    const editor = container.querySelector('#advanced-prompt-editor');
    const template = editor.value;
    await this.savePrompt(template, null);
  }

  /**
   * Save prompt to backend
   */
  async savePrompt(template, config) {
    try {
      const response = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: template,
          config: config
        })
      });

      if (response.ok) {
        this.showSnackbar('Prompt saved successfully', 'success');
        this.onSave(template, config);
      } else {
        throw new Error('Failed to save prompt');
      }
    } catch (error) {
      console.error('Error saving prompt:', error);
      this.showSnackbar('Error saving prompt', 'error');
    }
  }

  /**
   * Test prompt with sample query
   */
  async testPrompt(container) {
    // Placeholder for testing functionality
    this.showSnackbar('Test functionality coming soon', 'info');
  }

  /**
   * Load saved configuration
   */
  async loadSavedConfig() {
    try {
      const response = await fetch('/api/admin/prompts/config');
      if (response.ok) {
        const savedConfig = await response.json();
        this.config = { ...this.config, ...savedConfig };
      }
    } catch (error) {
      console.error('Error loading saved config:', error);
    }
  }

  /**
   * Show snackbar notification
   */
  showSnackbar(message, type) {
    window.dispatchEvent(new CustomEvent('show-snackbar', {
      detail: { message, type }
    }));
  }
}

/**
 * Prompt Template Engine
 * Generates prompts from configuration
 */
class PromptTemplateEngine {
  generate(config) {
    let template = '';

    // System instruction
    template += this.getSystemInstruction(config);
    template += '\n\n';

    // Context section
    template += 'CONTEXT:\n{{context}}\n\n';

    // Question section
    template += 'QUESTION: {{query}}\n\n';

    // Response format
    template += this.getResponseFormat(config);
    template += '\n\n';

    // Rules
    template += this.getRules(config);

    // Custom instructions
    if (config.customInstructions) {
      template += '\n\nADDITIONAL INSTRUCTIONS:\n';
      template += config.customInstructions;
    }

    return template;
  }

  getSystemInstruction(config) {
    const presetMap = {
      'content-moderation': 'You are the Guideline Assistant for media auditors. Your job is to give QUICK, CLEAR answers about content moderation.',
      'compliance-check': 'You are the Compliance Assistant. Analyze content against regulatory requirements and provide clear compliance assessments.',
      'brand-safety': 'You are the Brand Safety Assistant. Evaluate content for brand risks and provide actionable recommendations.',
      'custom': 'You are an AI assistant analyzing content against guidelines.'
    };

    const toneMap = {
      'professional': 'Maintain a professional, authoritative tone.',
      'friendly': 'Be friendly and approachable while staying accurate.',
      'concise': 'Be extremely concise and to-the-point.',
      'detailed': 'Provide thorough, detailed explanations.'
    };

    return `${presetMap[config.preset]} ${toneMap[config.tone]}`;
  }

  getResponseFormat(config) {
    let format = 'RESPOND IN THIS FORMAT:\n\n';

    if (config.responseFormat.includeVerdict) {
      const preset = config.preset;
      let verdictLabel = '**Verdict**';
      if (preset === 'compliance-check') verdictLabel = '**Assessment**';
      if (preset === 'brand-safety') verdictLabel = '**Brand Safety Status**';

      format += `${verdictLabel}: [Your decision]\n\n`;
    }

    if (config.responseFormat.includeReasoning) {
      format += '**Why**:\n';
      format += config.contentRules.useBulletPoints
        ? '- [Reason 1]\n- [Reason 2]\n\n'
        : '[Explanation]\n\n';
    }

    if (config.responseFormat.includeReference) {
      format += '**Guideline Reference**: [Which guideline section]\n\n';
    }

    if (config.responseFormat.includeSuggestions) {
      format += '**Related Questions**:\n- [Question 1]\n- [Question 2]\n- [Question 3]\n';
    }

    return format;
  }

  getRules(config) {
    let rules = 'RULES:\n';

    if (config.contentRules.leadWithVerdict) {
      rules += '- Lead with the verdict — auditors need fast answers\n';
    }

    if (config.contentRules.alwaysCiteGuidelines) {
      rules += '- ALWAYS connect your reasoning to the specific guideline text\n';
      rules += '- Make the logical connection explicit: "The guideline prohibits X, and this content shows Y, therefore..."\n';
    }

    if (config.contentRules.useConfidentLanguage) {
      rules += '- Be CONFIDENT. If guidelines cover a category, apply it clearly\n';
      rules += '- Avoid hedging language unless truly uncertain\n';
    }

    if (config.contentRules.useBulletPoints) {
      rules += '- Use bullet points, not paragraphs\n';
    }

    if (config.maxWords > 0) {
      rules += `- Keep it under ${config.maxWords} words unless complexity requires more\n`;
    }

    return rules;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GuidedPromptBuilder;
}
