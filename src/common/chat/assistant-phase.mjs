export const ASSISTANT_PHASE_COMMENTARY = 'commentary'
export const ASSISTANT_PHASE_FINAL_ANSWER = 'final_answer'
export const ASSISTANT_PHASE_UNSPECIFIED = ''

// Canonical streamed assistant phase contract:
// - commentary: mid-turn progress/commentary owned by the execution stream
// - final_answer: user-facing answer text owned by the assistant message bubble
// - absent/unknown: unclassified; keep generic text behavior until an upstream
//   provider bridge supplies explicit phase metadata
export const ASSISTANT_STREAM_PHASE_CONTRACT = Object.freeze({
  [ASSISTANT_PHASE_COMMENTARY]: Object.freeze({
    owner: 'execution_stream',
    meaning: 'Mid-turn assistant commentary or progress update.',
  }),
  [ASSISTANT_PHASE_FINAL_ANSWER]: Object.freeze({
    owner: 'assistant_message',
    meaning: 'User-facing final assistant answer.',
  }),
  absent: Object.freeze({
    normalizedPhase: ASSISTANT_PHASE_UNSPECIFIED,
    meaning: 'Phase metadata is absent or unknown.',
    handling: 'Treat as unclassified unless a shared stream policy promotes equivalent OpenAI activity to commentary.',
  }),
})

const ASSISTANT_PHASE_ALIASES = new Map([
  [ASSISTANT_PHASE_COMMENTARY, ASSISTANT_PHASE_COMMENTARY],
  ['assistant_commentary', ASSISTANT_PHASE_COMMENTARY],
  ['assistant-commentary', ASSISTANT_PHASE_COMMENTARY],
  ['assistant commentary', ASSISTANT_PHASE_COMMENTARY],
  [ASSISTANT_PHASE_FINAL_ANSWER, ASSISTANT_PHASE_FINAL_ANSWER],
  ['final-answer', ASSISTANT_PHASE_FINAL_ANSWER],
  ['final answer', ASSISTANT_PHASE_FINAL_ANSWER],
  ['assistant_final_answer', ASSISTANT_PHASE_FINAL_ANSWER],
  ['assistant-final-answer', ASSISTANT_PHASE_FINAL_ANSWER],
  ['assistant final answer', ASSISTANT_PHASE_FINAL_ANSWER],
])

export function normalizeAssistantPhase(value = '') {
  const phase = String(value || '').trim().toLowerCase()
  if (!phase) return ASSISTANT_PHASE_UNSPECIFIED
  return ASSISTANT_PHASE_ALIASES.get(phase) || ASSISTANT_PHASE_UNSPECIFIED
}
