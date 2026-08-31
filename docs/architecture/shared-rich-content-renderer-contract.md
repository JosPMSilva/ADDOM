# Shared Rich Content Renderer Contract

Status: Active maintenance contract
Source plan: `renderer-unification-plan.md`
Last updated: 2026-03-26

## Decision Summary

ADDOM has one shared rich-content rendering foundation.

- `src/renderer/components/chat/AssistantRichContent.jsx` is the shared entrypoint for assistant-style rich content.
- `src/renderer/components/chat/chat-rich-content-renderer.jsx` owns shared segment rendering, shared markdown component mapping, and mode-level feature policy.
- `src/renderer/components/chat/MessageBubble.jsx` owns assistant bubble layout plus assistant-only card handlers.
- `src/renderer/components/chat/live-execution-stream-reasoning.jsx` and `src/renderer/components/chat/live-execution-stream-activity.jsx` own stream-only orchestration and row layout.
- `src/renderer/store/chat/reasoning-stream-segmentation.mjs` and `src/renderer/store/chat/use-chat-store-reasoning-actions.mjs` remain the source of truth for streamed reasoning safety.

Container behavior may stay specialized. Generic content rendering may not.

## Canonical Ownership

### `AssistantRichContent.jsx`

Owns the shared entrypoint contract:

- accepts raw text plus render mode
- parses text into shared render segments
- applies shared typography wrapper classes
- forwards segments into `renderChatRichContentSegments(...)`

### `chat-rich-content-renderer.jsx`

Owns the shared renderer internals:

- markdown component factory
- segment-to-UI mapping for prose, code, diff, file labels, tables, and raw fallback
- mode-level feature policy defaults
- assistant-only card gating
- execution-stream exclusions for assistant-only block UI

### `MessageBubble.jsx`

Owns assistant-only behavior:

- assistant bubble shell
- plan interaction shell
- role/dispatch/council/review card handlers
- assistant streaming parse/cache behavior

### `live-execution-stream-reasoning.jsx`

Owns stream-only behavior:

- reasoning grouping
- archive rows
- completed-state collapse
- pending-tail presentation
- live cursor behavior

It must not own:

- a stream-local markdown registry
- a stream-local generic code block renderer
- assistant-only cards
- a second generic segment renderer

## Current Public Contract

### `AssistantRichContent`

```tsx
<AssistantRichContent
  text={text}
  keyPrefix="stream:reasoning"
  mode="execution-stream"
  typographyRole="exec-reasoning"
  featurePolicy={optionalOverrides}
  markdownComponentConfig={optionalMarkdownOverrides}
  className="max-w-none select-text"
/>
```

Supported modes:

- `assistant-message`
- `execution-stream`
- `agent-task`
- `agent-result`

### `renderChatRichContentSegments`

```ts
renderChatRichContentSegments(segments, {
  keyPrefix,
  mode,
  featurePolicy,
  isStreaming,
  renderMarkdown,
  renderPlainProse,
  renderRoleConfirmationCard,
  renderDispatchConfirmationCard,
  renderCouncilResultCard,
  renderReviewReportCard,
  tryParseRoleJson,
  tryParseDispatchJson,
  tryParseCouncilJson,
  tryParseReviewJson,
  shouldHideRoleConfirmationCard,
  isRuntimeRoleDismissed,
})
```

This is the only shared segment renderer for assistant-like rich content.

## Mode-Level Feature Policy

The shared renderer enforces feature policy by mode. Do not bypass it in callers.

### `assistant-message`

- patch file groups: allowed
- delegation cards: allowed
- role cards: allowed
- dispatch cards: allowed
- council cards: allowed
- review cards: allowed

### `execution-stream`

- patch file group card UI: not allowed
- delegation cards: not allowed
- role cards: not allowed
- dispatch cards: not allowed
- council cards: not allowed
- review cards: not allowed

Execution stream still shares:

- prose markdown
- fenced code
- diff blocks
- file labels
- tables
- inline code

### `agent-task` and `agent-result`

- assistant-only interactive cards: not allowed
- patch file group card UI: not allowed unless there is a documented reason to re-enable it centrally

## Required Stream Semantics

Execution stream reasoning must never send unstable live markdown directly into final rich rendering.

Required flow:

1. Store actions append raw reasoning.
2. `reasoning-stream-segmentation.mjs` derives `stableDetail`, `pendingTail`, and `hasPendingTail`.
3. Stable content renders through `AssistantRichContent`.
4. Pending tail stays plain text until it becomes stable.

If a change breaks that rule, it is a renderer regression even if the UI looks correct in a static screenshot.

## Where New Rich-Content Features Must Land

If a new generic rich-content feature is needed, add it in this order:

1. Parse or normalize it in `src/renderer/components/chat/chat-render-segments.mjs` only if it is truly generic content.
2. Render it in `src/renderer/components/chat/chat-rich-content-renderer.jsx`.
3. Route it through `src/renderer/components/chat/AssistantRichContent.jsx`.
4. Add assistant-mode and execution-stream-mode coverage in:
   - `tests/integration/shared-rich-content-renderer-ssr.test.mjs`
   - `tests/integration/live-execution-stream-block-ssr.test.mjs` or `tests/integration/live-execution-stream-block.test.mjs`
5. Re-run the focused guard test:
   - `tests/integration/frontend-perf-and-dev-guards-contract.test.mjs`

If a feature is container-specific, keep it in the container file and document why it is not generic content rendering.

## Forbidden Duplication Patterns

Do not add any of the following:

- a stream-local markdown component registry
- a stream-local fenced code renderer for generic markdown code blocks
- a bubble-only generic prose renderer outside the shared renderer
- assistant-only cards enabled in execution-stream mode by direct imports or ad hoc parsing
- hidden props or feature flags that restore the removed legacy stream renderer
- temporary adapters that duplicate generic segment rendering instead of extending `chat-rich-content-renderer.jsx`

If a change seems to require one of these, the design is wrong or incomplete.

## Verification Checklist

Every renderer change should verify both parity and policy.

### Shared rendering parity

- assistant prose still renders correctly
- execution-stream prose uses the same markdown/code treatment
- code blocks match across assistant and execution stream
- inline code styling remains mode-consistent
- diff blocks still render through shared diff UI

### Policy enforcement

- execution stream does not render delegation cards
- execution stream does not render assistant role/dispatch/council/review cards
- execution stream does not render patch-group card UI
- assistant mode still renders allowed assistant-only cards

### Behavioral safety

- pending-tail reasoning still stays plain until stable
- completed reasoning collapse still works
- archived reasoning still works
- stream timeline still behaves like a timeline

## Guardrail Tests

These files exist specifically to stop renderer drift from returning:

- `tests/integration/shared-rich-content-renderer-ssr.test.mjs`
- `tests/integration/live-execution-stream-block-ssr.test.mjs`
- `tests/integration/live-execution-stream-block.test.mjs`
- `tests/integration/frontend-perf-and-dev-guards-contract.test.mjs`

If a renderer change needs one of these tests removed, replace the guard with a better one in the same change.

## Maintenance Note

The Phase 1 target-state notes and later-phase deletion reminders were removed from this document after the renderer unification landed.

The active source of truth is now:

- this contract for ownership and guardrails
- `renderer-unification-plan.md` for landed phase history
