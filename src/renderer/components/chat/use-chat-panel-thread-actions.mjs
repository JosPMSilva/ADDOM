import { useCallback } from 'react'
import { prepareWorkspaceDisposalIntent } from '../workspace/workspace-disposal-intent.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { requestAppConfirm } from '../../store/useAppStore.js'

export function useChatPanelThreadActions({
  activeThreadId = '',
  activeThread = null,
  setActiveThread = async () => {},
  createThread = async () => {},
  renameCurrentThread = async () => {},
  deleteCurrentThread = async () => {},
  clearToolActivity = () => {},
  setCreateThreadModalOpen = () => {},
  setNewThreadTitle = () => {},
  newThreadTitle = 'New Thread',
  setRenameThreadModalOpen = () => {},
  setRenameThreadTitle = () => {},
  renameThreadTitle = '',
} = {}) {
  const { t } = useRendererTranslation(['core'])

  const openDeleteThreadModal = useCallback(async () => {
    if (!activeThreadId) return
    const intent = await prepareWorkspaceDisposalIntent({
      workspaceApi: window.addom.workspace,
      action: 'delete-thread',
      scope: 'thread',
      threadId: activeThreadId,
    })
    const currentTitle = String(activeThread?.title || '').trim()
    const confirmed = await requestAppConfirm({
      title: t('chat.threadModals.clear.deleteTitle', { defaultValue: 'Delete thread?' }),
      message: intent.stopActive
        ? t('workspaceDisposal.threadDeleteActiveMessage', {
            defaultValue: 'Active work in this thread will stop before deletion. Project Memory, Artifacts, and project files remain available.',
          })
        : t('chat.threadModals.clear.deleteMessage', {
            defaultValue: 'This thread{{threadTitle}} will be removed from ADDOM. Project Memory and Artifacts remain available, and no project files are changed.',
            threadTitle: currentTitle ? ` (“${currentTitle}”)` : '',
          }),
      confirmLabel: intent.stopActive
        ? t('workspaceDisposal.stopAndDelete', { defaultValue: 'Stop and delete' })
        : t('chat.threadModals.clear.deleteConfirm', { defaultValue: 'Delete thread' }),
      cancelLabel: t('chat.threadModals.common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!confirmed) return

    const targetThreadId = activeThreadId
    const result = await deleteCurrentThread({ stopActive: intent.stopActive })
    if (!result?.ok) return
    clearToolActivity(targetThreadId)
  }, [activeThread, activeThreadId, clearToolActivity, deleteCurrentThread, t])

  const handleThreadSelect = useCallback(async (threadId) => {
    const tid = String(threadId ?? '').trim()
    if (!tid || tid === activeThreadId) return
    await setActiveThread(tid)
  }, [activeThreadId, setActiveThread])

  const handleCreateThread = useCallback(async () => {
    setNewThreadTitle('New Thread')
    setCreateThreadModalOpen(true)
  }, [setNewThreadTitle, setCreateThreadModalOpen])

  const handleCreateThreadSubmit = useCallback(async () => {
    const title = String(newThreadTitle ?? '').trim() || 'New Thread'
    await createThread(title)
    setCreateThreadModalOpen(false)
    setNewThreadTitle('New Thread')
  }, [createThread, newThreadTitle, setCreateThreadModalOpen, setNewThreadTitle])

  const handleRenameThread = useCallback(async () => {
    if (!activeThreadId) return
    const currentTitle = String(activeThread?.title || '').trim() || 'Thread'
    setRenameThreadTitle(currentTitle)
    setRenameThreadModalOpen(true)
  }, [activeThreadId, activeThread, setRenameThreadTitle, setRenameThreadModalOpen])

  const handleRenameThreadSubmit = useCallback(async () => {
    const currentTitle = String(activeThread?.title || '').trim() || 'Thread'
    const clean = String(renameThreadTitle || '').trim()
    if (!clean) return
    if (clean !== currentTitle) {
      await renameCurrentThread(clean)
    }
    setRenameThreadModalOpen(false)
  }, [activeThread, renameCurrentThread, renameThreadTitle, setRenameThreadModalOpen])

  return {
    handleThreadSelect,
    handleCreateThread,
    handleCreateThreadSubmit,
    handleRenameThread,
    handleRenameThreadSubmit,
    openDeleteThreadModal,
  }
}
