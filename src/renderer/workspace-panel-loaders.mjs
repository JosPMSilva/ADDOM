export const loadEditorPanel = () => import('./components/EditorPanel.jsx')
export const loadSourceControlPanel = () => import('./components/SourceControlPanel.jsx')
export const loadArtifactsPanel = () => import('./components/ArtifactsPanel.jsx')
export const loadMemoryPanel = () => import('./components/MemoryPanel.jsx')
export const loadSettingsPanel = () => import('./components/SettingsPanel.jsx')
export const loadAgentNavigatorPanel = () => import('./components/agents/AgentNavigatorPanel.jsx')

export async function preloadCriticalWorkspacePanelChunks() {
  await Promise.all([
    loadEditorPanel(),
    loadArtifactsPanel(),
    loadMemoryPanel(),
    loadSettingsPanel(),
  ])
}

export async function preloadSecondaryWorkspacePanelChunks() {
  await Promise.allSettled([
    loadSourceControlPanel(),
    loadAgentNavigatorPanel(),
  ])
}
