# TODO & Known Issues

## High Priority

### Text Fragments Require Serious Overlook
**Status**: ⚠️ Needs Investigation  
**Related Commit**: efdc76f (2025-12-08)

The text fragment URL generation for citations needs significant improvement. Current implementation may not reliably highlight citations on all external pages.

**Issues**:
- Fragment generation logic may not produce optimal text selections
- Sanitization might be removing too much or not handling edge cases
- Query-aware extraction needs validation across different document types
- Success rate on external pages is uncertain

**Potential Work**:
- Test fragment generation across various source types (PDFs, web pages, etc.)
- Improve fragment length optimization (currently targeting 3-10 words)
- Better handling of special characters and markdown artifacts
- Consider fallback strategies when fragments don't match
- Add logging/analytics to track fragment success rates

**Files Involved**:
- `frontend/js/text-fragment-utils.js`
- `frontend/js/response-renderer.js`
- `frontend/js/conversation.js`
- `frontend/js/sidebar.js`

---

## Future Enhancements

_Add future tasks here as they come up_
