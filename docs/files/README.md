# 📚 Welcome to the Guideline Assistant Project!

This folder contains everything you need to get up to speed quickly.

---

## 🎯 Quick Start (5 minutes)

**New here?** Read these in order:

1. **Start Here →** [FIRST_DAY_GUIDE.md](FIRST_DAY_GUIDE.md)
   - Your step-by-step checklist for Day 1
   - Visual walkthrough of the UI
   - Hands-on experiments to try
   - **Time:** 30 min read + 3 hours hands-on

2. **Deep Dive →** [ONBOARDING.md](ONBOARDING.md)
   - Comprehensive technical documentation
   - Architecture explained in detail
   - Every component broken down
   - **Time:** 2-3 hours, best read in chunks

3. **Daily Reference →** [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
   - Cheat sheet for development
   - Debug scenarios
   - Useful code snippets
   - **Time:** 10 min read, bookmark for daily use

---

## 📖 Document Overview

### FIRST_DAY_GUIDE.md
**"Where do I start?"**

This is your Day 1 playbook:
- ✅ Setup checklist
- 🖼️ Visual diagrams
- 🔍 Code tour with line numbers
- 🧪 Experiments to try
- 📝 Note-taking template

**Best for:** Absolute beginners, first-time setup

---

### ONBOARDING.md
**"How does this all work?"**

The complete technical reference:
- 🎯 Project goals and context
- 🏗️ Architecture deep dive
- 🔧 Backend components explained
- 🎨 Frontend modules explained
- ✨ Key features walkthrough
- 🔄 Data flow diagrams
- 🚧 Current issues (your work!)
- 🛠️ Setup instructions

**Best for:** Understanding the system, technical questions

---

### QUICK_REFERENCE.md
**"I need this info NOW!"**

Your daily companion:
- 📁 Where to find specific code
- 🐛 Common debug scenarios
- 🧪 Testing checklist
- 🔧 Useful code snippets
- 💡 Pro tips
- ✅ Code review checklist

**Best for:** Daily development, quick lookups

---

## 🗺️ Recommended Learning Path

### Week 1: Understanding

**Day 1:**
- [ ] Read FIRST_DAY_GUIDE.md (30 min)
- [ ] Setup environment (2 hours)
- [ ] Run the app and explore (1 hour)
- [ ] Read ONBOARDING.md sections 1-5 (1 hour)
- [ ] Trace one query with debugger (1 hour)

**Day 2:**
- [ ] Read ONBOARDING.md sections 6-8 (1 hour)
- [ ] Deep dive into text-fragment-utils.js (2 hours)
- [ ] Create 5 test cases manually (2 hours)
- [ ] Document findings (1 hour)

**Day 3:**
- [ ] Build comprehensive test suite (3 hours)
- [ ] Test across different browsers (2 hours)
- [ ] Identify failure patterns (1 hour)

**Day 4:**
- [ ] Read algorithm in detail (1 hour)
- [ ] Propose improvements (2 hours)
- [ ] Start implementing fixes (3 hours)

**Day 5:**
- [ ] Complete implementation (3 hours)
- [ ] Test thoroughly (2 hours)
- [ ] Document changes (1 hour)

---

## 🎓 Learning Styles

**Visual Learner?**
→ Focus on diagrams in FIRST_DAY_GUIDE.md
→ Use browser DevTools extensively
→ Draw your own flow diagrams

**Hands-On Learner?**
→ Start with experiments in FIRST_DAY_GUIDE.md
→ Modify code and see what breaks
→ Build test cases early

**Reading Learner?**
→ Read ONBOARDING.md cover-to-cover
→ Take detailed notes
→ Review inline code comments

**Question-Driven Learner?**
→ Skim all docs to generate questions
→ Find answers through experiments
→ Ask for clarification when stuck

---

## 🎯 Your Mission

### The Problem
When users click source citations, we want to highlight the exact relevant text on the page using the Text Fragments API.

### Current State
- Basic implementation exists in `frontend/js/text-fragment-utils.js`
- Extracts keywords and builds fragment URLs
- **But:** Success rate is uncertain, needs validation

### Your Goal
1. **Test** current implementation across 20+ real URLs
2. **Document** what works and what doesn't  
3. **Improve** the algorithm for higher success rate
4. **Validate** fixes across multiple browsers

### Success Metrics
- 80%+ success rate on test cases
- Works in Chrome, Edge, Safari 16.1+
- Handles edge cases gracefully
- Clear documentation of approach

---

## 🆘 Getting Help

### Self-Service (Try First)
1. Search the docs (Cmd+F is your friend)
2. Check QUICK_REFERENCE.md debug scenarios
3. Look at inline code comments
4. Test in browser DevTools console

### When to Ask for Help
- After 30 minutes stuck on same issue
- Need clarification on requirements
- Found a bug in the docs
- Need access to resources

### How to Ask Good Questions
1. What did you try?
2. What did you expect?
3. What actually happened?
4. Include error messages/logs
5. Share relevant code snippet

---

## 📂 Project Structure Reminder

```
rag-for-guidelines/
├── 📄 README.md              ← Project overview
├── 📄 TODO.md                ← Known issues (YOUR TASK!)
│
├── 📁 backend/               ← Python/FastAPI server
│   ├── main.py              ← API endpoints
│   ├── scraper.py           ← Web scraping
│   ├── admin.py             ← Config management
│   └── requirements.txt     ← Dependencies
│
├── 📁 frontend/              ← Vanilla JS application
│   ├── index.html           ← Main UI
│   ├── admin.html           ← Admin portal
│   ├── css/                 ← Material Design 3 styles
│   └── js/                  ← Modular components
│       ├── app.js           ← Main orchestrator
│       ├── api-client.js    ← Backend communication
│       ├── conversation.js  ← Chat history
│       ├── text-fragment-utils.js  ← YOUR FOCUS! 🎯
│       └── ...              ← Other modules
│
└── 📁 docs/                  ← You are here! 📍
    ├── README.md            ← This file
    ├── ONBOARDING.md        ← Complete technical guide
    ├── QUICK_REFERENCE.md   ← Daily cheat sheet
    └── FIRST_DAY_GUIDE.md   ← Step-by-step Day 1
```

---

## 🔗 Important Links

### Documentation
- [Main README](../README.md) - Project overview
- [TODO.md](../TODO.md) - Known issues and tasks

### Code Locations
- Text Fragments: `frontend/js/text-fragment-utils.js`
- Source Links: `frontend/js/sidebar.js` + `response-renderer.js`
- Admin Portal: `frontend/js/admin-app.js` + `admin-prompt.js`

### Resources
- [Text Fragments Spec](https://wicg.github.io/scroll-to-text-fragment/)
- [Google Cloud Discovery Engine](https://cloud.google.com/generative-ai-app-builder/docs)
- [Gemini API Docs](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini)

---

## 📊 Progress Tracking

Use this to track your learning:

**Week 1 - Understanding**
- [ ] Environment setup complete
- [ ] App running locally
- [ ] First query traced end-to-end
- [ ] Text fragment code understood
- [ ] Test suite created

**Week 2 - Testing**
- [ ] 20+ test cases documented
- [ ] Current behavior documented
- [ ] Failure patterns identified
- [ ] Algorithm improvements proposed

**Week 3 - Implementation**
- [ ] Fixes implemented
- [ ] Tests passing (80%+ success)
- [ ] Cross-browser validation
- [ ] Documentation updated
- [ ] Demo prepared

---

## 💡 Tips for Success

1. **Take breaks** - Fresh eyes catch more bugs
2. **Write tests first** - Understand before fixing
3. **Document as you go** - Future you will thank you
4. **Ask questions early** - Don't stay stuck
5. **Celebrate small wins** - Each test passing matters!

---

## 🎉 Welcome Aboard!

You're joining at an exciting time. The foundation is solid, and now we're polishing the details to make this tool truly shine.

Your fresh perspective on text fragment highlighting will be invaluable. Don't hesitate to question existing approaches - sometimes the best solutions come from asking "why not try this instead?"

**Remember:** Everyone was new once. The fact that you're reading this documentation shows you're taking the right approach to learning the system.

Good luck, and enjoy the journey! 🚀

---

**Quick Commands for Day 1:**

```bash
# Start backend (in backend/)
source .venv/bin/activate && uvicorn main:app --reload

# Start frontend (in frontend/)
python -m http.server 3000

# Open app
http://localhost:3000

# Open DevTools
F12 or Cmd+Option+I
```

Now go read **FIRST_DAY_GUIDE.md** and let's get started! 📖
