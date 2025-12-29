/**
 * Admin Prompt Configuration Module
 * Handles prompt customization in the admin portal
 */

class AdminPromptManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.currentTemplate = '';
    this.hasUnsavedChanges = false;
    this.init();
  }

  init() {
    this.setupElements();
    this.attachEventListeners();
    this.loadPromptConfig();
    this.setupUnsavedChangesWarning();
  }

  setupElements() {
    // Main elements
    this.promptEditor = document.getElementById('prompt-editor');
    this.saveBtn = document.getElementById('save-prompt-btn');
    this.resetBtn = document.getElementById('reset-prompt-btn');
    this.previewBtn = document.getElementById('preview-prompt-btn');
    this.historyBtn = document.getElementById('history-prompt-btn');
    
    // Preview elements
    this.sampleQueryInput = document.getElementById('sample-query-input');
    this.previewOutput = document.getElementById('preview-output');
    this.previewContainer = document.getElementById('preview-container');
    this.renderedPromptContainer = document.getElementById('rendered-prompt-container');
    this.renderedPromptText = document.getElementById('rendered-prompt-text');
    
    // Status elements
    this.statusMessage = document.getElementById('prompt-status-message');
    this.unsavedIndicator = document.getElementById('unsaved-indicator');
    
    // Info elements
    this.versionInfo = document.getElementById('version-info');
    this.lastUpdatedInfo = document.getElementById('last-updated-info');
  }

  attachEventListeners() {
    // Editor change tracking
    if (this.promptEditor) {
      this.promptEditor.addEventListener('input', () => {
        this.markAsUnsaved();
      });
    }

    // Save button
    if (this.saveBtn) {
      this.saveBtn.addEventListener('click', () => this.savePrompt());
    }

    // Reset button
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => this.resetPrompt());
    }

    // Preview button
    if (this.previewBtn) {
      this.previewBtn.addEventListener('click', () => this.previewPrompt());
    }

    // History button
    if (this.historyBtn) {
      this.historyBtn.addEventListener('click', () => this.showHistory());
    }
  }

  setupUnsavedChangesWarning() {
    window.addEventListener('beforeunload', (e) => {
      if (this.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    });
  }

  markAsUnsaved() {
    this.hasUnsavedChanges = true;
    if (this.unsavedIndicator) {
      this.unsavedIndicator.classList.remove('hidden');
    }
    if (this.saveBtn) {
      this.saveBtn.classList.add('highlight');
    }
  }

  markAsSaved() {
    this.hasUnsavedChanges = false;
    if (this.unsavedIndicator) {
      this.unsavedIndicator.classList.add('hidden');
    }
    if (this.saveBtn) {
      this.saveBtn.classList.remove('highlight');
    }
  }

  async loadPromptConfig() {
    try {
      this.showStatus('Loading prompt configuration...', 'info');
      
      const config = await this.apiClient.getPromptConfig();
      
      if (config.active_prompt) {
        this.currentTemplate = config.active_prompt.template;
        if (this.promptEditor) {
          this.promptEditor.value = this.currentTemplate;
        }
        
        // Update version info
        if (this.versionInfo) {
          this.versionInfo.textContent = `Version ${config.active_prompt.version}`;
        }
        if (this.lastUpdatedInfo) {
          const date = new Date(config.active_prompt.updated_at);
          this.lastUpdatedInfo.textContent = `Last updated: ${date.toLocaleString()}`;
        }
      }
      
      this.markAsSaved();
      this.showStatus('Prompt loaded successfully', 'success');
      setTimeout(() => this.hideStatus(), 2000);
      
    } catch (error) {
      console.error('Failed to load prompt config:', error);
      this.showStatus(`Error: ${error.message}`, 'error');
    }
  }

  async savePrompt() {
    if (!this.promptEditor) return;
    
    const template = this.promptEditor.value;
    
    // Client-side validation
    if (!template.trim()) {
      this.showStatus('Prompt cannot be empty', 'error');
      return;
    }
    
    if (!template.includes('{{query}}')) {
      this.showStatus('Prompt must include {{query}} variable', 'error');
      return;
    }
    
    if (!template.includes('{{context}}')) {
      this.showStatus('Prompt must include {{context}} variable', 'error');
      return;
    }
    
    try {
      this.showStatus('Saving prompt...', 'info');
      this.saveBtn.disabled = true;
      
      const result = await this.apiClient.updatePromptConfig(template);
      
      this.currentTemplate = template;
      this.markAsSaved();
      this.showStatus('Prompt saved successfully!', 'success');
      
      // Update version info
      if (result.active_prompt) {
        if (this.versionInfo) {
          this.versionInfo.textContent = `Version ${result.active_prompt.version}`;
        }
        if (this.lastUpdatedInfo) {
          const date = new Date(result.active_prompt.updated_at);
          this.lastUpdatedInfo.textContent = `Last updated: ${date.toLocaleString()}`;
        }
      }
      
      setTimeout(() => this.hideStatus(), 3000);
      
    } catch (error) {
      console.error('Failed to save prompt:', error);
      this.showStatus(`Error: ${error.message}`, 'error');
    } finally {
      this.saveBtn.disabled = false;
    }
  }

  async resetPrompt() {
    if (!confirm('Are you sure you want to reset to the default prompt? This will save your current prompt to history.')) {
      return;
    }
    
    try {
      this.showStatus('Resetting to default...', 'info');
      this.resetBtn.disabled = true;
      
      const result = await this.apiClient.resetPrompt();
      
      if (result.active_prompt && this.promptEditor) {
        this.promptEditor.value = result.active_prompt.template;
        this.currentTemplate = result.active_prompt.template;
      }
      
      this.markAsSaved();
      this.showStatus('Prompt reset to default', 'success');
      
      // Update version info
      if (result.active_prompt) {
        if (this.versionInfo) {
          this.versionInfo.textContent = `Version ${result.active_prompt.version}`;
        }
        if (this.lastUpdatedInfo) {
          const date = new Date(result.active_prompt.updated_at);
          this.lastUpdatedInfo.textContent = `Last updated: ${date.toLocaleString()}`;
        }
      }
      
      setTimeout(() => this.hideStatus(), 3000);
      
    } catch (error) {
      console.error('Failed to reset prompt:', error);
      this.showStatus(`Error: ${error.message}`, 'error');
    } finally {
      this.resetBtn.disabled = false;
    }
  }

  async previewPrompt() {
    if (!this.promptEditor || !this.sampleQueryInput) return;
    
    const template = this.promptEditor.value;
    const sampleQuery = this.sampleQueryInput.value.trim() || 'Should I flag a wine bottle in the background?';
    
    try {
      this.showStatus('Generating preview...', 'info');
      this.previewBtn.disabled = true;
      
      if (this.previewContainer) {
        this.previewContainer.classList.remove('hidden');
      }
      
      const result = await this.apiClient.previewPrompt(template, sampleQuery);
      
      // Show rendered prompt
      if (this.renderedPromptText && result.rendered_prompt) {
        this.renderedPromptText.textContent = result.rendered_prompt;
        if (this.renderedPromptContainer) {
          this.renderedPromptContainer.classList.remove('hidden');
        }
      }
      
      // Show generated response
      if (this.previewOutput && result.generated_response) {
        this.previewOutput.innerHTML = this.formatMarkdown(result.generated_response);
      }
      
      this.showStatus('Preview generated successfully', 'success');
      setTimeout(() => this.hideStatus(), 2000);
      
    } catch (error) {
      console.error('Failed to preview prompt:', error);
      this.showStatus(`Preview error: ${error.message}`, 'error');
      if (this.previewOutput) {
        // Use textContent to prevent XSS from error messages
        const errorP = document.createElement('p');
        errorP.className = 'error';
        errorP.textContent = `Error: ${error.message}`;
        this.previewOutput.innerHTML = '';
        this.previewOutput.appendChild(errorP);
      }
    } finally {
      this.previewBtn.disabled = false;
    }
  }

  async showHistory() {
    try {
      const result = await this.apiClient.getPromptHistory();
      
      if (!result.history || result.history.length === 0) {
        alert('No version history available');
        return;
      }
      
      // Create modal
      const modal = this.createHistoryModal(result.history);
      document.body.appendChild(modal);
      
    } catch (error) {
      console.error('Failed to load history:', error);
      this.showStatus(`Error: ${error.message}`, 'error');
    }
  }

  createHistoryModal(history) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Prompt Version History</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <div class="history-list">
            ${history.map(h => `
              <div class="history-item">
                <div class="history-item-header">
                  <strong>Version ${h.version}</strong>
                  <span class="history-date">${new Date(h.updated_at).toLocaleString()}</span>
                </div>
                <div class="history-item-body">
                  <p class="history-preview">${h.template_preview}</p>
                  <button class="restore-btn" data-version="${h.version}">Restore this version</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    // Attach restore button listeners
    modal.querySelectorAll('.restore-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const version = parseInt(e.target.dataset.version);
        await this.rollbackToVersion(version);
        modal.remove();
      });
    });
    
    return modal;
  }

  async rollbackToVersion(version) {
    if (!confirm(`Are you sure you want to rollback to version ${version}?`)) {
      return;
    }
    
    try {
      this.showStatus(`Rolling back to version ${version}...`, 'info');
      
      const result = await this.apiClient.rollbackPrompt(version);
      
      if (result.active_prompt && this.promptEditor) {
        this.promptEditor.value = result.active_prompt.template;
        this.currentTemplate = result.active_prompt.template;
      }
      
      this.markAsSaved();
      this.showStatus(`Rolled back to version ${version}`, 'success');
      
      // Update version info
      if (result.active_prompt) {
        if (this.versionInfo) {
          this.versionInfo.textContent = `Version ${result.active_prompt.version}`;
        }
        if (this.lastUpdatedInfo) {
          const date = new Date(result.active_prompt.updated_at);
          this.lastUpdatedInfo.textContent = `Last updated: ${date.toLocaleString()}`;
        }
      }
      
      setTimeout(() => this.hideStatus(), 3000);
      
    } catch (error) {
      console.error('Failed to rollback:', error);
      this.showStatus(`Error: ${error.message}`, 'error');
    }
  }

  formatMarkdown(text) {
    // Simple markdown formatting (reuse from response-renderer if available)
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  showStatus(message, type = 'info') {
    if (!this.statusMessage) return;
    
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message ${type}`;
    this.statusMessage.classList.remove('hidden');
  }

  hideStatus() {
    if (!this.statusMessage) return;
    this.statusMessage.classList.add('hidden');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('prompt-editor')) {
      const apiClient = new APIClient();
      window.adminPromptManager = new AdminPromptManager(apiClient);
    }
  });
} else {
  if (document.getElementById('prompt-editor')) {
    const apiClient = new APIClient();
    window.adminPromptManager = new AdminPromptManager(apiClient);
  }
}
