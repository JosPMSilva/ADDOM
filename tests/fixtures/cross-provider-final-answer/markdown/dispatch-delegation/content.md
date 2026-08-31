## Dispatch and Delegation

- [x] Keep the parent turn responsible for the final answer.
- [ ] Route deeper analysis to a subagent.
  - Use `spawn_agent` for isolated work.
  - Preserve the parent context boundary.

Review `src/renderer/components/chat/message-bubble-render-utils.mjs` before changing the renderer.

[Unsafe javascript link](javascript:alert('x')) should remain inert.
