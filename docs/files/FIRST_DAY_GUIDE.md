# 🎯 First Day Checklist & Visual Walkthrough

Your step-by-step guide to getting started on Day 1.

---

## ✅ Day 1 Checklist

### Morning (2-3 hours)

- [ ] **Read ONBOARDING.md** (sections 1-5)
  - Understand what the project does
  - Learn the architecture
  - Grasp the key components

- [ ] **Set up development environment**
  - Install Python 3.11+
  - Install Google Cloud SDK
  - Clone repository
  - Install dependencies

- [ ] **Get the app running locally**
  - Start backend server
  - Start frontend server  
  - Load http://localhost:3000
  - Submit your first query!

### Afternoon (2-3 hours)

- [ ] **Explore the running application**
  - Try different queries
  - Click on source citations
  - Check out the PDF viewer
  - Play with related questions
  - Visit admin portal

- [ ] **Read ONBOARDING.md** (sections 6-8)
  - Frontend component deep dive
  - Understand data flow
  - See how everything connects

- [ ] **Trace your first query**
  - Open browser DevTools
  - Set breakpoints in api-client.js
  - Submit a query
  - Watch the execution flow

### End of Day (1 hour)

- [ ] **Read TODO.md**
  - Understand the text fragment issue
  - Look at the affected code
  - Think about potential approaches

- [ ] **Set up for tomorrow**
  - Bookmark QUICK_REFERENCE.md
  - Create a notes file for learnings
  - Write down 3 questions to discuss

---

## 🖼️ Visual Application Walkthrough

### Main Interface

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐ ┌──────────────────────────────────┐  │
│  │   SIDEBAR       │ │      MAIN AREA                   │  │
│  │                 │ │                                   │  │
│  │ ┏━━━━━━━━━━━━━┓ │ │  ╔══════════════════════════╗   │  │
│  │ ┃ + New Chat  ┃ │ │  ║ Guideline Assistant      ║   │  │
│  │ ┗━━━━━━━━━━━━━┛ │ │  ║ Ask questions about...   ║   │  │
│  │                 │ │  ╚══════════════════════════╝   │  │
│  │ Recent:         │ │                                   │  │
│  │ • Wine bottle?  │ │  ┌─────────────────────────────┐ │  │
│  │ • Toy guns      │ │  │ USER: Should I flag...      │ │  │
│  │ • Logo rules    │ │  └─────────────────────────────┘ │  │
│  │                 │ │  ┌─────────────────────────────┐ │  │
│  │ Sources:        │ │  │ AI: **Verdict**: Don't Flag │ │  │
│  │ 📄 Guidelines   │ │  │ **Why**: Background items.. │ │  │
│  │ 🔗 Policy Doc   │ │  │                             │ │  │
│  │                 │ │  │ Related Questions:          │ │  │
│  │                 │ │  │ [What if focal point?]      │ │  │
│  │                 │ │  └─────────────────────────────┘ │  │
│  │ ⚙️ Admin        │ │                                   │  │
│  └─────────────────┘ │  ┌───────────────┬──────┐       │  │
│                       │  │ Ask question..│ Send │       │  │
│                       │  └───────────────┴──────┘       │  │
└─────────────────────────────────────────────────────────────┘
```

**Key Elements:**
1. **New Chat Button** - Clears conversation, starts fresh
2. **Recent Conversations** - Click to load previous chats
3. **Sources** - Click to open guidelines with highlighting
4. **Query/Response** - Conversation history
5. **Related Questions** - Clickable follow-ups
6. **Input Area** - Type questions here
7. **Admin Link** - Opens management portal

### Admin Portal

```
┌─────────────────────────────────────────────────────────────┐
│  Admin Portal                          [Back to Assistant]  │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐             │
│  │ Data Store │ │   Schedule │ │    Job     │             │
│  │ ● Ready    │ │ ✓ Enabled  │ │ ○ Idle     │             │
│  │ Last: 2h   │ │ Every 24h  │ │ No active  │             │
│  └────────────┘ └────────────┘ └────────────┘             │
│                                                             │
│  [🔄 Re-crawl All URLs]                                     │
│                                                             │
│  ══ Managed URLs ══════════════════════════════════════    │
│  ┌───────────────────────────────────────────────────┐     │
│  │ Name: [Image Guidelines      ]                    │     │
│  │ URL:  [https://example.com/..] [Add URL]          │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
│  • Image Guidelines                    [✓] [🔄] [🗑️]      │
│    https://guidelines.com/images                           │
│    Last indexed: 2 hours ago                               │
│                                                             │
│  • Alcohol Policy                      [✓] [🔄] [🗑️]      │
│    https://guidelines.com/alcohol                          │
│    Last indexed: 5 hours ago                               │
│                                                             │
│  ══ Prompt Configuration ═══════════════════════════════   │
│  ┌───────────────────────────────────────────────────┐     │
│  │ You are the Guideline Assistant...                │     │
│  │                                                    │     │
│  │ CONTEXT: {{context}}                              │     │
│  │ QUESTION: {{query}}                               │     │
│  │                                                    │     │
│  │ RESPOND IN THIS EXACT FORMAT:...                  │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
│  [💾 Save] [🔄 Reset] [📜 History]                          │
│                                                             │
│  Preview:                                                   │
│  Sample: [Should I flag a wine bottle?] [▶ Test]           │
└─────────────────────────────────────────────────────────────┘
```

**Key Features:**
1. **Status Cards** - See system health at a glance
2. **Re-crawl All** - Force re-index of all guidelines
3. **URL Management** - Add/remove/re-crawl individual URLs
4. **Prompt Editor** - Customize AI response format
5. **Preview** - Test prompt changes before saving

### PDF Viewer Split Pane

```
┌─────────────────────┬─────────────────────┐
│  Conversation       │   PDF Viewer        │
│                     │  ┌────────────────┐ │
│  User: "flag wine?" │  │ [Guidelines.pdf│ │
│                     │  │ ←     1/10    →│ │
│  AI: "Don't Flag"   │  └────────────────┘ │
│  • Background OK    │   ┌───────────────┐ │
│                     │   │ Guidelines    │ │
│  Sources:           │   │               │ │
│  📄 Alcohol Policy  │   │ Alcohol items │ │
│      ^^^^^^^^^^^^^  │   │ must not be   │ │
│  (Click opens PDF→) │   │ prominently   │ │
│                     │   │ featured.     │ │
│                     │   │               │ │
│                     │   │ However,      │ │
│                     │   │ ▼▼▼▼▼▼▼▼▼▼▼▼ │ │
│                     │   │ incidental    │ │ ← Highlighted!
│                     │   │ background    │ │
│                     │   │ items are     │ │
│                     │   │ acceptable    │ │
│                     │   │ ▲▲▲▲▲▲▲▲▲▲▲▲ │ │
│                     │   │               │ │
│                     │   └───────────────┘ │
│                     │  [Close X]          │
└─────────────────────┴─────────────────────┘
```

**Flow:**
1. User gets response with source citations
2. Clicks "📄 Alcohol Policy" link
3. PDF opens in right pane (main view stays visible)
4. Can continue conversation while reading PDF

---

## 🔍 Code Tour: Follow a Query End-to-End

Let's trace what happens when you type "Should I flag a wine bottle?"

### 1️⃣ Input (query-input.js)

```javascript
// User types in the textarea
<textarea id="query-input" class="query-input">
  Should I flag a wine bottle?
</textarea>

// On Enter key or Submit button click:
handleSubmit(event) {
  const query = this.getValue();  // "Should I flag a wine bottle?"
  this.onSubmit(query);           // Calls app.js handler
}
```

**File Location:** `frontend/js/query-input.js` line 49

---

### 2️⃣ Orchestration (app.js)

```javascript
async function handleQuerySubmit(query) {
  // Show loading spinner
  const opId = app.loading.showQueryLoading();
  
  // Add entry to conversation (initially empty)
  const entryId = app.conversation.addEntry({
    query: query,
    answer: "",
    sources: [],
    streaming: true  // Will update as chunks arrive
  });
  
  // Send to backend with streaming
  await app.apiClient.queryAPIStream(
    { query: query },
    onChunk,    // Updates answer as tokens arrive
    onComplete  // Finalizes with sources
  );
}
```

**File Location:** `frontend/js/app.js` line 101

---

### 3️⃣ API Call (api-client.js)

```javascript
async queryAPIStream(queryData, onChunk, onComplete) {
  // POST to backend
  const response = await fetch(`${this.baseURL}/query-stream`, {
    method: 'POST',
    body: JSON.stringify({ query: "Should I flag a wine bottle?" })
  });
  
  // Read Server-Sent Events (SSE) stream
  const reader = response.body.getReader();
  while (true) {
    const { value } = await reader.read();
    
    // Parse: data: {"text": "**Ver"}
    const data = JSON.parse(line.slice(6));
    
    if (data.text) {
      onChunk(data.text);  // Send to conversation
    }
    
    if (data.done) {
      onComplete(data.sources);
      break;
    }
  }
}
```

**File Location:** `frontend/js/api-client.js` line 32

---

### 4️⃣ Backend Retrieval (main.py)

```python
@app.post("/query-stream")
async def query_stream(request: QueryRequest):
    # Step 1: Search Discovery Engine for context
    sources = retrieve_snippets(request.query)
    # Returns: [
    #   {
    #     "title": "Alcohol Policy",
    #     "snippet": "Background items acceptable...",
    #     "link": "gs://bucket/alcohol.html"
    #   }
    # ]
    
    # Step 2: Build context from snippets
    context = ""
    for source in sources:
        context += f"Source: {source['snippet']}\n"
    
    # Step 3: Build prompt
    prompt = f"""
    You are the Guideline Assistant...
    
    CONTEXT: {context}
    QUESTION: {request.query}
    
    RESPOND WITH: Verdict, Why, etc...
    """
```

**File Location:** `backend/main.py` line 243

---

### 5️⃣ LLM Streaming (main.py)

```python
    # Step 4: Stream from Gemini
    async def generate():
        for chunk in gemini_model.generate_content(prompt, stream=True):
            if chunk.text:
                # Send each token back to frontend immediately
                yield f"data: {json.dumps({'text': chunk.text})}\n\n"
        
        # Send sources when done
        yield f"data: {json.dumps({'done': True, 'sources': sources})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

**File Location:** `backend/main.py` line 328

---

### 6️⃣ Display Update (conversation.js)

```javascript
updateEntry(entryId, updates) {
  const entry = this.entries.find(e => e.id === entryId);
  Object.assign(entry, updates);  // Update answer with new chunk
  
  // Re-render in DOM
  const responseContent = document.querySelector('.response-content');
  const renderer = new ResponseRenderer();
  const rendered = renderer.render({ 
    answer: entry.answer,  // Progressively longer
    sources: entry.sources 
  });
  responseContent.innerHTML = rendered;
}
```

**File Location:** `frontend/js/conversation.js` line 60

---

### 7️⃣ Markdown Rendering (response-renderer.js)

```javascript
render(response) {
  // Parse markdown: **Verdict**: Don't Flag
  const blocks = this.parseBlocks(response.answer);
  
  // Convert to HTML:
  // **text** → <strong>text</strong>
  // - list → <ul><li>list</li></ul>
  // Related Questions → <div class="related-questions">
  
  return htmlElement;
}
```

**File Location:** `frontend/js/response-renderer.js` line 21

---

### 8️⃣ Source Links (sidebar.js)

```javascript
updateSourceLinks(sources) {
  // For each source:
  const link = document.createElement('a');
  
  // Build text fragment URL (THE FOCUS OF YOUR WORK!)
  const fragment = extractTextFragment(source.snippet, { query });
  link.href = buildTextFragmentUrl(source.url, fragment);
  // Result: https://guidelines.com#:~:text=background%20items%20acceptable
  
  link.textContent = source.title;
  container.appendChild(link);
}
```

**File Location:** `frontend/js/sidebar.js` line 34

---

## 🧪 Your First Test: Break Something!

Learning by breaking things is powerful. Try this:

### Experiment 1: Change the Response Format

**Goal:** Make the AI respond differently

1. Go to `backend/main.py` line 430 (build_prompt function)
2. Change the prompt template:
   ```python
   # Original:
   **Verdict**: [Flag / Don't Flag / Needs Review]
   
   # Change to:
   🚦 DECISION: [✅ APPROVE / ❌ REJECT / 🤔 UNSURE]
   ```
3. Restart backend
4. Submit a query
5. See the new format!

**Why this works:** Gemini follows the prompt structure you give it.

---

### Experiment 2: See Raw Discovery Engine Results

**Goal:** Understand what context we're sending to Gemini

1. Go to `backend/main.py` line 189 (retrieve_snippets function)
2. Add after line 209:
   ```python
   for result in response.results:
       print("="*50)
       print("TITLE:", derived.get("title"))
       print("SNIPPET:", derived.get("snippets"))
       print("="*50)
   ```
3. Restart backend
4. Submit a query
5. Check backend terminal - you'll see exactly what Discovery Engine returned!

---

### Experiment 3: Test Fragment Extraction

**Goal:** See what text fragments are being generated

1. Open `http://localhost:3000` in browser
2. Open DevTools Console (F12)
3. Paste this:
   ```javascript
   const snippet = "Alcohol products must not be prominently featured. However, incidental background items are acceptable.";
   const query = "wine bottle background";
   const fragment = extractTextFragment(snippet, { query, maxWords: 6 });
   console.log("Generated fragment:", fragment);
   ```
4. Try different snippets and queries
5. See what gets extracted!

**This is your main task!** Get familiar with how this works.

---

## 📝 Note-Taking Template

Copy this to your notes file and fill it out as you learn:

```markdown
# My Learning Log - Guideline Assistant

## Day 1: [Date]

### What I Learned
- 
- 
- 

### Questions I Have
1. 
2. 
3. 

### Code I Explored
- File: 
  - What it does:
  - Key functions:
  - How it connects:

### Tomorrow's Goals
- [ ] 
- [ ] 
- [ ] 

---

## Useful Commands I Used

```bash
# Start backend
cd backend && source .venv/bin/activate && uvicorn main:app --reload

# Start frontend
cd frontend && python -m http.server 3000

# Check GCS files
gsutil ls gs://rag-guidelines-v2/scraped/
```

## Code Snippets I Found Helpful

```javascript
// Description of what this does
code here
```

## Breakthroughs 💡

- Discovery: [what you figured out]
- Why it matters: [impact]
- Next steps: [what to try next]
```

---

## 🎓 Learning Resources

### Video Tutorials (if you're a visual learner)

- **FastAPI Basics**: [FastAPI Tutorial](https://www.youtube.com/watch?v=7t2alSnE2-I)
- **JavaScript Modules**: [ES6 Modules Explained](https://www.youtube.com/watch?v=cRHQNNcYf6s)
- **Text Fragments**: [Chrome Developers: Text Fragments](https://www.youtube.com/watch?v=Y8kXWXRwjME)

### Interactive Docs

- **FastAPI Interactive Docs**: Go to `http://localhost:8080/docs` when backend is running
- **Discovery Engine Console**: [GCP Console](https://console.cloud.google.com/gen-app-builder/)
- **GCS Browser**: [Storage Browser](https://console.cloud.google.com/storage/browser)

### Playgrounds

- **Regex Testing**: [regex101.com](https://regex101.com) (for text fragment sanitization)
- **JSON Formatting**: [jsonformatter.org](https://jsonformatter.org) (for GCS config files)
- **Markdown Preview**: VS Code has built-in preview (Cmd+Shift+V)

---

## 🚀 End of Day 1 Goals

By end of today, you should be able to:

✅ Explain what the project does in 2 minutes
✅ Start the app locally and submit a query
✅ Navigate the codebase confidently
✅ Understand the query flow end-to-end
✅ Know where text fragment code lives
✅ Have a plan for Day 2

---

## 🎯 Week 1 Roadmap

**Day 1 (Today):** 
- Setup + Understanding

**Day 2:** 
- Deep dive into text-fragment-utils.js
- Create first test case
- Try manual tests in browser

**Day 3:**
- Build comprehensive test suite
- Document current behavior
- Identify patterns in failures

**Day 4:**
- Propose improvements
- Start implementing fixes
- Test changes

**Day 5:**
- Complete implementation
- Test across browsers
- Document findings
- Prepare demo

---

## 💬 Questions to Ask

If you get stuck, these are good questions to ask:

1. **"I don't understand X, can you explain it differently?"**
   - It's okay to ask for clarification!

2. **"I see the code does X, but why not Y?"**
   - Shows you're thinking critically

3. **"I tried debugging with Z approach, but got stuck here..."**
   - Shows you attempted to solve it first

4. **"Is this pattern common in the codebase?"**
   - Helps you learn conventions

5. **"What's the expected behavior in this edge case?"**
   - Important for comprehensive testing

---

## 🎉 You've Got This!

Remember:
- Everyone was new once
- Asking questions is smart, not weak
- Breaking things in dev is how we learn
- The codebase is well-documented - use it!
- Your fresh perspective is valuable

See you tomorrow! 🚀

---

**Next:** Read QUICK_REFERENCE.md and bookmark it for daily use.
