# 🚀 Guideline Assistant - Onboarding Documentation

Welcome to the Guideline Assistant project! This document will get you up to speed on everything we've built so far.

## 📋 Table of Contents

1. [What Is This Project?](#what-is-this-project)
2. [The Big Picture](#the-big-picture)
3. [Architecture Overview](#architecture-overview)
4. [Backend Deep Dive](#backend-deep-dive)
5. [Frontend Deep Dive](#frontend-deep-dive)
6. [Key Features Explained](#key-features-explained)
7. [The Data Flow](#the-data-flow)
8. [How Everything Connects](#how-everything-connects)
9. [Current Issues & TODO](#current-issues--todo)
10. [Getting Started](#getting-started)
11. [Useful Resources](#useful-resources)

---

## 🎯 What Is This Project?

### The Problem

Imagine you're a content moderator reviewing thousands of images daily. You see a wine bottle in the background of a photo. Quick question: **Should you flag it or not?**

You'd need to:
1. Open a 50-page PDF guideline document
2. Search for "alcohol"
3. Read through dense policy text
4. Try to remember if background items count
5. Repeat this for every edge case you encounter

**This takes forever** and slows down the entire moderation pipeline.

### Our Solution

The **Guideline Assistant** is a RAG (Retrieval-Augmented Generation) application that gives auditors instant, accurate answers to guideline questions.

**Instead of manually searching PDFs, auditors can ask:**
- "Should I flag a wine bottle in the background?"
- "Is a toy gun considered a weapon?"
- "Can logos appear in the center of images?"

**And get back:**
- ✅ Clear verdict (Flag / Don't Flag / Needs Review)
- 📝 Explanation with guideline references
- 🔗 Source citations with exact page links
- 💡 Related questions they might ask next

**Result:** Auditors work 10x faster with higher accuracy.

---

## 🌍 The Big Picture

### Technology Stack

**Backend (Python):**
- **FastAPI** - Modern, fast web framework
- **Google Cloud Discovery Engine** - Enterprise RAG search (vector + keyword hybrid)
- **Google Vertex AI (Gemini 2.5 Flash)** - LLM for generating responses
- **Google Cloud Storage (GCS)** - Document storage
- **Trafilatura** - Web scraping library

**Frontend (Vanilla JavaScript):**
- **Material Design 3** - Google's design system
- **Modular ES6** - Component-based architecture
- **Server-Sent Events (SSE)** - Streaming responses
- **LocalStorage** - Session persistence

**Infrastructure:**
- **Google Cloud Run** - Serverless container deployment
- **Cloud Scheduler** - Automated re-crawling
- **Docker** - Containerization

### Why These Choices?

1. **Discovery Engine**: Gives us enterprise-grade RAG without building our own vector DB
2. **Gemini 2.5 Flash**: Fast, cheap, and great at following instructions
3. **Vanilla JS**: No framework lock-in, easier to understand for learning
4. **Cloud Run**: Scales to zero when not used (saves money), auto-scales under load

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                       │
│  (Browser - index.html + CSS + Vanilla JS Modules)          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ HTTP/SSE
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND                           │
│                  (Cloud Run Container)                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Query      │  │   URL        │  │    Admin     │     │
│  │  Endpoint    │  │  Indexing    │  │   Portal     │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          │                  │                  │
    ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
    │ Discovery │     │    GCS    │     │   GCS     │
    │  Engine   │◄────│  Bucket   │     │  Config   │
    │  (RAG)    │     │(Documents)│     │   Files   │
    └─────┬─────┘     └───────────┘     └───────────┘
          │
          │ Context
          ▼
    ┌─────────────┐
    │   Gemini    │
    │ 2.5 Flash   │
    │    (LLM)    │
    └─────────────┘
```

### The Three Main Flows

**1. Query Flow (User asks a question)**
```
User types query → Backend retrieves context from Discovery Engine 
→ Backend sends context + query to Gemini → Gemini streams response 
→ Frontend displays answer with sources
```

**2. Indexing Flow (Adding new guidelines)**
```
Admin enters URL → Backend scrapes content → Converts to HTML 
→ Uploads to GCS → Triggers Discovery Engine import 
→ Document becomes searchable
```

**3. Admin Flow (Managing system)**
```
Admin updates prompt/URLs → Saves to GCS config files 
→ Changes take effect immediately → Audit trail maintained
```

---

## 🔧 Backend Deep Dive

### File Structure

```
backend/
├── main.py           # FastAPI app (queries, indexing, admin)
├── scraper.py        # Web scraping logic
├── admin.py          # URL & prompt management
├── requirements.txt  # Python dependencies
└── Dockerfile        # Container definition
```

### main.py - The Heart of the Backend

**Key Endpoints:**

1. **`POST /query-stream`** - The main query endpoint
   ```python
   # This is where the magic happens
   # Takes user query → Retrieves from Discovery Engine → Streams Gemini response
   ```

2. **`POST /index-url`** - Add a URL to the knowledge base
   ```python
   # Scrapes URL → Uploads to GCS → Triggers import
   ```

3. **Admin Portal Endpoints:**
   - `GET/POST /admin/urls` - Manage guideline URLs
   - `PUT /admin/prompt` - Customize system prompt
   - `POST /admin/recrawl-all` - Re-index everything
   - `GET /admin/job-status` - Monitor crawling jobs

**Critical Functions:**

```python
def retrieve_snippets(query: str) -> list:
    """
    Queries Discovery Engine to find relevant document snippets.
    Returns top 6 results with max 5 snippets per document.
    
    This is FAST (< 1 second) because:
    - No summary generation (just retrieve)
    - Optimized page size
    - Parallel processing
    """
```

```python
def generate_with_gemini(query: str, sources: list, modification: str = None) -> str:
    """
    Takes retrieved context + user query → Asks Gemini to generate answer.
    
    Supports 3 modes:
    - default: Normal detailed answer (768 tokens)
    - shorter: Concise answer (256 tokens)
    - more: Comprehensive answer (2048 tokens)
    """
```

```python
def build_prompt(query: str, context_text: str, modification: str = None) -> str:
    """
    Loads customizable prompt from GCS config.
    Replaces {{query}} and {{context}} variables.
    
    This is what makes the assistant give structured responses with:
    - Verdict
    - Reasoning
    - Guideline reference
    - Related questions
    """
```

### scraper.py - Web Content Extraction

**The Challenge:**
Websites have navigation bars, ads, footers, etc. We only want the actual guideline content.

**Our Solution:**
```python
class WebScraper:
    def scrape_url(self, url: str) -> Dict[str, str]:
        # Try 1: Trafilatura (best for articles)
        content = trafilatura.extract(html, output_format='markdown')
        
        # Fallback: BeautifulSoup (removes junk, keeps main content)
        if not content or len(content) < 100:
            content = self._extract_with_beautifulsoup(html)
```

**Output:** Clean markdown text that Discovery Engine can index effectively.

### admin.py - Configuration Management

This file manages two critical things:

**1. URL Management**
```python
# URLs are stored in GCS as JSON:
{
  "urls": [
    {
      "id": "url-001",
      "name": "Image Guidelines", 
      "url": "https://...",
      "last_indexed_at": "2025-12-09T10:00:00Z",
      "status": "success",
      "content_hash": "abc123..."  # For change detection
    }
  ]
}
```

**2. Prompt Configuration**
```python
# Prompts are versioned in GCS:
{
  "active_prompt": {
    "version": 5,
    "template": "You are the Guideline Assistant...",
    "updated_at": "2025-12-09T10:00:00Z"
  },
  "history": [...]  # Last 10 versions for rollback
}
```

**Why GCS for config?**
- Persistent (doesn't disappear on container restart)
- Versioned (can rollback changes)
- Accessible from Cloud Scheduler jobs

---

## 🎨 Frontend Deep Dive

### File Structure

```
frontend/
├── index.html              # Main UI
├── admin.html              # Admin portal
├── css/
│   ├── styles.css          # Material Design 3 theme
│   └── admin.css           # Admin-specific styles
└── js/
    ├── app.js              # Main orchestrator
    ├── api-client.js       # Backend communication
    ├── conversation.js     # Chat history management
    ├── query-input.js      # Input handling
    ├── response-renderer.js # Markdown → HTML
    ├── response-actions.js # Modify/regenerate buttons
    ├── feedback.js         # Thumbs up/down
    ├── session.js          # LocalStorage sessions
    ├── sidebar.js          # Source links display
    ├── loading.js          # Loading states
    ├── pdf-viewer.js       # PDF split-pane
    ├── text-fragment-utils.js # URL highlighting
    ├── admin-app.js        # Admin URL management
    └── admin-prompt.js     # Prompt customization
```

### Module Breakdown

#### 1. app.js - The Orchestrator

This is like the "main()" function of the frontend. It:
- Initializes all components
- Wires them together
- Handles global events
- Sets up keyboard shortcuts

**Key Pattern:**
```javascript
// Create a global app object to hold all components
let app = {
  apiClient: null,
  conversation: null,
  queryInput: null,
  // ... etc
};

// Initialize everything
async function initializeApp() {
  app.apiClient = new APIClient();
  app.conversation = new Conversation();
  app.queryInput = new QueryInput({ onSubmit: handleQuerySubmit });
  // ... etc
}
```

#### 2. api-client.js - Backend Communication

**The Challenge:** Network requests can fail, timeout, or be slow.

**Our Solution:**
```javascript
class APIClient {
  async queryAPIStream(queryData, onChunk, onComplete) {
    // Use Server-Sent Events (SSE) for streaming
    const response = await fetch(`${this.baseURL}/query-stream`, {
      method: 'POST',
      body: JSON.stringify(queryData)
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    // Read chunks as they arrive
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      onChunk(chunk);  // Display immediately!
    }
  }
}
```

**Why Streaming?**
- User sees response start appearing in ~500ms
- Feels 10x faster than waiting for complete response
- Uses SSE (simpler than WebSockets)

#### 3. conversation.js - Chat History

**Manages:**
- List of conversation entries (query + response + sources)
- Chronological ordering
- DOM rendering
- Auto-scrolling

**Key Data Structure:**
```javascript
{
  id: "entry-1733765432-abc123",
  query: "Should I flag a wine bottle?",
  answer: "**Verdict**: Don't Flag\n\n...",
  sources: [
    { title: "Alcohol Guidelines", url: "https://...", snippet: "..." }
  ],
  timestamp: 1733765432000,
  feedback: "positive",
  streaming: false
}
```

#### 4. response-renderer.js - Markdown → HTML

**Input (from Gemini):**
```
**Verdict**: Flag

**Why**:
- The guideline prohibits weapons
- Toy guns are considered weapons
```

**Output:**
```html
<div class="rendered-response">
  <p><strong>Verdict</strong>: Flag</p>
  <p><strong>Why</strong>:</p>
  <ul>
    <li>The guideline prohibits weapons</li>
    <li>Toy guns are considered weapons</li>
  </ul>
</div>
```

**Special Feature:** Extracts "Related Questions" and renders them as clickable cards.

#### 5. text-fragment-utils.js - URL Highlighting

**The Problem:** When you click a source citation, how do you show the user EXACTLY where the relevant text is?

**The Solution:** Text Fragments API
```javascript
// Normal URL:
https://guidelines.com/page

// Text Fragment URL (highlights specific text):
https://guidelines.com/page#:~:text=alcohol%20in%20background
```

**Our Algorithm:**
1. Extract keywords from user query ("wine bottle", "background")
2. Score each sentence in the snippet by keyword overlap
3. Pick the best 3-10 word phrase
4. Sanitize and encode it
5. Build the highlight URL

**Example:**
```javascript
Query: "Is a wine bottle in the background allowed?"
Snippet: "Alcohol products must not be prominently featured. 
          However, incidental background items are acceptable..."

Best match: "incidental background items are acceptable"
URL: https://guidelines.com#:~:text=incidental%20background%20items%20are%20acceptable
```

#### 6. session.js - Persistence

**Problem:** User refreshes page → conversation disappears 😢

**Solution:** LocalStorage
```javascript
// Save every 30 seconds
setInterval(() => {
  const session = {
    id: this.currentSessionId,
    entries: conversation.getEntries(),
    updatedAt: Date.now()
  };
  localStorage.setItem('sessions', JSON.stringify(sessions));
}, 30000);
```

**Bonus:** Conversation list in sidebar with:
- "Today", "Yesterday", "Last 7 Days" grouping
- Click to load old conversations
- Delete button (except current session)

#### 7. pdf-viewer.js - Split Pane

When a user clicks a PDF source citation, we don't open a new tab. Instead:

```
┌─────────────────┬─────────────────┐
│  Conversation   │   PDF Viewer    │
│                 │                 │
│  User: "..."    │   [PDF pages]   │
│  AI: "..."      │                 │
│  Sources:       │   [Navigate]    │
│  📄 Guidelines  │   [Close]       │
└─────────────────┴─────────────────┘
```

**Implementation:**
- Uses `<iframe>` with backend PDF proxy (avoids CORS)
- CSS flex layout for 50/50 split
- Future: Could add PDF.js for text highlighting

---

## ✨ Key Features Explained

### 1. Streaming Responses

**Why it matters:** Perceived latency is everything in UX.

**How it works:**
```
User submits query (t=0ms)
↓
Backend starts Discovery Engine search (t=0-800ms)
↓
Backend streams first token from Gemini (t=900ms) ← User sees this!
↓
Frontend appends each token as it arrives
↓
Full response complete (t=3000ms)
```

**Without streaming:** User waits 3 seconds staring at loading spinner.
**With streaming:** User sees answer starting at 900ms.

### 2. Text Fragment Highlighting

**The "Wow" Factor:**
When users click a source citation, the browser automatically scrolls to and highlights the exact relevant sentence.

**Challenges:**
- Text fragments must be unique on the page
- Can't be too long (URL length limits)
- Can't be too short (multiple matches)
- Must handle special characters, markdown, HTML entities

**Our Solution:**
- Score sentences by query keyword overlap
- Pick 3-10 word phrase with highest score
- Sanitize thoroughly
- Test on multiple browser (Chrome, Edge, Safari 16.1+)

**See:** `TODO.md` - This needs more testing!

### 3. Customizable Prompts

**Why:** Different teams have different needs. Maybe one team wants more formal language, another wants bullet points.

**How it works:**
1. Admin edits prompt template in admin portal
2. Template saved to GCS with version number
3. Backend loads template on every query
4. Variables `{{query}}` and `{{context}}` are replaced

**Bonus Features:**
- Preview with sample query before saving
- Version history (last 10 versions)
- Rollback to any previous version
- Reset to default

### 4. Content Change Detection

**Problem:** Guidelines update frequently. We don't want to re-scrape if nothing changed.

**Solution:**
```python
# When scraping:
content_hash = hashlib.sha256(content.encode()).hexdigest()

# When re-crawling:
if old_hash == new_hash and file_exists_in_gcs(url):
    return "unchanged"  # Skip!
```

**Result:** Scheduled re-crawls are fast and don't waste API quota.

### 5. Related Questions

**The Problem:** Users often have follow-up questions but don't know what to ask.

**The Solution:**
We prompt Gemini to suggest 3 related questions based on:
- The guideline context
- Common edge cases
- Logical follow-ups

**Example:**
```
User: "Should I flag a wine bottle in the background?"
AI: "Don't Flag - Background items are acceptable"

Related Questions:
💬 What if the wine bottle is in focus?
💬 Are other alcohol types treated the same way?
💬 What about alcohol brand logos?
```

**Implementation:** These are rendered as clickable cards at the bottom of each response.

---

## 🔄 The Data Flow

### Query Flow (Step by Step)

Let me walk you through what happens when a user asks: **"Should I flag a toy gun?"**

**1. User Input (0ms)**
```javascript
// query-input.js
handleSubmit(event) {
  const query = "Should I flag a toy gun?";
  this.onSubmit(query);  // Calls app.js handler
}
```

**2. Show Loading State (10ms)**
```javascript
// loading.js
const operationId = loadingManager.showQueryLoading();
// Disables input, shows spinner
```

**3. Add Entry to Conversation (20ms)**
```javascript
// conversation.js
const entryId = conversation.addEntry({
  query: "Should I flag a toy gun?",
  answer: "",  // Empty initially
  sources: [],
  streaming: true
});
```

**4. Send to Backend (30ms)**
```javascript
// api-client.js
apiClient.queryAPIStream(
  { query: "Should I flag a toy gun?" },
  onChunk,    // Called for each token
  onComplete  // Called when done
);
```

**5. Backend Retrieves Context (30-800ms)**
```python
# main.py - retrieve_snippets()
sources = search_client.search(request)
# Returns:
# [
#   {
#     "title": "Weapons Policy",
#     "snippet": "Toy weapons including toy guns, water guns..."
#   }
# ]
```

**6. Backend Builds Prompt (810ms)**
```python
# main.py - build_prompt()
prompt = f"""
You are the Guideline Assistant...

CONTEXT:
Source 1 (Weapons Policy):
Toy weapons including toy guns, water guns...

QUESTION: Should I flag a toy gun?

RESPOND IN THIS EXACT FORMAT:
**Verdict**: [Flag / Don't Flag / Needs Review]
...
"""
```

**7. Backend Streams from Gemini (820-3000ms)**
```python
# main.py
for chunk in gemini_model.generate_content(prompt, stream=True):
    yield f"data: {json.dumps({'text': chunk.text})}\n\n"
```

**8. Frontend Receives Chunks (900ms+)**
```javascript
// api-client.js
onChunk("**Ver")     // First chunk arrives!
onChunk("dict**:")    // More chunks...
onChunk(" Flag\n\n")  // Keep building...

// conversation.js updates the DOM after each chunk
conversation.updateEntry(entryId, { answer: currentAnswer });
```

**9. Complete Response (3000ms)**
```javascript
onComplete({
  answer: "**Verdict**: Flag\n\n**Why**:\n- Toy guns are considered weapons...",
  sources: [{ title: "Weapons Policy", url: "https://..." }]
});
```

**10. Hide Loading & Update Sources (3010ms)**
```javascript
loadingManager.hideLoading(operationId);
sidebar.updateSourceLinks(sources);
```

**Total Time:** 3 seconds end-to-end, but user sees first word at 900ms! 🚀

---

## 🔌 How Everything Connects

### Component Communication

```
                    ┌──────────────┐
                    │   app.js     │
                    │ (Orchestrator)│
                    └───────┬──────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼─────┐ ┌────▼────┐ ┌─────▼──────┐
        │ APIClient │ │  Conv.  │ │ QueryInput │
        └─────┬─────┘ └────┬────┘ └─────┬──────┘
              │            │            │
              │      ┌─────▼─────┐      │
              │      │ Response  │      │
              │      │ Renderer  │      │
              │      └─────┬─────┘      │
              │            │            │
        ┌─────▼────────────▼────────────▼─────┐
        │          Conversation Display        │
        │              (index.html)            │
        └──────────────────────────────────────┘
```

**Key Patterns:**

1. **Dependency Injection**
   ```javascript
   // Components receive dependencies in constructor
   const conversation = new Conversation({ sidebar: sidebar });
   const queryInput = new QueryInput({ onSubmit: handleQuerySubmit });
   ```

2. **Event Delegation**
   ```javascript
   // Instead of attaching handlers to each button:
   document.addEventListener('click', (e) => {
     if (e.target.classList.contains('action-btn')) {
       handleAction(e.target);
     }
   });
   ```

3. **Pub/Sub for Cross-Component Communication**
   ```javascript
   // session.js
   window.dispatchEvent(new CustomEvent('session-started', { detail: { sessionId } }));
   
   // app.js
   window.addEventListener('session-started', (e) => {
     console.log('New session:', e.detail.sessionId);
   });
   ```

### State Management

We use a hybrid approach:

**1. Component State** (for UI state)
```javascript
class QueryInput {
  constructor() {
    this.isLoading = false;  // Local component state
  }
}
```

**2. Shared State** (for app-wide state)
```javascript
// conversation.js
class Conversation {
  constructor() {
    this.entries = [];  // Shared via app.conversation
  }
}

// Any component can access:
app.conversation.getEntries();
```

**3. Persistent State** (for long-term storage)
```javascript
// session.js
localStorage.setItem('sessions', JSON.stringify(sessions));
```

---

## 🚧 Current Issues & TODO

### High Priority: Text Fragments Need Work

**Location:** `TODO.md` and `frontend/js/text-fragment-utils.js`

**The Problem:**
We're generating text fragment URLs for citations, but we're not sure they work reliably on all external pages.

**Issues:**
1. Fragment generation might not pick optimal text
2. Sanitization might be too aggressive
3. Query-aware extraction needs validation
4. No analytics to track success rate

**What Needs to Be Done:**
```javascript
// Current code in text-fragment-utils.js:
function extractTextFragment(snippet, options = {}) {
  // This function tries to pick the best 3-10 word phrase
  // from the snippet that matches query keywords
  
  // TODO:
  // 1. Test with various document types (PDF, web pages, docs)
  // 2. Improve scoring algorithm
  // 3. Handle edge cases (special chars, markdown artifacts)
  // 4. Add fallback strategies
  // 5. Track which fragments actually work
}
```

**How You Can Help:**
1. Create test suite with 20+ real guideline URLs
2. Test fragment generation for each
3. Manually verify highlights work in browser
4. Document success/failure patterns
5. Propose algorithm improvements

**Example Test Case:**
```javascript
const testCases = [
  {
    url: "https://guidelines.com/weapons",
    query: "toy guns",
    snippet: "Toy weapons including toy guns, water guns, and foam swords are considered weapons for moderation purposes.",
    expectedFragment: "toy guns, water guns", // Should highlight this
    actualFragment: "??",  // What does our code generate?
    worksInBrowser: true/false
  }
];
```

### Other Potential Improvements

**1. PDF Text Highlighting**
- Currently PDF viewer just shows the document
- Could use PDF.js to extract text and highlight snippets
- Would match the text fragment behavior for web pages

**2. Analytics Dashboard**
- Track most common queries
- Identify gaps in guidelines
- Monitor response quality
- See which sources are most cited

**3. Feedback Loop**
- Currently thumbs up/down goes nowhere
- Could use it to fine-tune responses
- Build a dataset of good/bad examples

**4. Multi-language Support**
- Guidelines exist in multiple languages
- Could detect user language and translate
- Or maintain separate document sets per language

---

## 🛠️ Getting Started

### Prerequisites

You'll need:
- Python 3.11+
- Node.js (for local dev server)
- Google Cloud account with billing enabled
- Code editor (VS Code recommended)

### Local Development Setup

**1. Clone and Navigate**
```bash
cd rag-for-guidelines
```

**2. Backend Setup**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

**3. Set Environment Variables**
```bash
export PROJECT_ID="rag-for-guidelines"
export LOCATION="global"
export DATA_STORE_ID="guidelines-data-store_1763919919982"
export GCS_BUCKET="rag-guidelines-v2"
```

**4. Authenticate with Google Cloud**
```bash
gcloud auth application-default login
```

**5. Run Backend**
```bash
uvicorn main:app --reload --port 8080
```

**6. Frontend Setup (separate terminal)**
```bash
cd frontend
python -m http.server 3000
# Or use any static server: `npx serve`, `live-server`, etc.
```

**7. Open Browser**
```
http://localhost:3000
```

### Testing the Pipeline

**Test Query Flow:**
1. Go to `http://localhost:3000`
2. Type: "Should I flag a wine bottle?"
3. You should see streaming response with sources

**Test Indexing:**
1. Go to `http://localhost:3000/admin.html`
2. Add a test URL: `https://example.com/test`
3. Check GCS bucket to see uploaded file
4. Wait 5-10 minutes for Discovery Engine to index
5. Try querying about that content

**Test Prompt Customization:**
1. Go to admin portal → Prompt Configuration
2. Modify the template
3. Test with preview
4. Save changes
5. Run a query to see new format

### Useful Development Commands

**Check Backend Logs:**
```bash
# If running locally:
# Logs appear in terminal

# If deployed to Cloud Run:
gcloud run services logs read auditor-rag-api --project=rag-for-guidelines
```

**View GCS Files:**
```bash
gsutil ls gs://rag-guidelines-v2/scraped/
gsutil cat gs://rag-guidelines-v2/config/managed_urls.json
```

**Test Discovery Engine Search:**
```python
# In Python console:
from google.cloud import discoveryengine_v1 as discoveryengine

client = discoveryengine.SearchServiceClient()
request = discoveryengine.SearchRequest(
    serving_config="projects/rag-for-guidelines/locations/global/dataStores/guidelines-data-store_1763919919982/servingConfigs/default_search",
    query="wine bottle background"
)
response = client.search(request=request)
for result in response.results:
    print(result.document.derived_struct_data)
```

### Common Issues

**Issue:** `ModuleNotFoundError: No module named 'google'`
**Fix:** Activate venv and install requirements

**Issue:** `PermissionDenied: 403 Forbidden`
**Fix:** Run `gcloud auth application-default login`

**Issue:** Frontend can't connect to backend
**Fix:** Check CORS settings in `main.py` and update `api-client.js` baseURL

**Issue:** Discovery Engine returns no results
**Fix:** Wait 10 minutes after indexing, check GCS bucket has files

---

## 📚 Useful Resources

### Documentation

**Google Cloud:**
- [Discovery Engine Docs](https://cloud.google.com/generative-ai-app-builder/docs/introduction)
- [Vertex AI Gemini](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini)
- [Cloud Storage](https://cloud.google.com/storage/docs)

**Frontend:**
- [Material Design 3](https://m3.material.io/)
- [Text Fragments API](https://web.dev/text-fragments/)
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

**Python:**
- [FastAPI Tutorial](https://fastapi.tiangolo.com/tutorial/)
- [Trafilatura Docs](https://trafilatura.readthedocs.io/)

### Learning Path

**Week 1: Understand the System**
- [ ] Read this entire document
- [ ] Run the app locally
- [ ] Try all features (query, admin, PDF viewer)
- [ ] Review each JavaScript module briefly
- [ ] Trace one query end-to-end with debugger

**Week 2: Test Text Fragments**
- [ ] Read `text-fragment-utils.js` thoroughly
- [ ] Create test suite with 20 URLs
- [ ] Document success rate
- [ ] Identify patterns in failures
- [ ] Propose improvements

**Week 3: Implement Fixes**
- [ ] Improve fragment extraction algorithm
- [ ] Add better sanitization
- [ ] Handle edge cases
- [ ] Test on multiple browsers
- [ ] Document changes

### Getting Help

**Code Questions:**
- Check inline comments (code is well-documented)
- Use browser DevTools (console, network, debugger)
- Review existing patterns in codebase

**GCP Questions:**
- Check Cloud Console for errors
- Use `gcloud` CLI for debugging
- Review GCS bucket contents

**Stuck?**
- Write down what you've tried
- Check logs (browser console + backend terminal)
- Create a minimal test case
- Document expected vs actual behavior

---

## 🎉 Final Thoughts

This project showcases several modern patterns:

1. **RAG Architecture** - Combining retrieval with generation for accurate, cited responses
2. **Streaming UX** - Making LLM responses feel instant
3. **Modular Frontend** - Component-based design without framework overhead  
4. **Cloud-Native** - Serverless, scalable, cost-effective
5. **Admin-Friendly** - Non-technical users can manage content

**Your Mission:**
Help us make text fragment citations rock-solid so auditors can click a source and land exactly on the relevant text. This tiny feature has huge UX impact!

**Remember:**
- It's okay to not understand everything immediately
- The best way to learn is to trace code execution
- When stuck, simplify: test one function in isolation
- Documentation is code - keep this updated as you learn!

Welcome to the team! 🚀

---

**Last Updated:** December 9, 2025  
**Current Version:** 2.1-optimized  
**Next Review:** When text fragments are fixed
