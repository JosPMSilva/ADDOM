export const EDITOR_OUTLINE_PANEL_WIDTH = 280
export const EDITOR_OUTLINE_PANEL_COLLAPSED_WIDTH = 40

const EDITOR_FORMAT_ON_SAVE_KEY = 'addom.editor.formatOnSave'
const PROBLEMS_PANEL_DEFAULT_COLLAPSED_KEY = 'addom.editor.problemsPanel.defaultCollapsed'

export function problemSeverityMeta(severity) {
  const n = Number(severity || 0)
  if (n >= 8) return { label: 'Error', dot: 'bg-danger', text: 'text-danger-soft' }
  if (n >= 4) return { label: 'Warning', dot: 'bg-warning', text: 'text-warning-soft' }
  if (n >= 2) return { label: 'Info', dot: 'bg-info-soft', text: 'text-info-soft' }
  return { label: 'Hint', dot: 'bg-text-tertiary', text: 'text-text-muted' }
}

export function countProblemsBySeverity(problems = []) {
  const counts = { error: 0, warning: 0, info: 0, total: 0 }
  for (const problem of Array.isArray(problems) ? problems : []) {
    const n = Number(problem?.severity || 0)
    if (n >= 8) counts.error += 1
    else if (n >= 4) counts.warning += 1
    else counts.info += 1
    counts.total += 1
  }
  return counts
}

export function problemMatchesFilter(problem, filter) {
  const severity = Number(problem?.severity || 0)
  if (filter === 'error') return severity >= 8
  if (filter === 'warning') return severity >= 4 && severity < 8
  if (filter === 'info') return severity < 4
  return true
}

export function readEditorFormatOnSaveEnabled() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    return window.localStorage.getItem(EDITOR_FORMAT_ON_SAVE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeEditorFormatOnSaveEnabled(value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(EDITOR_FORMAT_ON_SAVE_KEY, value ? '1' : '0')
  } catch {
    // Ignore storage failures in renderer sandboxed contexts.
  }
}

export function readProblemsPanelDefaultCollapsed() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    return window.localStorage.getItem(PROBLEMS_PANEL_DEFAULT_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeProblemsPanelDefaultCollapsed(value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(PROBLEMS_PANEL_DEFAULT_COLLAPSED_KEY, value ? '1' : '0')
  } catch {
    // Ignore storage failures in renderer sandboxed contexts.
  }
}
