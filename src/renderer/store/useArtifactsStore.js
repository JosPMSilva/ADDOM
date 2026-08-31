import { create } from 'zustand'

let fileListRequestSequence = 0

const useArtifactsStore = create((set, get) => ({
  files: [],
  filesLoading: false,
  filesProjectFolder: '',
  filesError: '',
  activeScope: 'project',
  activeThreadId: '',

  resetFiles: () => {
    fileListRequestSequence += 1
    set({
      files: [],
      filesLoading: false,
      filesProjectFolder: '',
      filesError: '',
      activeScope: 'project',
      activeThreadId: '',
    })
  },

  setActiveScope: (scope) => set({ activeScope: scope === 'thread' ? 'thread' : 'project' }),

  loadFiles: async (projectFolder, options = {}) => {
    const project = String(projectFolder || '').trim()
    if (!project) {
      get().resetFiles()
      return []
    }

    const throwOnError = options?.throwOnError === true
    const requestedThreadId = String(options?.threadId || '').trim()
    const activeScope = options?.scope === 'thread' && requestedThreadId ? 'thread' : 'project'
    const activeThreadId = activeScope === 'thread' ? requestedThreadId : ''
    const requestId = ++fileListRequestSequence
    const currentProject = String(get().filesProjectFolder || '').trim()
    const isProjectSwitch = currentProject !== project
    set({
      ...(isProjectSwitch ? { files: [] } : {}),
      filesLoading: true,
      filesProjectFolder: project,
      filesError: '',
      activeScope,
      activeThreadId,
    })

    try {
      const list = await window.addom.artifacts.listFiles(project, { threadId: activeThreadId })
      if (requestId !== fileListRequestSequence) return Array.isArray(list) ? list : []
      const files = Array.isArray(list) ? list : []
      set({
        files,
        filesLoading: false,
        filesProjectFolder: project,
        filesError: '',
        activeScope,
        activeThreadId,
      })
      return files
    } catch (error) {
      if (requestId === fileListRequestSequence) {
        set({
          ...(isProjectSwitch ? { files: [] } : {}),
          filesLoading: false,
          filesProjectFolder: project,
          filesError: String(error?.message || error || 'Failed to load artifacts.'),
        })
      }
      if (throwOnError) throw error
      return []
    }
  },
}))

export default useArtifactsStore
