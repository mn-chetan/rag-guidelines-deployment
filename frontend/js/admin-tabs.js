/**
 * Admin Tabs Component
 * Manages tabbed navigation in the admin portal
 */

class AdminTabs {
  constructor(options = {}) {
    // DOM elements
    this.tabsContainer = options.tabsContainer || document.getElementById('admin-tabs');
    this.contentContainer = options.contentContainer || document.getElementById('admin-content');

    // Callbacks
    this.onTabChange = options.onTabChange || (() => {});

    // State
    this.tabs = [];
    this.activeTabId = null;

    // Initialize
    this.initialize();
  }

  /**
   * Initialize the tabs component
   */
  initialize() {
    if (!this.tabsContainer || !this.contentContainer) {
      console.error('Admin tabs elements not found');
      return;
    }

    // Set up event delegation for tab clicks
    this.tabsContainer.addEventListener('click', (e) => {
      const tabButton = e.target.closest('.admin-tab-button');
      if (tabButton) {
        const tabId = tabButton.dataset.tabId;
        this.switchTab(tabId);
      }
    });
  }

  /**
   * Register tabs with their content loaders
   * @param {Array} tabConfigs - Array of {id, label, icon, loadContent}
   */
  registerTabs(tabConfigs) {
    this.tabs = tabConfigs;
    this.renderTabs();

    // Activate first tab by default
    if (this.tabs.length > 0) {
      this.switchTab(this.tabs[0].id);
    }
  }

  /**
   * Render tab buttons
   */
  renderTabs() {
    const tabsHTML = this.tabs.map(tab => `
      <button
        class="admin-tab-button"
        data-tab-id="${tab.id}"
        role="tab"
        aria-selected="false"
        aria-controls="${tab.id}-panel">
        <span class="material-symbols-outlined">${tab.icon}</span>
        <span class="tab-label">${tab.label}</span>
      </button>
    `).join('');

    this.tabsContainer.innerHTML = tabsHTML;
  }

  /**
   * Switch to a different tab
   * @param {string} tabId - The ID of the tab to switch to
   */
  async switchTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) {
      console.error(`Tab not found: ${tabId}`);
      return;
    }

    // Update state
    const previousTabId = this.activeTabId;
    this.activeTabId = tabId;

    // Update UI - tab buttons
    this.updateTabButtons(tabId);

    // Show loading state
    this.showLoadingState();

    // Load content (async)
    try {
      await tab.loadContent(this.contentContainer);

      // Notify listeners
      this.onTabChange(tabId, previousTabId);
    } catch (error) {
      console.error(`Error loading tab ${tabId}:`, error);
      this.showErrorState(error.message);
    }
  }

  /**
   * Update tab button states
   * @param {string} activeTabId - The ID of the active tab
   */
  updateTabButtons(activeTabId) {
    const tabButtons = this.tabsContainer.querySelectorAll('.admin-tab-button');
    tabButtons.forEach(button => {
      const tabId = button.dataset.tabId;
      const isActive = tabId === activeTabId;

      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive);
    });
  }

  /**
   * Show loading state in content area
   */
  showLoadingState() {
    this.contentContainer.innerHTML = `
      <div class="admin-loading-state">
        <div class="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    `;
  }

  /**
   * Show error state in content area
   * @param {string} message - Error message to display
   */
  showErrorState(message) {
    this.contentContainer.innerHTML = `
      <div class="admin-error-state">
        <span class="material-symbols-outlined">error</span>
        <h3>Error Loading Content</h3>
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Get the currently active tab ID
   * @returns {string|null} The active tab ID
   */
  getActiveTab() {
    return this.activeTabId;
  }

  /**
   * Programmatically activate a tab
   * @param {string} tabId - The ID of the tab to activate
   */
  activateTab(tabId) {
    this.switchTab(tabId);
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    this.tabs = [];
    this.activeTabId = null;
    if (this.tabsContainer) {
      this.tabsContainer.innerHTML = '';
    }
    if (this.contentContainer) {
      this.contentContainer.innerHTML = '';
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdminTabs;
}
