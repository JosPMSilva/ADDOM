export const AI_SELECTION_ACTIONS = [
  {
    id: 'explain',
    label: 'Explain',
    title: 'Explain selected code in Chat',
    description: 'Explain behavior, assumptions, and risks.',
  },
  {
    id: 'fix',
    label: 'Fix',
    title: 'Fix selected code in Chat',
    description: 'Fix bugs/issues in the selected code.',
  },
  {
    id: 'refactor',
    label: 'Refactor',
    title: 'Refactor selected code in Chat',
    description: 'Refactor while preserving behavior.',
  },
  {
    id: 'tests',
    label: 'Tests',
    title: 'Generate tests for selected code in Chat',
    description: 'Write tests for the selected code.',
  },
]

function getAiSelectionActionConfig(actionId) {
  return AI_SELECTION_ACTIONS.find((action) => action.id === actionId) || AI_SELECTION_ACTIONS[0]
}

function formatSelectionLocation(selection) {
  const startLine = Math.max(1, Number(selection?.selectionStartLineNumber || 1) || 1)
  const startColumn = Math.max(1, Number(selection?.selectionStartColumn || 1) || 1)
  const endLine = Math.max(startLine, Number(selection?.selectionEndLineNumber || startLine) || startLine)
  const endColumn = Math.max(1, Number(selection?.selectionEndColumn || 1) || 1)
  return `L${startLine}:C${startColumn} - L${endLine}:C${endColumn}`
}

function trimPromptBlock(text, maxChars = 10000) {
  const value = String(text || '')
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n/* ...truncated for length... */`
}

function selectionProblems(problems = [], selection = null) {
  if (!selection) return []
  const startLine = Math.max(1, Number(selection.selectionStartLineNumber || 1) || 1)
  const endLine = Math.max(startLine, Number(selection.selectionEndLineNumber || startLine) || startLine)
  return (Array.isArray(problems) ? problems : [])
    .filter((problem) => {
      const pStart = Math.max(1, Number(problem?.startLineNumber || 1) || 1)
      const pEnd = Math.max(pStart, Number(problem?.endLineNumber || pStart) || pStart)
      return !(pEnd < startLine || pStart > endLine)
    })
    .slice(0, 12)
}

export function buildAiSelectionVisibleDraft(selection) {
  const language = String(selection?.language || 'plaintext').trim() || 'plaintext'
  const selectedText = String(selection?.selectedText || '')
  if (!selectedText.trim()) return ''
  return [
    `\`\`\`${language}`,
    trimPromptBlock(selectedText, 12000),
    '```',
  ].join('\n')
}

export function buildAiSelectionVisibleComposerSegments(selection) {
  const language = String(selection?.language || 'plaintext').trim() || 'plaintext'
  const selectedText = String(selection?.selectedText || '')
  if (!selectedText.trim()) return []
  return [{
    type: 'code',
    language,
    code: trimPromptBlock(selectedText, 12000),
  }]
}

export function buildAiSelectionHiddenPrelude({
  actionId,
  tab,
  selection,
  problems = [],
  severityLabelFor = () => 'INFO',
}) {
  const action = getAiSelectionActionConfig(actionId)
  const filePath = String(tab?.filePath || selection?.filePath || '').trim() || 'unknown'
  const language = String(selection?.language || tab?.language || 'plaintext').trim() || 'plaintext'
  const selectedText = String(selection?.selectedText || '')
  if (!selectedText.trim()) return ''

  const contextText = String(selection?.contextText || '')
  const contextStart = Math.max(1, Number(selection?.contextStartLineNumber || selection?.selectionStartLineNumber || 1) || 1)
  const contextEnd = Math.max(contextStart, Number(selection?.contextEndLineNumber || selection?.selectionEndLineNumber || contextStart) || contextStart)
  const overlappingProblems = selectionProblems(problems, selection)

  const instructionByAction = {
    explain: [
      'Explain the selected code clearly.',
      'Focus on behavior, assumptions, edge cases, and potential risks.',
      'If you see obvious bugs or improvements, call them out separately.',
    ],
    fix: [
      'Fix bugs/issues in the selected code while preserving intended behavior.',
      'Use the diagnostics list if relevant.',
      'Return the corrected code first, then a short explanation of changes.',
    ],
    refactor: [
      'Refactor the selected code for clarity/maintainability while preserving behavior.',
      'Keep compatibility with the surrounding file context.',
      'Return the refactored code first, then a short explanation of tradeoffs.',
    ],
    tests: [
      'Write tests for the selected code using the project style/framework if inferable.',
      'Prioritize meaningful edge cases and failure modes.',
      'Return test code first, then a short note on what is covered.',
    ],
  }

  const problemLines = overlappingProblems.length > 0
    ? overlappingProblems
      .map((problem) => {
        const sev = String(severityLabelFor(problem?.severity) || 'INFO').toUpperCase()
        const code = problem?.code ? ` ${problem.code}` : ''
        return `- [${sev}] L${problem.startLineNumber}:C${problem.startColumn}${code} - ${problem.message}`
      })
      .join('\n')
    : ''

  const sections = [
    `Task: ${action.label} selection`,
    `File: ${filePath}`,
    `Language: ${language}`,
    `Selection: ${formatSelectionLocation(selection)}`,
    '',
    'The next visible user message contains only the selected code snippet.',
    'Apply the task below to that visible snippet and use the following metadata/context/diagnostics silently.',
    '',
    'Instructions:',
    ...(instructionByAction[action.id] || instructionByAction.explain).map((line) => `- ${line}`),
  ]

  if (contextText.trim()) {
    sections.push(
      '',
      `Surrounding context (L${contextStart} - L${contextEnd}):`,
      `\`\`\`${language}`,
      trimPromptBlock(contextText, 14000),
      '```',
    )
  }

  if (problemLines) {
    sections.push('', 'Diagnostics overlapping selection:', problemLines)
  }

  sections.push('', 'Do not assume unseen files unless necessary. Ask for more context only if the selection is insufficient.')
  return sections.join('\n')
}
