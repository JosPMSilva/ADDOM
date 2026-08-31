import { useCallback, useEffect, useMemo, useState } from 'react'
import useSettingsStore from '../../store/useSettingsStore.js'
import {
  providerHasCredential,
  providerUsesOpenAIAccountAuth,
} from '../../../common/api-clients/provider-credential-state.mjs'

export function useChatPanelOpenAIKnowledgeBase({
  providers = [],
  activeProjectId = '',
  activeThreadId = '',
  pushNotice = () => {},
} = {}) {
  const [openAIKnowledgeBaseBusyAttachmentIds, setOpenAIKnowledgeBaseBusyAttachmentIds] = useState([])
  const openAIProjectAssets = useSettingsStore((s) => s.openAIProjectAssets)
  const openAIProjectAssetsProjectId = useSettingsStore((s) => s.openAIProjectAssetsProjectId)
  const refreshProjectAssets = useSettingsStore((s) => s.refreshOpenAIProjectAssets)

  const openAIProviderConfigured = useMemo(
    () => providers.some((provider) => {
      const providerId = String(provider?.id || '').trim().toLowerCase()
      return providerId === 'openai'
        && providerHasCredential(provider)
        && !providerUsesOpenAIAccountAuth(provider)
    }),
    [providers],
  )

  useEffect(() => {
    if (!openAIProviderConfigured || !activeProjectId) return
    if (openAIProjectAssetsProjectId === activeProjectId && openAIProjectAssets) return
    refreshProjectAssets(activeProjectId, { forceRemote: false }).catch(() => {})
  }, [
    activeProjectId,
    openAIProjectAssets,
    openAIProjectAssetsProjectId,
    openAIProviderConfigured,
    refreshProjectAssets,
  ])

  const projectAssets = openAIProjectAssetsProjectId === activeProjectId
    ? openAIProjectAssets
    : null

  const openAIKnowledgeBaseStateByAttachmentId = useMemo(() => {
    const lookup = {}
    const files = Array.isArray(projectAssets?.files) ? projectAssets.files : []
    const vectorStoreFiles = Array.isArray(projectAssets?.vectorStoreFiles) ? projectAssets.vectorStoreFiles : []
    const attachedProviderFileIds = new Set(
      vectorStoreFiles
        .filter((row) => {
          const status = String(row?.status || '').trim().toLowerCase()
          return status !== 'deleted_remote' && status !== 'missing_file_record'
        })
        .map((row) => String(row?.providerFileRecordId || '').trim())
        .filter(Boolean),
    )

    for (const row of files) {
      const attachmentId = String(row?.attachmentId || '').trim()
      if (!attachmentId) continue
      lookup[attachmentId] = attachedProviderFileIds.has(String(row?.id || '').trim())
        ? 'attached'
        : 'uploaded'
    }

    return lookup
  }, [projectAssets])

  const handleAddAttachmentToOpenAIKnowledgeBase = useCallback(async (attachment) => {
    const openaiAssetsApi = typeof window !== 'undefined' ? window?.addom?.openaiAssets : null
    const attachmentId = String(attachment?.attachmentId || attachment?.id || '').trim()
    const fileName = String(attachment?.fileName || attachment?.filename || '').trim()
    const mediaType = String(attachment?.mediaType || attachment?.mimeType || '').trim()

    if (!openAIProviderConfigured) {
      pushNotice({
        type: 'warning',
        text: 'Configure an OpenAI API key before adding attachments to the OpenAI knowledge base.',
        threadId: activeThreadId,
      })
      return
    }

    if (!activeProjectId || !activeThreadId || !attachmentId || !openaiAssetsApi) {
      pushNotice({
        type: 'warning',
        text: 'An active project, thread, and staged attachment are required for OpenAI knowledge-base uploads.',
        threadId: activeThreadId,
      })
      return
    }

    if (String(openAIKnowledgeBaseStateByAttachmentId[attachmentId] || '').trim().toLowerCase() === 'attached') {
      pushNotice({
        type: 'info',
        text: `${fileName || 'Attachment'} is already available in the OpenAI knowledge base.`,
        threadId: activeThreadId,
      })
      return
    }

    setOpenAIKnowledgeBaseBusyAttachmentIds((prev) => [...new Set([...prev, attachmentId])])
    try {
      const uploaded = await openaiAssetsApi.uploadFiles({
        projectId: activeProjectId,
        files: [{
          attachmentId,
          threadId: activeThreadId,
          ...(fileName ? { fileName } : {}),
          ...(mediaType ? { mimeType: mediaType } : {}),
        }],
      })
      await openaiAssetsApi.ensureProjectVectorStore(activeProjectId)
      const assetIds = Array.isArray(uploaded)
        ? uploaded.map((row) => String(row?.id || '').trim()).filter(Boolean)
        : []
      if (assetIds.length > 0) {
        await openaiAssetsApi.attachFilesToProjectVectorStore({
          projectId: activeProjectId,
          assetIds,
        })
      }
      await refreshProjectAssets(activeProjectId, { forceRemote: true })
      pushNotice({
        type: 'info',
        text: `${fileName || 'Attachment'} added to the OpenAI knowledge base.`,
        threadId: activeThreadId,
      })
    } catch (error) {
      pushNotice({
        type: 'warning',
        text: `Failed to add ${fileName || 'attachment'} to the OpenAI knowledge base: ${String(error?.message || error || 'upload_failed')}`,
        threadId: activeThreadId,
      })
    } finally {
      setOpenAIKnowledgeBaseBusyAttachmentIds((prev) => prev.filter((value) => value !== attachmentId))
    }
  }, [
    activeProjectId,
    activeThreadId,
    openAIKnowledgeBaseStateByAttachmentId,
    openAIProviderConfigured,
    pushNotice,
    refreshProjectAssets,
  ])

  const refreshOpenAIProjectAssets = useCallback((forceRemote = false) => {
    if (!openAIProviderConfigured || !activeProjectId) return Promise.resolve(null)
    return refreshProjectAssets(activeProjectId, { forceRemote })
  }, [activeProjectId, openAIProviderConfigured, refreshProjectAssets])

  return {
    openAIProviderConfigured,
    openAIProjectAssets: projectAssets,
    openAIKnowledgeBaseBusyAttachmentIds,
    refreshOpenAIProjectAssets,
    openAIKnowledgeBaseStateByAttachmentId,
    handleAddAttachmentToOpenAIKnowledgeBase,
  }
}
