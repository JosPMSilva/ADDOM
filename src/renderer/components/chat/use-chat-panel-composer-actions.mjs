import { useCallback, useMemo, useRef } from 'react'
import { requestAppConfirm } from '../../store/useAppStore.js'
import useChatStore from '../../store/useChatStore.js'
import useSettingsStore from '../../store/useSettingsStore.js'
import {
  normalizeComposerBlocks,
  serializeComposerBlocksAndDraft,
} from './composer-segments.mjs'
import { filterEligibleEditorPreludeEntries } from './composer-hidden-prelude.mjs'
import { getLatestAssistantNote } from './chat-utils.js'
import { parseCompactionCommand } from './compaction-command-parser.mjs'
import { isDirectAgentCommandText, parseDirectAgentCommand } from './direct-agent-command-parser.mjs'
import { parseRoleCommand, buildRoleGenerationPrompts } from './role-command-parser.mjs'
import { parseDispatchCommand } from './dispatch-command-parser.mjs'
import { buildDispatchDecompositionPrompts } from './dispatch-decomposer.mjs'
import { parsePipelineCommand } from './pipeline-command-parser.mjs'
import { parseCouncilCommand } from './council-command-parser.mjs'
import { parseReviewCommand } from './review-command-parser.mjs'
import { stageComposerAttachmentFiles } from './chat-panel-attachment-staging.mjs'
import {
  buildAttachmentCapabilityNoticeMessage,
  buildRecentUserMessageFingerprint,
  countSimilarRecentUserMessages,
  logComplianceEvent,
  waitForMoaExecutionResult,
} from './chat-panel-composer-action-utils.mjs'
import {
  formatRoleMention,
  buildHiddenPreludeHistoryMessage,
  buildToolFreeCommandTurnOptions,
  executeSendMessage,
  executeCompactionCommand,
  executeOrchestratedAgentCommand,
  isPdfAttachment,
  partitionAttachmentsByCapability,
} from './chat-panel-helpers.mjs'
import {
  COMPLIANCE_MODE_STRICT,
  COMPLIANCE_MODE_WARN_ONLY,
  normalizeComplianceMode,
} from '../../../common/compliance/compliance-settings.mjs'

export function useChatPanelComposerActions({
  fileAttachmentsEnabled = false,
  imageAttachmentsEnabled = false,
  isStreaming = false,
  canSend = false,
  selectedProvider = '',
  selectedModel = '',
  selectedProviderManifest = null,
  projectFolder = '',
  activeProjectId = '',
  activeThreadId = '',
  permissionMode = 'ask',
  memoryCompressionEnabled = false,
  memoryCompressionThreshold = 0,
  attachedImagesRef,
  setAttachedImages = () => {},
  pushNotice = () => {},
  consumePendingContextPrefix = () => null,
  addUserMessage = () => '',
  addAssistantPlaceholder = () => {},
  markError = () => {},
  getChatState = () => ({ messages: [] }),
  autoTitleThread = null,
  pendingEditorDraftPreludes = [],
  setPendingEditorDraftPreludes = () => {},
  composerBlocksRef,
  composerDraftTextRef,
  setComposerDraftText = () => {},
  setComposerBlocks = () => {},
  composerInputRef,
  devPerfEnabled = false,
  keydownStartRef,
} = {}) {
  const repetitiveNoticeSeenRef = useRef(new Set())
  const repetitiveStrictConfirmedRef = useRef(new Set())
  const attachmentsEnabled = fileAttachmentsEnabled || imageAttachmentsEnabled
  const coreSettings = useSettingsStore((s) => s.coreSettings)
  const complianceMode = normalizeComplianceMode(coreSettings?.complianceMode, COMPLIANCE_MODE_WARN_ONLY)
  const moaRoles = useMemo(
    () => (Array.isArray(coreSettings?.moaRoles) ? coreSettings.moaRoles : []),
    [coreSettings?.moaRoles],
  )

  const stageAttachmentFilesFromList = useCallback(async (fileList) => {
    await stageComposerAttachmentFiles({
      activeProjectId,
      activeThreadId,
      fileAttachmentsEnabled,
      imageAttachmentsEnabled,
      files: fileList,
      pushNotice,
      selectedModel,
      selectedProvider,
      setAttachedImages,
    })
  }, [
    activeProjectId,
    activeThreadId,
    fileAttachmentsEnabled,
    imageAttachmentsEnabled,
    pushNotice,
    selectedModel,
    selectedProvider,
    setAttachedImages,
  ])

  const handleComposerPaste = useCallback((e) => {
    if (!attachmentsEnabled) return
    const items = Array.from(e.clipboardData?.items || [])
    const fileItems = items.filter((item) => item.kind === 'file')
    if (!fileItems.length) return
    e.preventDefault()
    const files = fileItems.map((item) => item.getAsFile()).filter(Boolean)
    void stageAttachmentFilesFromList(files)
  }, [attachmentsEnabled, stageAttachmentFilesFromList])

  const handleComposerDrop = useCallback((e) => {
    if (!attachmentsEnabled) return
    const files = Array.from(e.dataTransfer?.files || []).filter(Boolean)
    if (!files.length) return
    e.preventDefault()
    e.stopPropagation()
    void stageAttachmentFilesFromList(files)
  }, [attachmentsEnabled, stageAttachmentFilesFromList])

  const handleComposerFilesSelected = useCallback((fileList) => {
    if (!attachmentsEnabled) return
    void stageAttachmentFilesFromList(fileList)
  }, [attachmentsEnabled, stageAttachmentFilesFromList])

  const sendMessage = useCallback((rawContent, modeOverride, options = {}) => {
    const { chatMode, processingMode } = useChatStore.getState()
    return executeSendMessage({
      rawContent,
      modeOverride,
      options,
      isStreaming,
      selectedProvider,
      selectedModel,
      selectedProviderManifest,
      activeThreadId,
      projectFolder,
      permissionMode,
      chatMode,
      processingMode,
      memoryCompressionEnabled,
      memoryCompressionThreshold,
      activeProjectId,
      attachedImagesRef,
      consumePendingContextPrefix,
      addUserMessage,
      setAttachedImages,
      addAssistantPlaceholder,
      getChatState,
      chatStream: (...args) => window.addom.chat.stream(...args),
      autoTitleThread,
    })
  }, [
    isStreaming,
    selectedProvider,
    selectedModel,
    selectedProviderManifest,
    activeThreadId,
    projectFolder,
    permissionMode,
    memoryCompressionEnabled,
    memoryCompressionThreshold,
    activeProjectId,
    attachedImagesRef,
    consumePendingContextPrefix,
    addUserMessage,
    addAssistantPlaceholder,
    setAttachedImages,
    getChatState,
    autoTitleThread,
  ])

  const sendToolFreeCommandMessage = useCallback((rawContent, modeOverride, options = {}) => sendMessage(
    rawContent,
    modeOverride,
    {
      ...options,
      turnOptions: buildToolFreeCommandTurnOptions(options?.turnOptions || {}),
    },
  ), [sendMessage])

  const sendOrchestratedAgentCommand = useCallback((rawContent) => executeOrchestratedAgentCommand({
    rawContent,
    isStreaming,
    activeThreadId,
    projectFolder,
    addUserMessage,
    addAssistantPlaceholder,
    markError,
    isDirectAgentCommandTextFn: isDirectAgentCommandText,
    parseDirectAgentCommandFn: parseDirectAgentCommand,
    moaRoles,
    sendMessage,
  }), [
    isStreaming,
    activeThreadId,
    projectFolder,
    addUserMessage,
    addAssistantPlaceholder,
    markError,
    moaRoles,
    sendMessage,
  ])

  const sendCompactionCommand = useCallback((rawContent, modeOverride, options = {}) => executeCompactionCommand({
    rawContent,
    modeOverride,
    options,
    providerId: selectedProvider,
    isStreaming,
    activeThreadId,
    addUserMessage,
    addAssistantPlaceholder,
    markError,
    parseCompactionCommandFn: parseCompactionCommand,
    sendMessage,
  }), [
    selectedProvider,
    isStreaming,
    activeThreadId,
    addUserMessage,
    addAssistantPlaceholder,
    markError,
    sendMessage,
  ])

  const send = useCallback(async () => {
    if (!canSend) return
    const pendingAttachmentsSnapshot = Array.isArray(attachedImagesRef?.current)
      ? attachedImagesRef.current
      : []
    const gatedSnapshot = partitionAttachmentsByCapability(pendingAttachmentsSnapshot, {
      fileAttachmentsEnabled,
      imageAttachmentsEnabled,
    })
    if (gatedSnapshot.blocked.length > 0) {
      const threadOptions = activeThreadId ? { threadId: activeThreadId } : undefined
      const assistantId = addAssistantPlaceholder(threadOptions)
      const providerLabel = String(selectedProvider || 'selected provider')
      const modelLabel = String(selectedModel || 'selected model')
      setAttachedImages(gatedSnapshot.allowed)
      markError(
        assistantId,
        buildAttachmentCapabilityNoticeMessage({
          blocked: gatedSnapshot.blocked,
          providerLabel,
          modelLabel,
        }),
        threadOptions,
      )
      return
    }
    const hasPdfAttachment = gatedSnapshot.allowed.some((attachment) => isPdfAttachment(attachment))
    if (hasPdfAttachment && !fileAttachmentsEnabled) {
      const threadOptions = activeThreadId ? { threadId: activeThreadId } : undefined
      const assistantId = addAssistantPlaceholder(threadOptions)
      const providerLabel = String(selectedProvider || 'selected provider')
      const modelLabel = String(selectedModel || 'selected model')
      markError(
        assistantId,
        `PDF attachments are not supported by ${providerLabel}/${modelLabel}. Switch to a model with document support or remove the PDF and retry.`,
        threadOptions,
      )
      return
    }

    const rawComposerBlocks = normalizeComposerBlocks(composerBlocksRef?.current, {
      ensureTextSegment: false,
      ensureTrailingTextSegment: false,
    })
    const rawComposerDraftText = String(composerDraftTextRef?.current || '')
    const rawComposerContent = serializeComposerBlocksAndDraft({
      blocks: rawComposerBlocks,
      draftText: rawComposerDraftText,
      trimOuterWhitespace: false,
    })
    const content = rawComposerContent.trim()

    if (complianceMode !== 'off' && content.length >= 24 && activeThreadId) {
      const state = getChatState() || { messages: [] }
      const messages = Array.isArray(state.messages) ? state.messages : []
      const fingerprint = buildRecentUserMessageFingerprint(content)
      const repeatedCount = countSimilarRecentUserMessages(messages, fingerprint)
      if (fingerprint && repeatedCount >= 2) {
        const noticeKey = `${activeThreadId}:${fingerprint}`
        const warningText = 'Compliance reminder: this looks like a repeated dispatch pattern. Avoid benchmark/distillation-style harvesting unless your provider terms explicitly allow it.'

        if (complianceMode === COMPLIANCE_MODE_STRICT) {
          if (!repetitiveStrictConfirmedRef.current.has(noticeKey)) {
            logComplianceEvent({
              noticeAction: 'shown',
              noticeType: 'repetitive_dispatch_pattern',
              threadId: String(activeThreadId || ''),
              providerId: String(selectedProvider || ''),
              model: String(selectedModel || ''),
              summary: 'Strict compliance confirmation required before repeated dispatch.',
              source: 'composer_strict_confirm',
              sessionSuppressKey: 'compliance:repetitive-dispatch',
              repeatedCount: Number(repeatedCount + 1),
            })
            const ok = await requestAppConfirm({
              title: 'Confirm Repeated Dispatch',
              message: `${warningText}\n\nStrict compliance mode requires explicit confirmation once per session for repeated dispatch patterns.`,
              confirmLabel: 'Send Anyway',
              cancelLabel: 'Cancel Send',
              tone: 'warning',
            })
            if (!ok) {
              logComplianceEvent({
                noticeAction: 'skipped',
                noticeType: 'repetitive_dispatch_pattern',
                threadId: String(activeThreadId || ''),
                providerId: String(selectedProvider || ''),
                model: String(selectedModel || ''),
                summary: 'Repeated dispatch send cancelled by strict compliance confirmation.',
                source: 'composer_strict_confirm',
                sessionSuppressKey: 'compliance:repetitive-dispatch',
                repeatedCount: Number(repeatedCount + 1),
              })
              return
            }
            repetitiveStrictConfirmedRef.current.add(noticeKey)
            logComplianceEvent({
              noticeAction: 'acknowledged',
              noticeType: 'repetitive_dispatch_pattern',
              threadId: String(activeThreadId || ''),
              providerId: String(selectedProvider || ''),
              model: String(selectedModel || ''),
              summary: 'Repeated dispatch strict compliance confirmation acknowledged.',
              source: 'composer_strict_confirm',
              sessionSuppressKey: 'compliance:repetitive-dispatch',
              repeatedCount: Number(repeatedCount + 1),
            })
          }
        } else if (!repetitiveNoticeSeenRef.current.has(noticeKey)) {
          repetitiveNoticeSeenRef.current.add(noticeKey)
          pushNotice({
            type: 'warning',
            text: warningText,
            meta: {
              complianceNotice: true,
              sessionSuppressKey: 'compliance:repetitive-dispatch',
              noticeType: 'repetitive_dispatch_pattern',
              threadId: String(activeThreadId || ''),
              repeatedCount: Number(repeatedCount + 1),
            },
          })
        }
      }
    }

    setComposerDraftText('')
    setComposerBlocks(normalizeComposerBlocks([], {
      ensureTextSegment: false,
      ensureTrailingTextSegment: false,
    }))

    const handledAgentSelection = await sendOrchestratedAgentCommand(content)
    if (handledAgentSelection) {
      setPendingEditorDraftPreludes([])
      return
    }

    const roleCmd = parseRoleCommand(content)
    if (roleCmd) {
      setPendingEditorDraftPreludes([])
      const providers = typeof window !== 'undefined' && Array.isArray(window.__addom_providers_cache)
        ? window.__addom_providers_cache
        : []
      const chatState = getChatState() || { messages: [] }
      const latestAssistantNote = getLatestAssistantNote(chatState.messages).note
      const genericRoleDescription = /^(?:help\s+(?:you|me|us)\s+with\s+(?:this|the)\s+task|this\s+task|that\s+task|the\s+task)$/i
      const roleDescription = genericRoleDescription.test(String(roleCmd.description || '').trim())
        && String(latestAssistantNote || '').trim()
        ? String(latestAssistantNote || '').trim()
        : roleCmd.description
      const { systemPrompt: roleSysPrompt, userPrompt: roleUserPrompt } = buildRoleGenerationPrompts(
        roleDescription,
        { providers, selectedProvider, selectedModel },
      )
      sendToolFreeCommandMessage(
        content,
        'execute',
        {
          hiddenPreludeMessages: [
            { role: 'system', content: roleSysPrompt },
          ],
          historyContentOverride: roleUserPrompt,
          currentUserMessage: roleUserPrompt,
          turnOptions: {
            command: {
              preserveHistory: false,
            },
          },
          roleGenerationDescription: roleDescription,
        },
      )
      return
    }

    const dispatchCmd = parseDispatchCommand(content)
    if (dispatchCmd) {
      setPendingEditorDraftPreludes([])
      const { systemPrompt: dispatchSysPrompt, userPrompt: dispatchUserPrompt } =
        buildDispatchDecompositionPrompts(dispatchCmd.description, { moaRoles })
      sendToolFreeCommandMessage(
        content,
        'execute',
        {
          hiddenPreludeMessages: [
            { role: 'system', content: dispatchSysPrompt },
            { role: 'user', content: dispatchUserPrompt },
          ],
          dispatchDecomposition: true,
          dispatchDescription: dispatchCmd.description,
        },
      )
      return
    }

    const pipelineCmd = parsePipelineCommand(content)
    if (pipelineCmd) {
      setPendingEditorDraftPreludes([])

      if (pipelineCmd.action === 'list') {
        ; (async () => {
          try {
            const result = await window.addom?.pipeline?.list?.()
            if (result?.ok && Array.isArray(result.pipelines) && result.pipelines.length > 0) {
              const lines = result.pipelines.map((p) =>
                `• **\`${p.id}\`** — ${p.name}\n  ${p.description || 'No description.'} *(${p.steps?.length || 0} steps)*`,
              )
              sendToolFreeCommandMessage(
                content,
                'execute',
                {
                  hiddenPreludeMessages: [
                    { role: 'system', content: `The user asked for the list of available pipelines. Present the following list formatted nicely:\n\n${lines.join('\n\n')}\n\nExplain that they can execute any pipeline with \`/pipeline <id> [optional context]\`.` },
                  ],
                },
              )
            } else {
              sendToolFreeCommandMessage(content, 'execute', {
                hiddenPreludeMessages: [
                  { role: 'system', content: 'No pipelines are currently available. Suggest the user check their MoA configuration.' },
                ],
              })
            }
          } catch { /* non-fatal */ }
        })()
        return
      }

      sendToolFreeCommandMessage(
        content,
        'execute',
        {
          hiddenPreludeMessages: [
            { role: 'system', content: `The user is executing pipeline "${pipelineCmd.pipelineId}".\nContext: ${pipelineCmd.context || 'No additional context provided.'}\nThis is an automated pipeline execution. Acknowledge the pipeline is running and will produce results step by step.` },
          ],
          pipelineExecution: true,
          pipelineId: pipelineCmd.pipelineId,
          pipelineContext: pipelineCmd.context,
        },
      )
      ; (async () => {
        try {
          const result = await window.addom?.pipeline?.execute?.({
            pipelineId: pipelineCmd.pipelineId,
            initialContext: pipelineCmd.context,
            projectFolder,
          })
          if (result?.ok && result.steps) {
            const stepsJson = JSON.stringify({
              pipelineId: pipelineCmd.pipelineId,
              steps: result.steps,
              summary: result.summary || result.finalOutput || '',
            })
            sendToolFreeCommandMessage(
              `Pipeline "${pipelineCmd.pipelineId}" complete - ${result.steps.length} steps finished.`,
              'execute',
              {
                hiddenPreludeMessages: [
                  { role: 'system', content: `The pipeline has completed. Present these results to the user in a clear, structured format:\n\n${stepsJson}` },
                ],
                pipelineResult: true,
              },
            )
          } else if (result && !result.ok) {
            sendToolFreeCommandMessage(
              `Pipeline failed: ${result.message || result.error || 'unknown error'}`,
              'execute',
              { hiddenPreludeMessages: [] },
            )
          }
        } catch { /* non-fatal */ }
      })()
      return
    }

    const councilCmd = parseCouncilCommand(content)
    if (councilCmd) {
      setPendingEditorDraftPreludes([])
      sendToolFreeCommandMessage(
        content,
        'execute',
        {
          hiddenPreludeMessages: [
            { role: 'system', content: 'The user is running an LLM Council session. Multiple AI models will analyze the same task in parallel, then their outputs will be synthesized into a consensus report. Acknowledge the council is running and explain that results will appear once all models complete.' },
          ],
          councilExecution: true,
          councilInstruction: councilCmd.instruction,
        },
      )
      ; (async () => {
        try {
          const started = await window.addom?.council?.start?.({
            instruction: councilCmd.instruction,
            projectFolder,
            threadId: activeThreadId,
          })
          if (!started?.ok || !started.executionId) {
            sendToolFreeCommandMessage(
              `Council failed: ${started?.message || started?.error || 'unknown error'}`,
              'execute',
              { hiddenPreludeMessages: [] },
            )
            return
          }
          const result = await waitForMoaExecutionResult({
            getStatus: (executionId) => window.addom?.council?.getStatus?.(executionId),
            executionId: started.executionId,
          })
          if (result?.ok && result.synthesisPrompts) {
            sendToolFreeCommandMessage(
              'Council outputs collected - synthesizing consensus...',
              'execute',
              {
                hiddenPreludeMessages: [
                  { role: 'system', content: result.synthesisPrompts.systemPrompt },
                  { role: 'user', content: result.synthesisPrompts.userPrompt },
                ],
                councilSynthesis: true,
              },
            )
          } else if (result && !result.ok) {
            sendToolFreeCommandMessage(
              `Council failed: ${result.message || result.error || 'unknown error'}`,
              'execute',
              { hiddenPreludeMessages: [] },
            )
          }
        } catch { /* non-fatal */ }
      })()
      return
    }

    const reviewCmd = parseReviewCommand(content)
    if (reviewCmd) {
      setPendingEditorDraftPreludes([])
      const focusText = reviewCmd.focus
        ? `Focus area: ${reviewCmd.focus}`
        : 'Review the entire project'
      sendToolFreeCommandMessage(
        content,
        'execute',
        {
          hiddenPreludeMessages: [
            { role: 'system', content: `The user is running a comprehensive code review pipeline. Three review passes will execute sequentially: Structural -> Security -> Performance. Each pass chains its output to the next. Acknowledge the review is starting and explain that results will arrive in three passes.\n\n${focusText}` },
          ],
          pipelineExecution: true,
          pipelineId: 'comprehensive-code-review',
          pipelineContext: reviewCmd.focus,
        },
      )
      ; (async () => {
        try {
          const started = await window.addom?.pipeline?.start?.({
            pipelineId: 'comprehensive-code-review',
            initialContext: reviewCmd.focus || '',
            projectFolder,
            threadId: activeThreadId,
          })
          if (!started?.ok || !started.executionId) {
            sendToolFreeCommandMessage(
              `?? Review failed: ${started?.message || started?.error || 'unknown error'}`,
              'execute',
              { hiddenPreludeMessages: [] },
            )
            return
          }
          const result = await waitForMoaExecutionResult({
            getStatus: (executionId) => window.addom?.pipeline?.getStatus?.(executionId),
            executionId: started.executionId,
          })
          if (result?.ok && result.steps) {
            const stepsJson = JSON.stringify({
              pipelineId: 'comprehensive-code-review',
              steps: result.steps,
              summary: result.summary || result.finalOutput || '',
            })
            sendToolFreeCommandMessage(
              `?? Code review complete — ${result.steps.length} passes finished.`,
              'execute',
              {
                hiddenPreludeMessages: [
                  { role: 'system', content: `The code review pipeline has completed. Present these results to the user in a clear, structured format:\n\n${stepsJson}` },
                ],
                pipelineResult: true,
              },
            )
          } else if (result && !result.ok) {
            sendToolFreeCommandMessage(
              `?? Review failed: ${result.message || result.error || 'unknown error'}`,
              'execute',
              { hiddenPreludeMessages: [] },
            )
          }
        } catch { /* non-fatal */ }
      })()
      return
    }

    const matchingEditorPreludeMessages = filterEligibleEditorPreludeEntries(
      pendingEditorDraftPreludes,
      rawComposerBlocks,
      rawComposerContent,
    )
      .map((entry) => buildHiddenPreludeHistoryMessage(entry.hiddenPrefix))
      .filter(Boolean)

    setPendingEditorDraftPreludes([])

    const handledCompactionCommand = await sendCompactionCommand(content, undefined, {
      hiddenPreludeMessages: matchingEditorPreludeMessages,
    })
    if (handledCompactionCommand) {
      return
    }

    sendMessage(content, undefined, { hiddenPreludeMessages: matchingEditorPreludeMessages })
  }, [
    activeThreadId,
    projectFolder,
    canSend,
    composerBlocksRef,
    composerDraftTextRef,
    attachedImagesRef,
    selectedProvider,
    selectedModel,
    fileAttachmentsEnabled,
    imageAttachmentsEnabled,
    addAssistantPlaceholder,
    getChatState,
    markError,
    pushNotice,
    setAttachedImages,
    setComposerDraftText,
    setComposerBlocks,
    sendCompactionCommand,
    sendOrchestratedAgentCommand,
    pendingEditorDraftPreludes,
    setPendingEditorDraftPreludes,
    sendMessage,
    sendToolFreeCommandMessage,
    complianceMode,
    moaRoles,
  ])

  const handleInsertDirectAgentTarget = useCallback(({ route, roles }) => {
    const selected = Array.isArray(roles) ? roles : []
    const preferredRoute = String(route || '').trim()
    const mentions = selected
      .map((role) => formatRoleMention(role))
      .filter(Boolean)
      .join(' ')
      .trim()
    if (!mentions) return

    setComposerDraftText((prev) => {
      const current = String(prev || '')
      const trimmed = current.trim()
      if (!trimmed) return `${mentions} `
      if (isDirectAgentCommandText(trimmed)) return current
      if (preferredRoute === 'orchestrated_single' && selected.length === 1 && trimmed.startsWith('@')) return current
      return `${mentions} ${current}`.trimStart()
    }, { focusComposer: true })
  }, [setComposerDraftText])

  const handleKeyDown = useCallback((e, meta = {}) => {
    if (devPerfEnabled && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (keydownStartRef) keydownStartRef.current = performance.now()
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void send()
      return
    }
    if (meta?.editorKind !== 'draft') return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }, [devPerfEnabled, keydownStartRef, send])

  const focusComposerInput = useCallback((event) => {
    const target = event?.target
    if (!(target instanceof HTMLElement)) return
    if (target.closest('button') || target.closest('textarea') || target.closest('input')) return
    event.preventDefault()
    composerInputRef?.current?.focus()
  }, [composerInputRef])

  return {
    handleComposerPaste,
    handleComposerDrop,
    handleComposerFilesSelected,
    sendMessage,
    send,
    handleInsertDirectAgentTarget,
    handleKeyDown,
    focusComposerInput,
  }
}
