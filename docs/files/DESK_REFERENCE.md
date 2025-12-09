# 🖨️ DESK REFERENCE SHEET - Guideline Assistant
*Print this and keep it visible while coding*

---

## 🎯 THE 10-SECOND EXPLANATION
RAG app that helps content auditors instantly find guideline answers instead of searching 50-page PDFs.

---

## 🗺️ ARCHITECTURE MAP

```
USER → FRONTEND (Vanilla JS) → FASTAPI BACKEND → DISCOVERY ENGINE
                   ↓                    ↓              (RAG Search)
              LocalStorage         GCS Config            ↓
                                       ↓            Returns Context
                                   URL Scraping         ↓
                                       ↓           GEMINI 2.5 FLASH
                                   GCS Bucket      (Generates Answer)
```

---

## 📁 KEY FILES TO KNOW

```
backend/
  main.py               → API endpoints, query logic
  scraper.py            → Web content extraction
  admin.py              → Configuration management

frontend/js/
  app.js                → Main orchestrator
  api-client.js         → Backend communication
  conversation.js       → Chat history
  response-renderer.js  → Markdown → HTML
  text-fragment-utils.js → YOUR TASK! 🎯
  sidebar.js            → Source links
```

---

## 🔍 YOUR MAIN TASK

**File:** `frontend/js/text-fragment-utils.js`

**Goal:** Make citation links highlight exact text on pages

**Current State:** Basic implementation, untested at scale

**Your Work:**
1. Test on 20+ real URLs
2. Document success/failure
3. Improve algorithm
4. Validate across browsers

**Target:** 80%+ success rate

---

## 🚀 DAILY WORKFLOW

**Start Day:**
```bash
# Terminal 1 - Backend
cd backend
source .venv/bin/activate
uvicorn main:app --reload

# Terminal 2 - Frontend  
cd frontend
python -m http.server 3000
```

**Open:** http://localhost:3000

**DevTools:** F12 (always have this open!)

---

## 🐛 DEBUG CHECKLIST

**Query not working?**
- [ ] Check browser console (F12)
- [ ] Check Network tab for errors
- [ ] Check backend terminal for errors
- [ ] Verify API endpoint in api-client.js

**Text fragments not highlighting?**
- [ ] Does URL include `#:~:text=...`?
- [ ] Try URL manually in Chrome
- [ ] Check `text-fragment-utils.js` console logs
- [ ] Verify browser supports it (Chrome, Edge, Safari 16.1+)

**New URL not searchable?**
- [ ] Check GCS: `gsutil ls gs://rag-guidelines-v2/scraped/`
- [ ] Wait 10 minutes (Discovery Engine lag)
- [ ] Check admin portal import status

---

## 📊 TEST FRAGMENT EXTRACTION

**In Browser Console:**
```javascript
const snippet = "Your snippet here...";
const query = "your query here";
const fragment = extractTextFragment(snippet, { query });
console.log(fragment);
console.log(buildTextFragmentUrl('https://test.com', fragment));
```

---

## 🎨 MATERIAL DESIGN TOKENS

```css
/* Colors */
--md-sys-color-primary: #0B57D0
--md-sys-color-error: #BA1A1A
--md-sys-color-success: #146C2E

/* Spacing */
--md-sys-spacing-8: 8px
--md-sys-spacing-16: 16px
--md-sys-spacing-24: 24px

/* Corners */
--md-sys-shape-corner-small: 8px
--md-sys-shape-corner-medium: 12px
--md-sys-shape-corner-large: 16px
```

---

## 🧪 TESTING REMINDER

Before committing:
- [ ] Test in Chrome
- [ ] Test in Safari/Edge
- [ ] Check mobile view
- [ ] No console errors
- [ ] Admin portal still works

---

## 💡 QUICK TIPS

**Stuck?**
1. Check docs first (QUICK_REFERENCE.md)
2. Try in DevTools console
3. Simplify to minimal test case
4. Ask after 30 min stuck

**Learning?**
- Trace code with debugger
- Break things intentionally
- Document what you discover
- Read inline comments

**Performance?**
- Check Network tab timing
- Look for blocking operations
- Monitor memory in DevTools

---

## 🔗 ESSENTIAL SHORTCUTS

**VS Code:**
- Cmd+P → Quick file open
- Cmd+Shift+F → Search project
- F12 → Go to definition

**Browser:**
- Cmd+Option+I → DevTools
- Cmd+Shift+C → Inspect element
- Cmd+R → Reload (Cmd+Shift+R for hard)

**DevTools:**
- Cmd+F → Search current file
- Cmd+\ → Toggle breakpoint
- F8 → Resume execution
- F10 → Step over
- F11 → Step into

---

## 📞 USEFUL COMMANDS

```bash
# Check GCS files
gsutil ls gs://rag-guidelines-v2/scraped/

# View config
gsutil cat gs://rag-guidelines-v2/config/managed_urls.json

# Cloud Run logs (if deployed)
gcloud run services logs read auditor-rag-api

# Python packages
pip list  # See installed
pip show [package]  # Details

# Find in code
grep -r "function_name" .
```

---

## 🎯 SUCCESS METRICS

**Week 1:**
- [ ] App running locally
- [ ] Understand data flow
- [ ] 5 test cases created

**Week 2:**
- [ ] 20+ test cases
- [ ] Patterns documented
- [ ] Improvements proposed

**Week 3:**
- [ ] Fixes implemented
- [ ] 80%+ success rate
- [ ] Cross-browser tested
- [ ] Ready to demo

---

## 📚 KEY CONCEPTS

**RAG (Retrieval-Augmented Generation)**
Search → Retrieve context → Generate answer

**Text Fragments**
URL format: `https://page.com#:~:text=highlight%20this`

**Streaming**
Send response tokens as they're generated, not all at once

**SSE (Server-Sent Events)**
One-way server → client data stream

**Discovery Engine**
Google's enterprise search (vector + keyword hybrid)

---

## 🌐 BROWSER SUPPORT

**Text Fragments:**
- ✅ Chrome 80+
- ✅ Edge 80+
- ✅ Safari 16.1+
- ❌ Firefox (by design)

**App Overall:**
- ✅ Chrome/Edge/Safari/Firefox
- ✅ Mobile (responsive)

---

## 🚨 GOTCHAS

1. **Discovery Engine** has 10min indexing delay
2. **LocalStorage** has 5MB limit
3. **GCS writes** are eventually consistent
4. **Text fragments** don't work on all pages
5. **PDF viewer** uses iframe (some PDFs block it)
6. **Streaming** can fail on slow connections

---

## 📖 KEY FUNCTIONS TO KNOW

**Frontend:**
```javascript
extractTextFragment(snippet, {query})  // Your focus
buildTextFragmentUrl(url, fragment)
conversation.addEntry(entry)
apiClient.queryAPIStream(query, onChunk)
```

**Backend:**
```python
retrieve_snippets(query)  # RAG search
generate_with_gemini(query, sources)
scrape_url(url)  # Extract content
```

---

## 🎓 LEARNING RESOURCES

**Docs:**
- 📘 ONBOARDING.md → Complete guide
- 📙 QUICK_REFERENCE.md → Daily use
- 📗 FIRST_DAY_GUIDE.md → Day 1 steps

**External:**
- Text Fragments: web.dev/text-fragments
- FastAPI: fastapi.tiangolo.com
- Material Design: m3.material.io

---

## ✅ END OF DAY CHECKLIST

- [ ] Code committed (if changes)
- [ ] Tests still pass
- [ ] No console errors
- [ ] Notes updated
- [ ] Tomorrow's plan clear
- [ ] Blocked items documented

---

## 💬 ASKING FOR HELP

**Good:** "I'm debugging text fragments. I tried X and Y, but Z happens. Expected A. See error: [paste]. Relevant code: [link]"

**Not Good:** "It's broken, help!"

**Great:** "Found a potential bug in text-fragment-utils.js line 42. Fragment extraction fails when snippet contains smart quotes. Tested in Chrome. Proposed fix: sanitize quotes first. Thoughts?"

---

## 🌟 REMEMBER

- **Fresh eyes are valuable** - Question everything
- **Documentation is code** - Update as you learn
- **Tests prevent bugs** - Write them first
- **Breaks are productive** - Step away when stuck
- **Small wins matter** - Celebrate progress!

---

*Last Updated: December 9, 2025*
*Keep this visible - you'll reference it 10x/day!*
*Update as you discover new patterns*

---

**Right now:** Read FIRST_DAY_GUIDE.md → Get started! 🚀
