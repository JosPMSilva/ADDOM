import { useCallback, useEffect, useRef, useState } from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { normalizeAttachmentMenuDescriptor } from './attachment-action-menu-state.mjs'

export default function useAttachmentActions({
  messageId = '',
  projectId = '',
  threadId = '',
  onError,
} = {}) {
  const { t } = useRendererTranslation(['core'])
  const [menu, setMenu] = useState(null)
  const [busy, setBusy] = useState(false)
  const [applications, setApplications] = useState([])
  const [applicationsLoading, setApplicationsLoading] = useState(false)
  const requestIdRef = useRef(0)

  const closeMenu = useCallback((restoreFocus = false) => {
    requestIdRef.current += 1
    setMenu((current) => {
      if (restoreFocus) window.requestAnimationFrame(() => current?.anchorElement?.focus?.())
      return null
    })
    setBusy(false)
    setApplications([])
    setApplicationsLoading(false)
  }, [])

  useEffect(() => closeMenu(), [closeMenu, messageId, projectId, threadId])

  const openMenu = useCallback((part, anchorElement, point) => {
    requestIdRef.current += 1
    const descriptor = normalizeAttachmentMenuDescriptor(part)
    setApplications([])
    setApplicationsLoading(false)
    setMenu({
      anchorElement,
      descriptor,
      kind: descriptor.kind,
      label: descriptor.fileName || (descriptor.kind === 'image'
        ? t('core:chat.attachments.labels.attachedImage', { defaultValue: 'Attached image' })
        : t('core:chat.attachments.labels.attachedFile', { defaultValue: 'Attached file' })),
      point: { x: Number(point?.x || 0), y: Number(point?.y || 0) },
    })
  }, [t])

  const reportError = useCallback((action) => {
    const key = action === 'copy'
      ? 'copyFailed'
      : action === 'show_in_folder'
        ? 'showInFolderFailed'
        : action === 'save_as'
          ? 'saveFailed'
          : 'openWithFailed'
    const defaults = {
      copyFailed: 'Could not copy this attachment.',
      showInFolderFailed: 'Could not show this attachment in its folder.',
      saveFailed: 'Could not save this attachment.',
      openWithFailed: 'Could not open this attachment with the selected app.',
    }
    onError?.(t(`core:chat.attachments.actions.${key}`, { defaultValue: defaults[key] }))
  }, [onError, t])

  const loadOpenWith = useCallback(async () => {
    if (!menu || applicationsLoading || applications.length > 0) return
    const requestId = ++requestIdRef.current
    setApplicationsLoading(true)
    try {
      const result = await window.addom?.attachments?.listOpenWith?.(menu.descriptor, {
        projectId,
        threadId,
      })
      if (requestId !== requestIdRef.current) return
      if (!result?.ok) {
        reportError('open_with')
        return
      }
      setApplications(Array.isArray(result.applications) ? result.applications : [])
    } catch {
      if (requestId === requestIdRef.current) reportError('open_with')
    } finally {
      if (requestId === requestIdRef.current) setApplicationsLoading(false)
    }
  }, [applications.length, applicationsLoading, menu, projectId, reportError, threadId])

  const runAction = useCallback(async (action, applicationId = '') => {
    if (!menu || busy) return
    const api = window.addom?.attachments
    const scope = { projectId, threadId }
    const requestId = ++requestIdRef.current
    setBusy(true)
    try {
      const result = action === 'copy'
        ? await api?.copy?.(menu.descriptor, scope)
        : action === 'show_in_folder'
          ? await api?.reveal?.(menu.descriptor, scope)
        : action === 'save_as'
          ? await api?.saveAs?.(menu.descriptor, scope)
          : await api?.openWith?.(menu.descriptor, applicationId, scope)
      if (requestId !== requestIdRef.current) return
      if (result?.ok || result?.canceled) closeMenu()
      else reportError(action)
    } catch {
      if (requestId === requestIdRef.current) reportError(action)
    } finally {
      if (requestId === requestIdRef.current) setBusy(false)
    }
  }, [busy, closeMenu, menu, projectId, reportError, threadId])

  return {
    applications,
    applicationsLoading,
    busy,
    closeMenu,
    loadOpenWith,
    menu,
    openMenu,
    runAction,
  }
}
