/**
 * API Client
 * Handles communication with the backend API
 */

class APIClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || 'https://auditor-rag-api-438886470292.us-central1.run.app';
    this.timeout = options.timeout || 10000; // 10 second timeout
  }

  /**
   * Create a fetch request with timeout
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} Fetch response
   */
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle network failures
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please try again');
      }
      
      if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
        throw new Error('Network error - please check your connection and try again');
      }
      
      throw error;
    }
  }

  /**
   * Submit a query to the backend with streaming
   * @param {Object} queryData - Query data
   * @param {Function} onChunk - Callback for each text chunk
   * @param {Function} onComplete - Callback when done
   * @returns {Promise<void>}
   */
  async queryAPIStream(queryData, onChunk, onComplete) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/query-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(queryData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullAnswer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            let data;
            try {
              data = JSON.parse(line.slice(6));
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError, 'Line:', line);
              continue; // Skip malformed data
            }
            
            if (data.error) {
              throw new Error(data.error);
            }
            
            if (data.text) {
              fullAnswer += data.text;
              onChunk(data.text);
            }
            
            if (data.done) {
              onComplete({
                answer: fullAnswer,
                sources: data.sources || []
              });
              return;
            }
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please try again');
      }
      throw new Error(`Failed to process query: ${error.message}`);
    }
  }

  /**
   * Submit a query to the backend (non-streaming fallback)
   * @param {Object} queryData - Query data
   * @returns {Promise<Object>} Response data
   */
  async queryAPI(queryData) {
    try {
      const response = await this.fetchWithTimeout(`${this.baseURL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(queryData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      // Re-throw with context
      if (error.message.includes('timeout') || error.message.includes('Network error')) {
        throw error;
      }
      throw new Error(`Failed to process query: ${error.message}`);
    }
  }

  /**
   * Submit feedback to the backend
   * @param {Object} feedbackData - Feedback data
   * @returns {Promise<Object>} Response data
   */
  async submitFeedback(feedbackData) {
    try {
      const response = await this.fetchWithTimeout(`${this.baseURL}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(feedbackData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      // Re-throw with context
      if (error.message.includes('timeout') || error.message.includes('Network error')) {
        throw error;
      }
      throw new Error(`Failed to submit feedback: ${error.message}`);
    }
  }

  /**
   * Index a URL by scraping and adding to knowledge base
   * @param {string} url - The URL to index
   * @returns {Promise<Object>} Response data with status and file_path
   */
  async indexURL(url) {
    try {
      // Use longer timeout for indexing (60 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(`${this.baseURL}/index-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || `API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Indexing timeout - the URL took too long to process');
      }

      if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
        throw new Error('Network error - please check your connection and try again');
      }

      throw new Error(`Failed to index URL: ${error.message}`);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APIClient;
}
