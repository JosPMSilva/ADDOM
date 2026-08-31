import { useEffect } from 'react'

export function useChatPanelAttachmentTextRuntime({
  attachmentTextExtractionEnabled, selectedProvider, selectedModel,
  nativeFileAttachmentsEnabled, setAttachmentTextExtractionRuntimeReady,
} = {}) {
    useEffect(() => {
      const shouldProbeRuntime = (
        attachmentTextExtractionEnabled === true
        && !!selectedProvider
        && nativeFileAttachmentsEnabled !== true
      )
      if (!shouldProbeRuntime) {
        setAttachmentTextExtractionRuntimeReady(false)
        return
      }
  
      const attachmentApi = typeof window !== 'undefined' ? window?.addom?.attachments : null
      if (!attachmentApi || typeof attachmentApi.getTextExtractionStatus !== 'function') {
        setAttachmentTextExtractionRuntimeReady(false)
        return
      }
  
      let mounted = true
      setAttachmentTextExtractionRuntimeReady(false)
      attachmentApi.getTextExtractionStatus({ forceRefresh: false })
        .then((status) => {
          if (!mounted) return
          setAttachmentTextExtractionRuntimeReady(status?.ready === true)
        })
        .catch(() => {
          if (!mounted) return
          setAttachmentTextExtractionRuntimeReady(false)
        })
      return () => {
        mounted = false
      }
    }, [
      attachmentTextExtractionEnabled,
      nativeFileAttachmentsEnabled,
      selectedModel,
      selectedProvider,
      setAttachmentTextExtractionRuntimeReady,
    ])
}
