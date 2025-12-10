/**
 * Confirmation Dialog Component
 * Reusable modal for confirming destructive actions
 */

class ConfirmationDialog {
  constructor() {
    this.dialog = null;
    this.isOpen = false;
    this.resolveCallback = null;
    this.rejectCallback = null;
    
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleBackdropClick = this.handleBackdropClick.bind(this);
    
    this.createDialog();
  }

  /**
   * Create the dialog DOM structure
   */
  createDialog() {
    // Create dialog container
    this.dialog = document.createElement('div');
    this.dialog.className = 'confirmation-dialog-overlay';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.style.display = 'none';
    
    this.dialog.innerHTML = `
      <div class="confirmation-dialog-backdrop"></div>
      <div class="confirmation-dialog">
        <div class="confirmation-dialog-header">
          <h3 class="confirmation-dialog-title"></h3>
        </div>
        <div class="confirmation-dialog-body">
          <p class="confirmation-dialog-message"></p>
        </div>
        <div class="confirmation-dialog-footer">
          <button class="confirmation-btn confirmation-btn-cancel" data-action="cancel">
            Cancel
          </button>
          <button class="confirmation-btn confirmation-btn-confirm" data-action="confirm">
            Confirm
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.dialog);
    
    // Bind events
    this.dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => this.cancel());
    this.dialog.querySelector('[data-action="confirm"]').addEventListener('click', () => this.confirm());
    this.dialog.querySelector('.confirmation-dialog-backdrop').addEventListener('click', this.handleBackdropClick);
  }

  /**
   * Show confirmation dialog
   * @param {Object} options - Dialog options
   * @param {string} options.title - Dialog title
   * @param {string} options.message - Dialog message
   * @param {string} options.confirmText - Confirm button text (default: "Confirm")
   * @param {string} options.cancelText - Cancel button text (default: "Cancel")
   * @param {string} options.variant - Dialog variant: "danger", "warning", "info" (default: "danger")
   * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
   */
  show(options = {}) {
    return new Promise((resolve, reject) => {
      this.resolveCallback = resolve;
      this.rejectCallback = reject;
      
      const {
        title = 'Confirm Action',
        message = 'Are you sure?',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        variant = 'danger'
      } = options;
      
      // Update content
      this.dialog.querySelector('.confirmation-dialog-title').textContent = title;
      this.dialog.querySelector('.confirmation-dialog-message').textContent = message;
      this.dialog.querySelector('[data-action="confirm"]').textContent = confirmText;
      this.dialog.querySelector('[data-action="cancel"]').textContent = cancelText;
      
      // Update variant
      const dialogElement = this.dialog.querySelector('.confirmation-dialog');
      dialogElement.className = 'confirmation-dialog';
      dialogElement.classList.add(`confirmation-dialog-${variant}`);
      
      const confirmBtn = this.dialog.querySelector('[data-action="confirm"]');
      confirmBtn.className = 'confirmation-btn confirmation-btn-confirm';
      confirmBtn.classList.add(`confirmation-btn-${variant}`);
      
      // Show dialog
      this.dialog.style.display = 'flex';
      this.isOpen = true;
      
      // Add animation class
      requestAnimationFrame(() => {
        this.dialog.classList.add('confirmation-dialog-open');
      });
      
      // Focus confirm button
      setTimeout(() => {
        confirmBtn.focus();
      }, 100);
      
      // Add keyboard listener
      document.addEventListener('keydown', this.handleKeyDown);
      
      // Trap focus
      this.trapFocus();
    });
  }

  /**
   * Hide the dialog
   */
  hide() {
    this.dialog.classList.remove('confirmation-dialog-open');
    
    setTimeout(() => {
      this.dialog.style.display = 'none';
      this.isOpen = false;
    }, 200); // Match CSS transition duration
    
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Confirm action
   */
  confirm() {
    if (this.resolveCallback) {
      this.resolveCallback(true);
    }
    this.hide();
  }

  /**
   * Cancel action
   */
  cancel() {
    if (this.resolveCallback) {
      this.resolveCallback(false);
    }
    this.hide();
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(e) {
    if (!this.isOpen) return;
    
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.confirm();
    }
  }

  /**
   * Handle backdrop click
   */
  handleBackdropClick(e) {
    if (e.target.classList.contains('confirmation-dialog-backdrop')) {
      this.cancel();
    }
  }

  /**
   * Trap focus within dialog
   */
  trapFocus() {
    const focusableElements = this.dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    
    this.dialog.addEventListener('keydown', handleTabKey);
  }

  /**
   * Destroy the dialog
   */
  destroy() {
    if (this.dialog && this.dialog.parentNode) {
      this.dialog.parentNode.removeChild(this.dialog);
    }
    document.removeEventListener('keydown', this.handleKeyDown);
  }
}

// Create global instance
const confirmationDialog = new ConfirmationDialog();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConfirmationDialog;
}
