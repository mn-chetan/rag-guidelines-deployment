/**
 * Admin Portal Application
 * Handles URL management, scheduling, and job monitoring
 */

class AdminApp {
    constructor() {
        this.apiClient = new APIClient();
        this.pollInterval = null;
        this.urls = [];
        
        this.init();
    }

    async init() {
        // Bind UI elements
        this.bindElements();
        this.bindEvents();
        
        // Load initial data
        await this.loadAllData();
        
        // Start polling for job status
        this.startPolling();
    }

    bindElements() {
        // Status cards
        this.importStatus = document.getElementById('import-status');
        this.importDetails = document.getElementById('import-details');
        this.scheduleEnabled = document.getElementById('schedule-enabled');
        this.scheduleInterval = document.getElementById('schedule-interval');
        this.scheduleStatusText = document.getElementById('schedule-status-text');
        this.nextRunText = document.getElementById('next-run-text');
        this.jobStatus = document.getElementById('job-status');
        this.jobDetails = document.getElementById('job-details');
        this.jobProgressContainer = document.getElementById('job-progress-container');
        this.jobProgressBar = document.getElementById('job-progress-bar');
        this.jobProgressText = document.getElementById('job-progress-text');

        // Actions
        this.recrawlAllBtn = document.getElementById('recrawl-all-btn');

        // URL list
        this.urlList = document.getElementById('url-list');
        this.urlCount = document.getElementById('url-count');
    }

    bindEvents() {
        // Recrawl all button
        this.recrawlAllBtn.addEventListener('click', () => this.recrawlAll());

        // Schedule toggle
        this.scheduleEnabled.addEventListener('change', () => this.updateSchedule());

        // Schedule interval
        this.scheduleInterval.addEventListener('change', () => this.updateSchedule());
    }

    async loadAllData() {
        await Promise.all([
            this.loadUrls(),
            this.loadSchedule(),
            this.loadImportStatus(),
            this.loadJobStatus()
        ]);
    }

    startPolling() {
        // Poll every 3 seconds
        this.pollInterval = setInterval(() => {
            this.loadJobStatus();
        }, 3000);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    // ==================== URL Management ====================

    async loadUrls() {
        try {
            const response = await fetch(`${this.apiClient.baseURL}/admin/urls`);
            const data = await response.json();
            
            this.urls = data.urls || [];
            this.renderUrls();
            this.urlCount.textContent = `${this.urls.length} URL${this.urls.length !== 1 ? 's' : ''}`;
        } catch (error) {
            console.error('Failed to load URLs:', error);
            this.urlList.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined">error</span>
                    <p>Failed to load URLs. Please refresh the page.</p>
                </div>
            `;
        }
    }

    renderUrls() {
        if (this.urls.length === 0) {
            this.urlList.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined">link_off</span>
                    <p>No URLs configured. URLs are managed via backend configuration.</p>
                </div>
            `;
            return;
        }

        this.urlList.innerHTML = this.urls.map(url => this.renderUrlItem(url)).join('');

        // Bind events for each URL item
        this.urls.forEach(url => {
            const item = document.querySelector(`[data-url-id="${url.id}"]`);
            if (item) {
                // Toggle URL visibility
                const nameEl = item.querySelector('.url-item-name');
                const urlEl = item.querySelector('.url-item-url');
                nameEl.addEventListener('click', () => {
                    nameEl.classList.toggle('expanded');
                    urlEl.classList.toggle('visible');
                });

                // Recrawl button
                const recrawlBtn = item.querySelector('.recrawl-btn');
                recrawlBtn.addEventListener('click', () => this.recrawlUrl(url.id));
            }
        });
    }

    renderUrlItem(url) {
        const statusClass = this.getStatusClass(url.last_index_status);
        const statusText = this.getStatusText(url.last_index_status);
        const lastIndexed = url.last_indexed_at 
            ? this.formatDate(url.last_indexed_at)
            : 'Never indexed';
        
        return `
            <div class="url-item" data-url-id="${url.id}">
                <div class="url-item-main">
                    <div class="url-item-header">
                        <span class="url-item-name">
                            <span class="material-symbols-outlined">chevron_right</span>
                            ${this.escapeHtml(url.name)}
                        </span>
                        <span class="url-item-status ${statusClass}">
                            <span class="status-dot ${statusClass}"></span>
                            ${statusText}
                        </span>
                    </div>
                    <div class="url-item-url">
                        <a href="${this.escapeHtml(url.url)}" target="_blank" rel="noopener noreferrer">
                            ${this.escapeHtml(url.url)}
                        </a>
                    </div>
                    <div class="url-item-meta">
                        Last indexed: ${lastIndexed}
                        ${url.last_error ? ` • Error: ${this.escapeHtml(url.last_error)}` : ''}
                    </div>
                </div>
                <div class="url-item-actions">
                    <button class="icon-button recrawl-btn" title="Re-crawl this URL">
                        <span class="material-symbols-outlined">refresh</span>
                    </button>
                </div>
            </div>
        `;
    }

    getStatusClass(status) {
        const statusMap = {
            'success': 'success',
            'error': 'error',
            'pending': 'pending',
            'unchanged': 'unchanged',
            'indexing': 'indexing'
        };
        return statusMap[status] || 'pending';
    }

    getStatusText(status) {
        const textMap = {
            'success': 'Indexed',
            'error': 'Error',
            'pending': 'Pending',
            'unchanged': 'Unchanged',
            'indexing': 'Indexing...'
        };
        return textMap[status] || 'Unknown';
    }

    async recrawlUrl(urlId) {
        const item = document.querySelector(`[data-url-id="${urlId}"]`);
        const recrawlBtn = item?.querySelector('.recrawl-btn');
        
        if (recrawlBtn) {
            recrawlBtn.disabled = true;
            recrawlBtn.classList.add('loading');
        }
        
        try {
            const response = await fetch(`${this.apiClient.baseURL}/admin/urls/${urlId}/recrawl`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || 'Failed to recrawl URL');
            }
            
            // Reload URLs to show updated status
            await this.loadUrls();
            await this.loadImportStatus();
        } catch (error) {
            console.error('Failed to recrawl URL:', error);
            alert(`Failed to recrawl: ${error.message}`);
        } finally {
            if (recrawlBtn) {
                recrawlBtn.disabled = false;
                recrawlBtn.classList.remove('loading');
            }
        }
    }

    // ==================== Bulk Operations ====================

    async recrawlAll() {
        const confirmed = await confirmationDialog.show({
            title: 'Re-crawl All URLs?',
            message: `This will re-index ${this.urls.length} URL${this.urls.length !== 1 ? 's' : ''}. Continue?`,
            confirmText: 'Start Re-crawl',
            cancelText: 'Cancel',
            variant: 'warning'
        });
        
        if (!confirmed) {
            return;
        }
        
        this.recrawlAllBtn.disabled = true;
        this.recrawlAllBtn.classList.add('loading');
        
        try {
            const response = await fetch(`${this.apiClient.baseURL}/admin/recrawl-all`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.status === 'error') {
                alert(data.message);
                return;
            }
            
            // Job started, polling will handle updates
            console.log('Bulk recrawl started:', data);
        } catch (error) {
            console.error('Failed to start bulk recrawl:', error);
            alert(`Failed to start recrawl: ${error.message}`);
        }
    }

    // ==================== Schedule Management ====================

    async loadSchedule() {
        try {
            const response = await fetch(`${this.apiClient.baseURL}/admin/schedule`);
            const schedule = await response.json();
            
            this.scheduleEnabled.checked = schedule.enabled !== false;
            this.scheduleStatusText.textContent = schedule.enabled !== false ? 'Enabled' : 'Disabled';
            
            if (schedule.interval_hours) {
                this.scheduleInterval.value = schedule.interval_hours.toString();
            }
            
            if (schedule.next_run_at) {
                const nextRun = new Date(schedule.next_run_at);
                const timeUntil = this.getTimeUntil(nextRun);
                this.nextRunText.textContent = `Next run: ${this.formatDate(schedule.next_run_at)} (${timeUntil})`;
            } else {
                this.nextRunText.textContent = 'Next run: Not scheduled';
            }
        } catch (error) {
            console.error('Failed to load schedule:', error);
        }
    }

    async updateSchedule() {
        const enabled = this.scheduleEnabled.checked;
        const intervalHours = parseInt(this.scheduleInterval.value);
        
        this.scheduleStatusText.textContent = enabled ? 'Enabled' : 'Disabled';
        
        try {
            const response = await fetch(`${this.apiClient.baseURL}/admin/schedule`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    enabled, 
                    interval_hours: intervalHours 
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update schedule');
            }
            
            await this.loadSchedule();
        } catch (error) {
            console.error('Failed to update schedule:', error);
        }
    }

    // ==================== Job Status ====================

    async loadJobStatus() {
        try {
            const response = await fetch(`${this.apiClient.baseURL}/admin/job-status`);
            const job = await response.json();
            
            if (job.status === 'no_job') {
                this.showIdleJobStatus();
                return;
            }
            
            this.updateJobStatusUI(job);
            
            // If job is running, keep polling. Otherwise, stop.
            if (job.status === 'running') {
                this.recrawlAllBtn.disabled = true;
                this.recrawlAllBtn.classList.add('loading');
            } else {
                this.recrawlAllBtn.disabled = false;
                this.recrawlAllBtn.classList.remove('loading');
                
                // Reload URLs when job completes
                if (job.status === 'completed' || job.status === 'failed') {
                    await this.loadUrls();
                    await this.loadImportStatus();
                }
            }
        } catch (error) {
            console.error('Failed to load job status:', error);
        }
    }

    showIdleJobStatus() {
        this.jobStatus.innerHTML = `
            <span class="status-dot idle"></span>
            <span class="status-text">Idle</span>
        `;
        this.jobDetails.textContent = 'No active job';
        this.jobProgressContainer.classList.add('hidden');
    }

    updateJobStatusUI(job) {
        const statusDotClass = job.status === 'running' ? 'running' : 
                               job.status === 'completed' ? 'success' : 'error';
        const statusText = job.status === 'running' ? 'Running' :
                          job.status === 'completed' ? 'Completed' : 'Failed';
        
        this.jobStatus.innerHTML = `
            <span class="status-dot ${statusDotClass}"></span>
            <span class="status-text">${statusText}</span>
        `;
        
        if (job.status === 'running') {
            this.jobDetails.textContent = job.current_url_name 
                ? `Processing: ${job.current_url_name}`
                : 'Starting...';
            
            this.jobProgressContainer.classList.remove('hidden');
            const progress = job.total_urls > 0 
                ? Math.round((job.processed_urls / job.total_urls) * 100)
                : 0;
            this.jobProgressBar.style.width = `${progress}%`;
            this.jobProgressText.textContent = `${job.processed_urls} / ${job.total_urls}`;
        } else {
            this.jobDetails.textContent = `${job.successful_urls} success, ${job.failed_urls} failed, ${job.skipped_urls} skipped`;
            this.jobProgressContainer.classList.add('hidden');
        }
    }

    // ==================== Import Status ====================

    async loadImportStatus() {
        try {
            const response = await fetch(`${this.apiClient.baseURL}/admin/import-status`);
            const importData = await response.json();
            
            if (importData.status === 'no_import') {
                this.importStatus.innerHTML = `
                    <span class="status-dot pending"></span>
                    <span class="status-text">No imports yet</span>
                `;
                this.importDetails.textContent = 'Index some URLs to trigger an import';
                return;
            }
            
            const statusDotClass = importData.status === 'completed' ? 'success' :
                                   importData.status === 'started' ? 'indexing' : 'error';
            const statusText = importData.status === 'completed' ? 'Ready' :
                              importData.status === 'started' ? 'Importing...' : 'Error';
            
            this.importStatus.innerHTML = `
                <span class="status-dot ${statusDotClass}"></span>
                <span class="status-text">${statusText}</span>
            `;
            
            const importTime = importData.completed_at || importData.started_at;
            this.importDetails.textContent = importTime 
                ? `Last import: ${this.formatDate(importTime)}`
                : 'Import in progress...';
        } catch (error) {
            console.error('Failed to load import status:', error);
        }
    }

    // ==================== Utilities ====================

    formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    getTimeUntil(date) {
        const now = new Date();
        const diff = date - now;
        
        if (diff < 0) return 'overdue';
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `in ${days}d ${hours % 24}h`;
        }
        
        if (hours > 0) {
            return `in ${hours}h ${minutes}m`;
        }
        
        return `in ${minutes}m`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize tab system
    const tabs = new AdminTabs({
        tabsContainer: document.getElementById('admin-tabs'),
        contentContainer: document.getElementById('admin-content'),
        onTabChange: (tabId) => {
            console.log(`Switched to tab: ${tabId}`);
        }
    });



    // Initialize admin app (will be refactored into tabs)
    window.adminApp = new AdminApp();

    // Register tabs
    tabs.registerTabs([
        {
            id: 'url-management',
            label: 'URL Management',
            icon: 'link',
            loadContent: async (container) => {
                // Clone the legacy URL management section
                const legacyContent = document.getElementById('legacy-content');
                const urlSection = legacyContent.querySelector('.url-management');
                const statusCards = legacyContent.querySelector('.status-cards');
                const bulkActions = legacyContent.querySelector('.bulk-actions');

                container.innerHTML = '';
                container.appendChild(statusCards.cloneNode(true));
                container.appendChild(bulkActions.cloneNode(true));
                container.appendChild(urlSection.cloneNode(true));

                // Re-bind events since we cloned the elements
                window.adminApp.bindElements();
                window.adminApp.bindEvents();
                await window.adminApp.loadAllData();
            }
        },
        {
            id: 'prompt-builder',
            label: 'Prompt Builder',
            icon: 'edit_note',
            loadContent: async (container) => {
                // Initialize guided prompt builder
                const guidedBuilder = new GuidedPromptBuilder({
                    apiClient: new APIClient(),
                    onSave: (template, config) => {
                        console.log('Prompt saved:', { template, config });
                    }
                });

                guidedBuilder.render(container);
            }
        }
    ]);

    // Store tabs instance globally for access
    window.adminTabs = tabs;
});
