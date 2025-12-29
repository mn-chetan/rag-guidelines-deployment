/**
 * Admin Dashboard Component
 * Displays system statistics and health metrics
 */

class AdminDashboard {
  constructor(options = {}) {
    // Dependencies
    this.apiClient = options.apiClient;

    // State
    this.stats = null;
    this.refreshInterval = null;
    this.autoRefresh = true;
    this.refreshRate = 30000; // 30 seconds
  }

  /**
   * Render the dashboard into a container
   * @param {HTMLElement} container - Container element
   */
  async render(container) {
    // Show loading state
    container.innerHTML = this.getLoadingHTML();

    // Load stats
    await this.loadStats();

    // Render full dashboard
    container.innerHTML = this.getDashboardHTML();

    // Set up auto-refresh
    if (this.autoRefresh) {
      this.startAutoRefresh();
    }

    // Set up event listeners
    this.setupEventListeners(container);
  }

  /**
   * Load statistics from the backend
   */
  async loadStats() {
    try {
      // Fetch stats from backend API
      const response = await fetch('/api/admin/stats');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      this.stats = await response.json();
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
      this.stats = this.getPlaceholderStats();
    }
  }

  /**
   * Get placeholder stats for when API is unavailable
   */
  getPlaceholderStats() {
    return {
      total_urls: 0,
      total_queries: 0,
      avg_response_time: 0,
      total_feedback: 0,
      positive_feedback: 0,
      negative_feedback: 0,
      last_scrape: null,
      system_health: 'unknown'
    };
  }

  /**
   * Get loading HTML
   */
  getLoadingHTML() {
    return `
      <div class="dashboard-loading">
        <div class="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    `;
  }

  /**
   * Get full dashboard HTML
   */
  getDashboardHTML() {
    const stats = this.stats || this.getPlaceholderStats();
    const positivePercentage = stats.total_feedback > 0
      ? Math.round((stats.positive_feedback / stats.total_feedback) * 100)
      : 0;

    return `
      <div class="admin-dashboard">
        <div class="dashboard-header">
          <h2>Dashboard</h2>
          <button id="refresh-dashboard" class="btn-icon" title="Refresh">
            <span class="material-symbols-outlined">refresh</span>
          </button>
        </div>

        <div class="dashboard-stats-grid">
          <!-- Total URLs Card -->
          <div class="stat-card card-blue">
            <div class="stat-icon">
              <span class="material-symbols-outlined">link</span>
            </div>
            <div class="stat-content">
              <div class="stat-value">${stats.total_urls.toLocaleString()}</div>
              <div class="stat-label">Indexed URLs</div>
            </div>
          </div>

          <!-- Total Queries Card -->
          <div class="stat-card card-purple">
            <div class="stat-icon">
              <span class="material-symbols-outlined">search</span>
            </div>
            <div class="stat-content">
              <div class="stat-value">${stats.total_queries.toLocaleString()}</div>
              <div class="stat-label">Total Queries</div>
            </div>
          </div>

          <!-- Avg Response Time Card -->
          <div class="stat-card card-orange">
            <div class="stat-icon">
              <span class="material-symbols-outlined">speed</span>
            </div>
            <div class="stat-content">
              <div class="stat-value">${stats.avg_response_time.toFixed(2)}s</div>
              <div class="stat-label">Avg Response Time</div>
            </div>
          </div>

          <!-- Feedback Score Card -->
          <div class="stat-card card-green">
            <div class="stat-icon">
              <span class="material-symbols-outlined">thumb_up</span>
            </div>
            <div class="stat-content">
              <div class="stat-value">${positivePercentage}%</div>
              <div class="stat-label">Positive Feedback</div>
              <div class="stat-meta">${stats.positive_feedback}/${stats.total_feedback} responses</div>
            </div>
          </div>
        </div>

        <div class="dashboard-info-section">
          <div class="info-card">
            <div class="info-header">
              <span class="material-symbols-outlined">schedule</span>
              <h3>Last Content Update</h3>
            </div>
            <div class="info-content">
              <p>${stats.last_scrape ? this.formatDate(stats.last_scrape) : 'Never'}</p>
            </div>
          </div>

          <div class="info-card">
            <div class="info-header">
              <span class="material-symbols-outlined">health_and_safety</span>
              <h3>System Health</h3>
            </div>
            <div class="info-content">
              <div class="health-status status-${stats.system_health}">
                ${this.getHealthIcon(stats.system_health)}
                <span>${this.getHealthLabel(stats.system_health)}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="dashboard-footer">
          <span class="material-symbols-outlined">info</span>
          <span>Dashboard auto-refreshes every 30 seconds</span>
        </div>
      </div>
    `;
  }

  /**
   * Set up event listeners
   */
  setupEventListeners(container) {
    // Refresh button
    const refreshBtn = container.querySelector('#refresh-dashboard');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('spinning');
        await this.loadStats();
        this.render(container);
      });
    }
  }

  /**
   * Start auto-refresh interval
   */
  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(async () => {
      await this.loadStats();
      // Update stats in-place without full re-render to avoid flicker
      this.updateStatsInPlace();
    }, this.refreshRate);
  }

  /**
   * Stop auto-refresh interval
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Update stats in-place without full re-render
   */
  updateStatsInPlace() {
    const stats = this.stats || this.getPlaceholderStats();
    const statValues = document.querySelectorAll('.stat-value');

    if (statValues.length >= 4) {
      statValues[0].textContent = stats.total_urls.toLocaleString();
      statValues[1].textContent = stats.total_queries.toLocaleString();
      statValues[2].textContent = `${stats.avg_response_time.toFixed(2)}s`;

      const positivePercentage = stats.total_feedback > 0
        ? Math.round((stats.positive_feedback / stats.total_feedback) * 100)
        : 0;
      statValues[3].textContent = `${positivePercentage}%`;
    }
  }

  /**
   * Format date string
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
  }

  /**
   * Get health status icon
   */
  getHealthIcon(status) {
    const icons = {
      healthy: '<span class="material-symbols-outlined">check_circle</span>',
      degraded: '<span class="material-symbols-outlined">warning</span>',
      down: '<span class="material-symbols-outlined">error</span>',
      unknown: '<span class="material-symbols-outlined">help</span>'
    };
    return icons[status] || icons.unknown;
  }

  /**
   * Get health status label
   */
  getHealthLabel(status) {
    const labels = {
      healthy: 'All Systems Operational',
      degraded: 'Degraded Performance',
      down: 'System Down',
      unknown: 'Status Unknown'
    };
    return labels[status] || labels.unknown;
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    this.stopAutoRefresh();
    this.stats = null;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdminDashboard;
}
