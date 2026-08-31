import { useCallback, useEffect, useRef, useState } from 'react'
import useWorkspaceStore from '../../store/useWorkspaceStore.js'
import { clampWorkspaceRailWidth } from './workspace-rail-state.mjs'
import { WORKSPACE_RAIL_OPEN_CONTROL_ID } from './workspace-rail-interactions.mjs'

export function useWorkspaceRailNarrow(override) {
  const [narrow, setNarrow] = useState(() => override === true)
  useEffect(() => {
    if (typeof override === 'boolean' || typeof window === 'undefined') return undefined
    const query = window.matchMedia('(max-width: 767px)')
    const update = () => setNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [override])
  return typeof override === 'boolean' ? override : narrow
}

export function useWorkspaceRailControl({
  open: openOverride,
  width: widthOverride,
  onOpenChange,
  onWidthChange,
} = {}) {
  const storedOpen = useWorkspaceStore((state) => state.workspaceRailOpen)
  const storedWidth = useWorkspaceStore((state) => state.workspaceRailWidth)
  const setStoredOpen = useWorkspaceStore((state) => state.setWorkspaceRailOpen)
  const setStoredWidth = useWorkspaceStore((state) => state.setWorkspaceRailWidth)
  const openControlled = typeof openOverride === 'boolean'
  const widthControlled = widthOverride !== undefined && Number.isFinite(Number(widthOverride))
  const open = openControlled ? openOverride : storedOpen
  const width = widthControlled ? clampWorkspaceRailWidth(widthOverride) : storedWidth
  const requestOpen = useCallback((nextOpen) => {
    if (!openControlled) setStoredOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }, [onOpenChange, openControlled, setStoredOpen])
  const requestWidth = useCallback((nextWidth) => {
    const normalizedWidth = clampWorkspaceRailWidth(nextWidth)
    if (!widthControlled) setStoredWidth(normalizedWidth)
    onWidthChange?.(normalizedWidth)
  }, [onWidthChange, setStoredWidth, widthControlled])
  return { open, openControlled, requestOpen, requestWidth, width, widthControlled }
}

export function useWorkspaceRailFocusReturn(enabled, open) {
  const previousOpenRef = useRef(false)
  const frameRef = useRef(null)
  const frameGenerationRef = useRef(0)
  const currentStateRef = useRef({ enabled, open })
  currentStateRef.current = { enabled, open }
  useEffect(() => {
    frameGenerationRef.current += 1
    const generation = frameGenerationRef.current
    if (frameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame?.(frameRef.current)
      frameRef.current = null
    }
    const wasOpen = previousOpenRef.current
    previousOpenRef.current = enabled && open
    if (!wasOpen || open || !enabled || typeof window === 'undefined') return
    frameRef.current = window.requestAnimationFrame(() => {
      if (frameGenerationRef.current !== generation) return
      frameRef.current = null
      const current = currentStateRef.current
      if (!current.enabled || current.open) return
      document.getElementById(WORKSPACE_RAIL_OPEN_CONTROL_ID)?.focus()
    })
  }, [enabled, open])
  useEffect(() => () => {
    frameGenerationRef.current += 1
    if (frameRef.current === null || typeof window === 'undefined') return
    window.cancelAnimationFrame?.(frameRef.current)
    frameRef.current = null
  }, [])
}
