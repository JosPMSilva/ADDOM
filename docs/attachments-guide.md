# Attachments Guide

## Who This Is For
- Users sending images and files in chat prompts.
- Users working with optional local fallback extraction for unsupported file models.

## Prerequisites
- Active thread in chat.
- Provider/model selected.

## What This Feature Does
Attachments let you include image or file inputs in prompts, with independent capability gates and optional local text extraction fallback.

## Step-by-Step Tasks

### 1. Add Attachments
1. In chat composer, click attach button or paste/drop files.
2. Review pending attachment chips before sending.
3. Send prompt.

### 2. Understand Capability Gates
- Image support and file support are evaluated independently.
- If images are blocked but files are allowed, attach remains available for files.
- Unsupported pending items are blocked at send-time with clear notices.

### 3. Understand Local Fallback Extraction

Local text extraction exists as an advanced runtime capability, but the current
Settings interface does not expose a control for enabling it. When the profile has
the capability enabled and its runtime is ready, supported files can be converted to
bounded text for models without native file input.

### 4. Runtime Dependency (MarkItDown)
- Windows:
  - `py -m pip install --user markitdown`
- macOS/Linux:
  - `python3 -m pip install --user markitdown`
- Verify:
  - `python -c "import markitdown; print('ok')"`

### 5. Supported Fallback File Types
- `.pdf`
- `.docx`
- `.pptx`
- `.xlsx`
- `.txt`
- `.md`
- `.csv`
- `.json`
- `.html`
- `.xml`

## Fallback Limits
- Mode: fallback only.
- Max chars per attachment: 12,000 (default).
- Max chars per turn: 60,000 (default).
- Max attachments per turn: 4 (default).
- Timeout: 20,000 ms (default).

## Common Pitfalls
### What Can Go Wrong
- Runtime not ready.
  - Fix: install MarkItDown and re-check runtime.
- Unsupported file type.
  - Fix: use supported formats or native-capable model.
- Provider/model changed after attaching.
  - Fix: remove blocked attachments or switch model.
- Assuming image fallback conversion is enabled.
  - Fix: v1 extraction fallback is file-focused; images are not converted through this path.

## Related Settings
- `attachmentTextExtraction.enabled`
- `attachmentTextExtraction.mode`
- `attachmentTextExtraction.maxCharsPerAttachment`
- `attachmentTextExtraction.maxCharsPerTurn`
- `attachmentTextExtraction.maxAttachmentsPerTurn`
- `attachmentTextExtraction.timeoutMs`

## Related References
- [Chat Guide](./chat-guide.md)
- [Settings Catalog](./reference/settings-catalog.md)
- [window.addom API](./reference/window-addom-api.md)
