import useAppStore from '../../store/useAppStore.js'
import useEditorStore from '../../store/useEditorStore.js'

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

export function openExternalTerminalUrl(url = '') {
  const openExternal = typeof window === 'undefined'
    ? null
    : window.addom?.shell?.openExternal
  if (typeof openExternal !== 'function') return false
  try {
    void openExternal(String(url || ''))
    return true
  } catch {
    return false
  }
}

export async function openTerminalWorkspaceFileReference({
  projectFolder = '',
  sessionId = '',
  reference = {},
} = {}) {
  const normalizedProjectFolder = asTrimmedString(projectFolder)
  const filePath = asTrimmedString(reference?.filePath)
  if (!normalizedProjectFolder || !filePath) return false

  const openFileAtLocation = useEditorStore.getState().openFileAtLocation
  if (typeof openFileAtLocation !== 'function') return false

  useAppStore.getState().setActivePanel?.('editor')
  const result = await openFileAtLocation(
    normalizedProjectFolder,
    filePath,
    reference?.line,
    reference?.column,
    {
      source: 'terminal_output_link',
      sessionId: asTrimmedString(sessionId),
    },
  )
  return result?.ok === true
}
