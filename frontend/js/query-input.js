/**
 * Query Input Component
 * Handles user input, keyboard shortcuts, and suggestion integration
 */

class QueryInput {
  constructor(options = {}) {
    // DOM elements
    this.inputElement = options.inputElement || document.getElementById('query-input');
    this.formElement = options.formElement || document.getElementById('query-form');
    this.submitButton = options.submitButton || document.getElementById('submit-btn');
    this.loadingIndicator = options.loadingIndicator || document.getElementById('loading-indicator');
    this.imageUploadInput = document.getElementById('image-upload-input');
    this.imagePreviewContainer = document.getElementById('image-preview-container');
    this.uploadButton = document.getElementById('upload-image-btn');

    // Dependencies
    this.onSubmit = options.onSubmit || (() => {});

    // State
    this.isLoading = false;
    this.uploadedImages = [];  // Array of {file: File, preview: string, id: string}

    // Initialize
    this.initialize();
  }

  /**
   * Initialize the query input component
   */
  initialize() {
    if (!this.inputElement || !this.formElement) {
      console.error('Query input elements not found');
      return;
    }

    // Set up event listeners
    this.setupEventListeners();
    
    // Auto-resize textarea
    this.setupAutoResize();
  }

  /**
   * Set up all event listeners
   */
  setupEventListeners() {
    // Form submission
    this.formElement.addEventListener('submit', (e) => this.handleSubmit(e));

    // Keyboard navigation
    this.inputElement.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Image upload click
    if (this.uploadButton) {
      this.uploadButton.addEventListener('click', () => this.imageUploadInput.click());
    }

    // Image file selection
    if (this.imageUploadInput) {
      this.imageUploadInput.addEventListener('change', (e) => this.handleImageSelection(e));
    }

    // Drag and drop
    this.inputElement.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.inputElement.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    this.inputElement.addEventListener('drop', (e) => this.handleDrop(e));
  }

  /**
   * Set up auto-resize for textarea
   */
  setupAutoResize() {
    this.inputElement.addEventListener('input', () => {
      // Reset height to auto to get the correct scrollHeight
      this.inputElement.style.height = 'auto';
      
      // Set height to scrollHeight (content height)
      const maxHeight = 200; // Match CSS max-height
      const newHeight = Math.min(this.inputElement.scrollHeight, maxHeight);
      this.inputElement.style.height = newHeight + 'px';
    });
  }

  /**
   * Handle form submission
   */
  async handleSubmit(event) {
    event.preventDefault();

    const query = this.getValue().trim();

    // Allow submission with just images (no text required)
    if (!query && this.uploadedImages.length === 0) {
      return;
    }

    if (this.isLoading) {
      return;
    }

    // Get images as base64
    const images = await this.getImagesAsBase64();

    // Call the submit callback with both query and images
    this.onSubmit(query, images);

    // Clear input and images after submission
    this.clear();
    this.clearImages();
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(event) {
    const key = event.key;
    
    // Enter key - submit query (without Shift)
    if (key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.handleSubmit(event);
      return;
    }
    
    // Escape key - clear input
    if (key === 'Escape') {
      event.preventDefault();
      this.clear();
      return;
    }
  }

  /**
   * Set loading state
   */
  setLoading(loading) {
    this.isLoading = loading;

    if (loading) {
      // Disable input and button
      this.inputElement.disabled = true;
      this.submitButton.disabled = true;
      if (this.uploadButton) this.uploadButton.disabled = true;

      // Show loading indicator
      if (this.loadingIndicator) {
        this.loadingIndicator.classList.remove('hidden');
      }
    } else {
      // Enable input and button
      this.inputElement.disabled = false;
      this.submitButton.disabled = false;
      if (this.uploadButton) this.uploadButton.disabled = false;

      // Hide loading indicator
      if (this.loadingIndicator) {
        this.loadingIndicator.classList.add('hidden');
      }

      // Focus input
      this.focus();
    }
  }

  /**
   * Get current input value
   */
  getValue() {
    return this.inputElement.value;
  }

  /**
   * Set input value
   */
  setValue(value) {
    this.inputElement.value = value;
    
    // Trigger input event for auto-resize
    this.inputElement.dispatchEvent(new Event('input'));
  }

  /**
   * Clear input
   */
  clear() {
    this.setValue('');
  }

  /**
   * Focus input
   */
  focus() {
    this.inputElement.focus();
  }

  /**
   * Move cursor to end of input
   */
  moveCursorToEnd() {
    const length = this.inputElement.value.length;
    this.inputElement.setSelectionRange(length, length);
  }

  /**
   * Handle image file selection from file input
   */
  async handleImageSelection(event) {
    const files = Array.from(event.target.files);
    await this.addImages(files);
    // Reset input so same file can be selected again
    event.target.value = '';
  }

  /**
   * Handle drag over event
   */
  handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    this.inputElement.classList.add('drag-over');
  }

  /**
   * Handle drag leave event
   */
  handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    this.inputElement.classList.remove('drag-over');
  }

  /**
   * Handle drop event
   */
  async handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    this.inputElement.classList.remove('drag-over');

    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      await this.addImages(files);
    }
  }

  /**
   * Add images to upload queue with validation
   */
  async addImages(files) {
    const MAX_IMAGES = 5;
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB per image
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    for (const file of files) {
      // Check total count
      if (this.uploadedImages.length >= MAX_IMAGES) {
        this.showError(`Maximum ${MAX_IMAGES} images allowed`);
        break;
      }

      // Validate type
      if (!ALLOWED_TYPES.includes(file.type)) {
        this.showError(`Unsupported image type: ${file.type}`);
        continue;
      }

      // Validate size
      if (file.size > MAX_SIZE) {
        this.showError(`Image too large: ${file.name} (max 10MB)`);
        continue;
      }

      // Create preview
      const preview = await this.createImagePreview(file);
      const imageId = this.generateImageId();

      this.uploadedImages.push({
        id: imageId,
        file: file,
        preview: preview
      });

      this.renderImagePreview(imageId, preview, file.name);
    }

    this.updateUploadButton();
  }

  /**
   * Create base64 preview for image
   */
  createImagePreview(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Generate unique ID for image
   */
  generateImageId() {
    return `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Render image preview in container
   */
  renderImagePreview(imageId, previewUrl, filename) {
    const previewEl = document.createElement('div');
    previewEl.className = 'image-preview-item';
    previewEl.dataset.imageId = imageId;
    previewEl.innerHTML = `
        <img src="${previewUrl}" alt="${filename}">
        <button class="remove-image-btn" data-image-id="${imageId}" aria-label="Remove ${filename}">
            <span class="material-symbols-outlined">close</span>
        </button>
        <span class="image-filename">${filename}</span>
    `;

    // Add remove handler
    previewEl.querySelector('.remove-image-btn').addEventListener('click', () => {
      this.removeImage(imageId);
    });

    this.imagePreviewContainer.appendChild(previewEl);
    this.imagePreviewContainer.classList.remove('hidden');
  }

  /**
   * Remove image from upload queue
   */
  removeImage(imageId) {
    this.uploadedImages = this.uploadedImages.filter(img => img.id !== imageId);
    const previewEl = this.imagePreviewContainer.querySelector(`[data-image-id="${imageId}"]`);
    if (previewEl) {
      previewEl.remove();
    }

    if (this.uploadedImages.length === 0) {
      this.imagePreviewContainer.classList.add('hidden');
    }

    this.updateUploadButton();
  }

  /**
   * Update upload button state
   */
  updateUploadButton() {
    if (this.uploadButton) {
      const count = this.uploadedImages.length;
      if (count > 0) {
        this.uploadButton.textContent = `${count} image(s)`;
        this.uploadButton.classList.add('has-images');
      } else {
        this.uploadButton.innerHTML = '<span class="material-symbols-outlined">add_photo_alternate</span>';
        this.uploadButton.classList.remove('has-images');
      }
    }
  }

  /**
   * Get uploaded images as base64
   */
  async getImagesAsBase64() {
    const images = [];
    for (const img of this.uploadedImages) {
      const base64 = await this.fileToBase64(img.file);
      images.push({
        data: base64.split(',')[1], // Remove data:image/...;base64, prefix
        mime_type: img.file.type,
        filename: img.file.name
      });
    }
    return images;
  }

  /**
   * Convert file to base64
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Clear uploaded images
   */
  clearImages() {
    this.uploadedImages = [];
    this.imagePreviewContainer.innerHTML = '';
    this.imagePreviewContainer.classList.add('hidden');
    this.updateUploadButton();
  }

  /**
   * Show error message
   */
  showError(message) {
    // Dispatch custom event for global error handler
    window.dispatchEvent(new CustomEvent('query-input-error', { detail: { message } }));
    // Also show in console for debugging
    console.warn('Image upload error:', message);
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    // Remove event listeners would go here if we stored references
    // For now, the component will be garbage collected when the page unloads
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueryInput;
}
