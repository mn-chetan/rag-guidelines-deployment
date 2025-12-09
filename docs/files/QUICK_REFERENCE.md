# 🚀 Quick Reference Guide

A cheat sheet for daily development on the Guideline Assistant project.

---

## 📁 File Quick Finder

**Need to work on...?**

| Task | File(s) |
|------|---------|
| **Text fragment highlighting** | `frontend/js/text-fragment-utils.js` |
| **Query response format** | `backend/main.py` → `build_prompt()` |
| **How responses are displayed** | `frontend/js/response-renderer.js` |
| **Source citation links** | `frontend/js/sidebar.js`, `response-renderer.js` |
| **URL scraping logic** | `backend/scraper.py` |
| **Admin portal URL management** | `frontend/js/admin-app.js` |
| **Prompt customization UI** | `frontend/js/admin-prompt.js` |
| **Loading states** | `frontend/js/loading.js` |
| **PDF viewer** | `frontend/js/pdf-viewer.js` |
| **Streaming implementation** | `backend/main.py` → `query-stream`, `frontend/js/api-client.js` |

---

## 🔍 Common Debug Scenarios

### "The response isn't streaming"

**Check:**
1. Browser console - any errors?
2. Network tab - is `/query-stream` endpoint called?
3. Backend logs - is Gemini returning chunks?

**Test:**
```javascript
// In browser console:
fetch('http://localhost:8080/query-stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'test' })
}).then(async (response) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log(decoder.decode(value));
  }
});
```

### "Source citations aren't highlighting text"

**Check:**
1. Does URL include `#:~:text=...`?
2. Open browser console and check `text-fragment-utils.js` output
3. Try the URL manually in Chrome (best support)
4. Check if page content matches fragment text

**Debug:**
```javascript
// In browser console (on index.html):
const snippet = "Alcohol products must not be prominently featured";
const query = "wine bottle background";
const fragment = extractTextFragment(snippet, { query });
console.log('Fragment:', fragment);
console.log('URL:', buildTextFragmentUrl('https://example.com', fragment));
```

### "New URLs aren't searchable"

**Check:**
1. Was URL successfully scraped? Check backend logs
2. Was file uploaded to GCS? Check `gs://rag-guidelines-v2/scraped/`
3. Was Discovery Engine import triggered? Check admin portal
4. Wait 10 minutes (Discovery Engine indexing delay)

**Verify GCS:**
```bash
# List recently added files:
gsutil ls -l gs://rag-guidelines-v2/scraped/ | tail -5

# Check file content:
gsutil cat gs://rag-guidelines-v2/scraped/example.com_abc123.html
```

**Verify Discovery Engine:**
```bash
# Check import status (if you have operation name):
# You'll see this in backend logs or admin portal
```

### "Prompt changes aren't taking effect"

**Check:**
1. Did you save in admin portal? (look for success message)
2. Check GCS: `gs://rag-guidelines-v2/config/prompt_config.json`
3. Try a new query (old ones use cached prompt)
4. Backend logs - is prompt being loaded?

**Verify:**
```bash
# Check saved prompt:
gsutil cat gs://rag-guidelines-v2/config/prompt_config.json | jq '.active_prompt.template'
```

---

## 🧪 Testing Checklist

### Before Submitting Text Fragment Fixes

- [ ] Test on Chrome 120+ ✅
- [ ] Test on Edge 120+ ✅
- [ ] Test on Safari 16.1+ ✅
- [ ] Test with short snippets (< 20 words) ✅
- [ ] Test with long snippets (> 100 words) ✅
- [ ] Test with special characters (quotes, apostrophes, brackets) ✅
- [ ] Test with markdown formatting (`**bold**`, `*italic*`) ✅
- [ ] Test with numbers and dates ✅
- [ ] Test with URLs in snippet text ✅
- [ ] Test with non-English characters (if applicable) ✅
- [ ] Verify fragment actually highlights on target page ✅
- [ ] Verify fragment scrolls to correct location ✅
- [ ] Test fallback behavior when fragments don't work ✅
- [ ] Document success rate (aim for >80%) ✅

### Before Deploying

- [ ] Test full query flow locally ✅
- [ ] Test admin portal functions ✅
- [ ] Check for console errors ✅
- [ ] Test on mobile (responsive design) ✅
- [ ] Verify environment variables set ✅
- [ ] Check GCS bucket permissions ✅
- [ ] Test with production API endpoint ✅

---

## 📊 Key Metrics to Track

When testing text fragment improvements:

```javascript
// Create a tracking spreadsheet with:
{
  testCase: "Alcohol background policy",
  url: "https://...",
  query: "wine bottle background",
  snippet: "...",
  generatedFragment: "incidental background items",
  fragmentLength: 3, // words
  highlightWorked: true,
  scrolledToText: true,
  browser: "Chrome 120",
  notes: "Worked perfectly"
}
```

**Target Success Rate:** 80%+ across all test cases

---

## 🎯 Development Workflow

### Daily Routine

**Morning:**
1. Pull latest changes (if working on a team)
2. Check TODO.md for priorities
3. Start backend: `cd backend && source .venv/bin/activate && uvicorn main:app --reload`
4. Start frontend: `cd frontend && python -m http.server 3000`

**During Development:**
1. Make changes
2. Test in browser (auto-reload on save)
3. Check browser console for errors
4. Use browser debugger to step through code
5. Check backend terminal for API logs

**Before Committing:**
1. Test all affected features
2. Check for console errors
3. Update comments if logic changed
4. Update this doc if workflow changed

---

## 🔧 Useful Code Snippets

### Test Text Fragment Extraction

```javascript
// Run in browser console on index.html:

const testSnippet = `
**Weapons Policy**: Toy weapons including toy guns, water guns, and foam swords 
are considered weapons for moderation purposes. However, historical artifacts 
displayed in museums may be acceptable with proper context.
`;

const testQuery = "toy guns museum";

console.log("Testing fragment extraction...");
const fragment = extractTextFragment(testSnippet, { 
  query: testQuery, 
  maxWords: 10 
});

console.log("Input snippet:", testSnippet);
console.log("Query:", testQuery);
console.log("Generated fragment:", fragment);
console.log("Fragment length:", fragment.split(' ').length, "words");

// Test URL generation:
const testUrl = "https://guidelines.com/weapons";
const fullUrl = buildTextFragmentUrl(testUrl, fragment);
console.log("Full URL:", fullUrl);
console.log("\nTry opening this URL to test highlighting:");
console.log(fullUrl);
```

### Manually Trigger a Query

```javascript
// Run in browser console:

if (window.app && window.app.apiClient) {
  window.app.apiClient.queryAPIStream(
    { query: "Should I flag a wine bottle?" },
    (chunk) => console.log("Chunk:", chunk),
    (response) => console.log("Complete:", response)
  );
} else {
  console.error("App not initialized");
}
```

### Check What's in LocalStorage

```javascript
// Run in browser console:

// View all sessions:
const sessions = JSON.parse(localStorage.getItem('auditor-assistant-sessions') || '[]');
console.log('Stored sessions:', sessions);
console.log('Count:', sessions.length);

// View current session:
const currentId = localStorage.getItem('auditor-assistant-current-session');
console.log('Current session ID:', currentId);

// Clear all sessions (careful!):
// localStorage.clear();
```

### Inspect Discovery Engine Response

```python
# Add this to main.py retrieve_snippets() for debugging:

for result in response.results:
    doc_dict = MessageToDict(result.document._pb)
    print("="*50)
    print("Title:", doc_dict.get("derivedStructData", {}).get("title"))
    print("Link:", doc_dict.get("derivedStructData", {}).get("link"))
    print("Snippets:", doc_dict.get("derivedStructData", {}).get("snippets"))
    print("="*50)
```

---

## 🎨 CSS Class Reference

**For styling new components:**

```css
/* Material Design 3 tokens you can use: */
var(--md-sys-color-primary)           /* #0B57D0 - Google Blue */
var(--md-sys-color-on-primary)        /* White */
var(--md-sys-color-surface)           /* Light background */
var(--md-sys-color-on-surface)        /* Dark text */
var(--md-sys-color-error)             /* Red */
var(--md-sys-color-success)           /* Green */

/* Spacing (8dp grid): */
var(--md-sys-spacing-8)               /* 8px */
var(--md-sys-spacing-16)              /* 16px */
var(--md-sys-spacing-24)              /* 24px */

/* Corner radius: */
var(--md-sys-shape-corner-small)      /* 8px */
var(--md-sys-shape-corner-medium)     /* 12px */
var(--md-sys-shape-corner-large)      /* 16px */

/* Elevation (shadows): */
var(--md-sys-elevation-1)             /* Subtle shadow */
var(--md-sys-elevation-2)             /* Medium shadow */
var(--md-sys-elevation-3)             /* Strong shadow */

/* Typography: */
var(--font-body-large)                /* 16px */
var(--font-body-small)                /* 12px */
var(--font-title-medium)              /* 16px / 500 weight */
```

---

## 🐛 Known Quirks

### Frontend

1. **PDF viewer uses iframe** - Some PDFs block embedding. Fallback opens new tab.

2. **LocalStorage has 5MB limit** - Old sessions auto-deleted after 50 conversations.

3. **Text fragments don't work in Firefox** - By design. We show tooltip instead.

4. **Streaming can fail on slow connections** - Falls back to non-streaming endpoint.

### Backend

1. **Discovery Engine has 10min indexing delay** - Can't be fixed, it's GCP's processing time.

2. **Trafilatura sometimes fails** - BeautifulSoup fallback handles this.

3. **Gemini streaming occasionally stalls** - Timeout set to 30s, then retry.

4. **GCS operations are eventually consistent** - File might not appear immediately after upload.

---

## 💡 Pro Tips

1. **Use browser DevTools extensively**
   - Network tab to see API calls
   - Console for quick testing
   - Debugger to step through code
   - Application tab to view LocalStorage

2. **Keep backend terminal visible**
   - See real-time API logs
   - Catch Python errors immediately
   - Monitor request timing

3. **Test in multiple browsers**
   - Chrome for best Text Fragments support
   - Safari to catch CSS issues
   - Mobile view for responsive design

4. **Use VSCode shortcuts**
   - `Cmd+P` / `Ctrl+P` - Quick file open
   - `Cmd+Shift+F` / `Ctrl+Shift+F` - Search across files
   - `F12` - Go to definition
   - `Cmd+/` / `Ctrl+/` - Toggle comment

5. **Document as you go**
   - Add comments to tricky code
   - Update README when you figure something out
   - Keep a "Today I Learned" log

---

## 📞 Emergency Contacts

**If production breaks:**
1. Check Cloud Run logs: `gcloud run services logs read auditor-rag-api`
2. Check GCS bucket health
3. Verify Discovery Engine data store exists
4. Check API quotas in Cloud Console

**If you're completely stuck:**
1. Write down exactly what you tried
2. Document expected vs actual behavior
3. Create minimal reproduction steps
4. Check if issue exists in main branch
5. Ask for help with this context

---

## ✅ Code Review Checklist

Before marking your PR as ready:

- [ ] Code follows existing patterns
- [ ] No console.log() left in production code
- [ ] Comments explain "why", not "what"
- [ ] Error handling is comprehensive  
- [ ] Mobile responsive (test in DevTools)
- [ ] Accessible (keyboard navigation works)
- [ ] No security issues (XSS, injection)
- [ ] Performance acceptable (no blocking)
- [ ] Documentation updated
- [ ] Tests pass (when we add them!)

---

**Keep this open while coding!** Bookmark it in your browser.

Last updated: December 9, 2025
