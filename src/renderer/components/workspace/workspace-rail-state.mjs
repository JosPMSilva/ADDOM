export const WORKSPACE_RAIL_DEFAULT_WIDTH = 336
export const WORKSPACE_RAIL_MIN_WIDTH = 220
export const WORKSPACE_RAIL_MAX_WIDTH = 520

export function clampWorkspaceRailWidth(value) {
  const width = Number(value)
  if (!Number.isFinite(width)) return WORKSPACE_RAIL_DEFAULT_WIDTH
  return Math.min(WORKSPACE_RAIL_MAX_WIDTH, Math.max(WORKSPACE_RAIL_MIN_WIDTH, width))
}

export function resolveWorkspaceRailDragEnd({ candidateWidth, previousExpandedWidth }) {
  if (Number(candidateWidth) < WORKSPACE_RAIL_MIN_WIDTH) {
    return {
      open: false,
      width: clampWorkspaceRailWidth(previousExpandedWidth),
    }
  }
  return {
    open: true,
    width: clampWorkspaceRailWidth(candidateWidth),
  }
}
