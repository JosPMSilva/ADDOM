import { useEffect } from 'react'
import useChatStore from '../store/useChatStore.js'
import useMemoryStore from '../store/useMemoryStore.js'
import useAppStore from '../store/useAppStore.js'
import useTerminalStore from '../store/useTerminalStore.js'
import useAgentRunStore from '../store/useAgentRunStore.js'
import { registerAnthropicEventBridgeHandlers } from './chat/chat-event-bridge-anthropic.mjs'
import { registerChatEventBridgeAuxSubscriptions } from './chat/chat-event-bridge-aux-subscriptions.mjs'
import { handlePlanDocumentReady, handlePlanLifecycleEvent } from './chat/chat-event-bridge-plan.mjs'
import { registerOpenAIEventBridgeHandlers } from './chat/chat-event-bridge-openai.mjs'
import { createChatEventBridgeStreamingIndex } from './chat/chat-event-bridge-streaming-index.mjs'
import { createToolOutputBufferRuntime, flushMatchingToolOutputBuffers } from './chat/chat-event-bridge-tool-output-buffer.mjs'
import { handleTerminalCollaborationEvent, refreshArchivedSuggestionsForThread } from './chat/chat-event-bridge-terminal-collaboration.mjs'
import { registerAgentRunEventBridge } from './chat/chat-event-bridge-agents.mjs'
import {
  buildCancelledStreamingMessageContent,
  buildTurnStateActivity,
  isTerminalMemorySuggestionToolResult,
  resolveTerminalStreamingNote,
} from './chat/chat-event-bridge-turn-state.mjs'
import {
  createStreamRuntime,
  isBubbleOwnedTextChunk,
} from './chat/chat-event-bridge-stream-runtime.mjs'
import {
  normalizeAssistantPhase,
} from '../../common/chat/assistant-phase.mjs'
import { normalizeQuestionUserRequest } from '../../common/chat/question-user-request.mjs'
import {
  resolveAuthoritativeCurrentReasoning,
} from './chat/chat-event-bridge-reasoning-route.mjs'

export default function ChatEventBridge() {
  useEffect(() => {
    const chatApi = window?.addom?.chat ?? {}
    const safeSub = (subscribeFn, cb, name) => {
      if (typeof subscribeFn !== 'function') {
        if (import.meta?.env?.DEV) {
          console.warn(`[ChatEventBridge] Missing chat subscription API: ${name}`)
        }
        return () => { }
      }
      try {
        const unSub = subscribeFn(cb)
        return typeof unSub === 'function' ? unSub : () => { }
      } catch (error) {
        if (import.meta?.env?.DEV) {
          console.warn(`[ChatEventBridge] Failed to subscribe: ${name}`, error)
        }
        return () => { }
      }
    }

    const {
      bindThreadStreamingMessage, clearMessageThreadBinding,
      ensureStreamingIdForPayload, resolveTerminalMessageIdForPayload, resolveThreadIdForMessage,
      normalizeThreadId, normalizeMessageId, normalizeLower, errorFinalizedMessageIds, unsubStreamingId,
    } = createChatEventBridgeStreamingIndex({ useChatStore, useAppStore })
    const setReasoningMetaForMessage = (id, patch, threadHint = '') => {
      if (!id) return
      const targetId = normalizeMessageId(id)
      const resolvedThreadId = normalizeThreadId(
        threadHint
        || patch?.threadId
        || resolveThreadIdForMessage(targetId),
      )
      useChatStore.getState().setReasoningMeta(
        targetId,
        patch,
        resolvedThreadId ? { threadId: resolvedThreadId } : undefined,
      )
    }
    const readPendingQuestionUser = (threadId = '') => {
      const targetThreadId = normalizeThreadId(threadId)
      const store = useChatStore.getState()
      if (!targetThreadId || typeof store.getThreadState !== 'function') {
        return store.pendingQuestionUser || null
      }
      return store.getThreadState(targetThreadId)?.pendingQuestionUser || null
    }
    const clearBridgeQuestionUserIfMatching = ({
      threadId = '',
      requestId = '',
      turnId = '',
    } = {}) => {
      const targetThreadId = normalizeThreadId(threadId)
      if (!targetThreadId) return
      const pending = readPendingQuestionUser(targetThreadId)
      if (String(pending?.source || '').trim().toLowerCase() !== 'openai_account_bridge') return
      const normalizedRequestId = String(requestId || '').trim()
      if (normalizedRequestId && String(pending?.requestId || '').trim() !== normalizedRequestId) return
      const normalizedTurnId = String(turnId || '').trim()
      if (normalizedTurnId && String(pending?.turnId || '').trim() !== normalizedTurnId) return
      useChatStore.getState().clearPendingQuestionUser({ threadId: targetThreadId })
    }
    const readAssistantMessage = (threadId = '', messageId = '') => {
      const targetMessageId = normalizeMessageId(messageId)
      if (!targetMessageId) return null
      const state = useChatStore.getState()
      const threadMessages = Array.isArray(state.getThreadState?.(threadId)?.messages)
        ? state.getThreadState(threadId).messages
        : []
      const threadMatch = threadMessages.find((message) => normalizeMessageId(message?.id) === targetMessageId)
      if (threadMatch) return threadMatch
      const activeMessages = Array.isArray(state.messages) ? state.messages : []
      return activeMessages.find((message) => normalizeMessageId(message?.id) === targetMessageId) || null
    }
    const appendExecutionStreamCommentary = ({
      text,
      chunk,
      threadId,
      turnId,
      round,
      providerId,
      model,
      emittedAt,
      forceNewBlock = false,
    } = {}) => {
      const normalizedTurnId = String(turnId || '').trim()
      if (!normalizedTurnId) return
      const delta = String(chunk ?? text ?? '')
      if (!delta) return
      const eventAt = Number(emittedAt || 0) || Date.now()
      useChatStore.getState().appendExecutionCommentary?.({
        threadId: String(threadId || '').trim(),
        turnId: normalizedTurnId,
        round,
        chunk: delta,
        emittedAt: eventAt,
        forceNewBlock,
        streamMeta: {
          threadId: String(threadId || '').trim(),
          turnId: normalizedTurnId,
          round: Number(round || 0) || 0,
          providerId: String(providerId || '').trim(),
          model: String(model || '').trim(),
          lastChunkAt: eventAt,
        },
      })
    }
    const finalizeExecutionStreamCommentary = ({
      threadId,
      turnId,
      providerId,
      model,
      completedAt,
    } = {}) => {
      const normalizedTurnId = String(turnId || '').trim()
      if (!normalizedTurnId) return
      useChatStore.getState().markExecutionCommentaryDone?.({
        threadId: String(threadId || '').trim(),
        turnId: normalizedTurnId,
        streamMeta: {
          threadId: String(threadId || '').trim(),
          turnId: normalizedTurnId,
          providerId: String(providerId || '').trim(),
          model: String(model || '').trim(),
          completedAt: Number(completedAt || 0) || Date.now(),
        },
      })
    }
    const bridgeTerminalCollaborationEvent = (payload = {}) => handleTerminalCollaborationEvent({
      payload, normalizeMessageId, normalizeLower, useTerminalStore, useChatStore,
    })
    const bridgeRefreshArchivedSuggestionsForThread = ({ threadId = '' } = {}) => refreshArchivedSuggestionsForThread({
      threadId, useAppStore, useTerminalStore,
    })
    const {
      reasoningStatsByMessageId,
      ensureStreamStarted,
      flushBufferedChannel,
      flushBufferedAllForMessage,
      queueBufferedChannelChunk,
      finalizeStreamStatsForMessage,
      recordReasoningChunkStats,
      finalizeReasoningStats,
      clearBuffers,
    } = createStreamRuntime({
      useChatStore,
      setReasoningMetaForMessage,
      dev: !!import.meta?.env?.DEV,
    })
    const {
      toolOutputBuffers, flushToolOutputBuffer, flushToolOutputBuffersByStep, queueToolOutputChunk,
    } = createToolOutputBufferRuntime({ useChatStore })
    const unChunk = safeSub(chatApi.onChunk, (payload = {}) => {
      const threadId = normalizeThreadId(payload.threadId)
      const id = ensureStreamingIdForPayload(payload)
      if (threadId && id) bindThreadStreamingMessage(threadId, id)
      if (!id) return
      const phase = normalizeAssistantPhase(payload.phase)
      if (!isBubbleOwnedTextChunk({ phase })) {
        if (payload.flushPending === true) {
          flushBufferedChannel(id, 'execution', 'provider_tool_boundary')
          return
        }
        queueBufferedChannelChunk(
          id,
          'execution',
          payload.chunk,
          phase ? { ...payload, phase } : payload,
        )
        return
      }
      queueBufferedChannelChunk(
        id,
        'text',
        payload.chunk,
        phase ? { ...payload, phase } : payload,
      )
    }, 'onChunk')

    const unAssistantCommentary = typeof chatApi.onAssistantCommentary === 'function'
      ? safeSub(chatApi.onAssistantCommentary, ({
        text,
        threadId,
        turnId,
        round,
        providerId,
        model,
        emittedAt,
      } = {}) => {
        appendExecutionStreamCommentary({
          text,
          threadId,
          turnId,
          round,
          providerId,
          model,
          emittedAt,
        })
      }, 'onAssistantCommentary')
      : () => { }

    const unDone = safeSub(chatApi.onDone, (payload = {}) => {
      const threadId = normalizeThreadId(payload.threadId)
      const id = resolveTerminalMessageIdForPayload(payload)
      const full = String(payload.full ?? '')
      if (id) {
        flushBufferedAllForMessage(id, 'done')
        // Clean up reasoning stats + any deferred meta sync timer
        const meta = reasoningStatsByMessageId.get(id)
        if (meta?._deferredMetaSync) clearTimeout(meta._deferredMetaSync)
        reasoningStatsByMessageId.delete(id)
        useChatStore.getState().finalizeMessage(id, full, {
          phase: payload.phase,
          questionUser: payload.questionUser,
          threadId,
          providerId: payload.providerId,
          model: payload.model,
          authMethod: payload.authMethod,
          transportMode: payload.transportMode,
          finalDocument: payload.finalDocument,
          providerHistoryParts: Array.isArray(payload.providerHistoryParts)
            ? payload.providerHistoryParts
            : undefined,
          generatedArtifacts: Array.isArray(payload.generatedArtifacts)
            ? payload.generatedArtifacts
            : undefined,
        })
        finalizeExecutionStreamCommentary({
          threadId,
          turnId: payload.turnId,
          providerId: payload.providerId,
          model: payload.model,
          completedAt: Date.now(),
        })
        clearMessageThreadBinding(id)
      }
      clearBridgeQuestionUserIfMatching({
        threadId,
        turnId: payload.turnId,
      })
    }, 'onDone')

    const unError = safeSub(chatApi.onError, ({ message, threadId, assistantMessageId } = {}) => {
      const payload = { message, threadId, assistantMessageId }
      const targetThreadId = normalizeThreadId(threadId)
      const id = resolveTerminalMessageIdForPayload(payload)
      const finalizedAt = Date.now()
      if (id) {
        flushBufferedAllForMessage(id, 'error')
        useChatStore.getState().markReasoningDone(
          id,
          targetThreadId ? { threadId: targetThreadId } : undefined,
        )
        finalizeStreamStatsForMessage(id, {
          completedAt: Date.now(),
          error: true,
          threadId: targetThreadId,
        })
        useChatStore.getState().markError(
          id,
          `Error: ${message}`,
          targetThreadId ? { threadId: targetThreadId } : undefined,
        )
        const terminalErrorActivity = buildTurnStateActivity('completed', {
          threadId: targetThreadId,
          turnId: payload.turnId,
          status: 'error',
          reason: `Error: ${message}`,
          finishedAt: finalizedAt,
        })
        if (terminalErrorActivity) {
          useChatStore.getState().pushToolActivity(terminalErrorActivity)
        }
        finalizeExecutionStreamCommentary({
          threadId: targetThreadId,
          turnId: payload.turnId,
          completedAt: finalizedAt,
        })
        // Track that this message was already finalized by the error handler
        // so that the subsequent onTurnState('completed') does not re-create
        // a placeholder or duplicate the error bubble.
        errorFinalizedMessageIds.add(id)
        clearMessageThreadBinding(id)
      }
      if (id) reasoningStatsByMessageId.delete(id)
      clearBridgeQuestionUserIfMatching({
        threadId: targetThreadId,
        turnId: payload.turnId,
      })
    }, 'onError')

    const unPending = safeSub(chatApi.onToolsPending, ({ count, threadId, turnId, round, toolNames }) => {
      useChatStore.getState().pushToolActivity({
        type: 'pending',
        label: `Preparing ${count} action${count > 1 ? 's' : ''}...`,
        threadId,
        turnId,
        round,
        eventKind: 'tool_pending',
        toolNames: Array.isArray(toolNames) ? toolNames : [],
      })
    }, 'onToolsPending')

    const unExecuting = safeSub(chatApi.onToolExecuting, ({
      threadId,
      turnId,
      stepId,
      sequence,
      startedAt,
      toolName,
      toolInput,
      runCommandPolicy,
      terminalSession,
    }) => {
      useChatStore.getState().pushToolActivity({
        type: 'executing',
        threadId,
        turnId,
        stepId,
        sequence,
        startedAt,
        eventKind: 'tool_executing',
        toolName,
        toolInput,
        runCommandPolicy: runCommandPolicy && typeof runCommandPolicy === 'object' ? runCommandPolicy : null,
        terminalSession: terminalSession && typeof terminalSession === 'object' ? terminalSession : null,
      })
    }, 'onToolExecuting')

    const unResult = safeSub(chatApi.onToolResult, ({
      approvalId,
      toolName,
      toolInput,
      result,
      isError,
      errorSeverity,
      decision,
      denyReason,
      missingDependencySuspected,
      threadId,
      turnId,
      stepId,
      sequence,
      startedAt,
      finishedAt,
      durationMs,
      fileChange,
      exitCode,
      stdoutPreview,
      stderrPreview,
      hintFlags,
      runCommandPolicy,
      moa,
      terminalSession,
      questionUser,
    }) => {
      if (isTerminalMemorySuggestionToolResult({
        toolName,
        isError,
        decision,
      })) {
        bridgeRefreshArchivedSuggestionsForThread({ threadId })
        return
      }
      bridgeTerminalCollaborationEvent({
        threadId,
        terminalSession,
      })
      flushToolOutputBuffersByStep({ turnId, stepId })
      useChatStore.getState().pushToolActivity({
        approvalId,
        type: 'result',
        threadId,
        turnId,
        stepId,
        sequence,
        startedAt,
        finishedAt,
        durationMs,
        eventKind: 'tool_result',
        toolName,
        toolInput,
        result,
        isError,
        errorSeverity: String(errorSeverity || '').trim().toLowerCase(),
        decision,
        denyReason,
        missingDependencySuspected,
        fileChange,
        exitCode,
        stdoutPreview,
        stderrPreview,
        hintFlags,
        runCommandPolicy: runCommandPolicy && typeof runCommandPolicy === 'object' ? runCommandPolicy : null,
        moa: moa && typeof moa === 'object' ? moa : null,
        terminalSession: terminalSession && typeof terminalSession === 'object' ? terminalSession : null,
        questionUser: questionUser && typeof questionUser === 'object' ? questionUser : null,
      })

      if (
        String(toolName || '').trim() === 'question_user'
        && !isError
        && String(decision || '').trim().toLowerCase() === 'approved'
      ) {
        const normalizedQuestionUser = normalizeQuestionUserRequest(questionUser)
          || normalizeQuestionUserRequest(result)
          || normalizeQuestionUserRequest(toolInput)
        if (normalizedQuestionUser) {
          useChatStore.getState().setPendingQuestionUser(
            normalizedQuestionUser,
            threadId ? { threadId: String(threadId || '').trim() } : undefined,
          )
        }
      }
    }, 'onToolResult')

    const planBridgeDeps = { useChatStore, useAppStore }
    const unPlanDocumentReady = safeSub(chatApi.onPlanDocumentReady, (payload) => {
      handlePlanDocumentReady(payload, planBridgeDeps)
    }, 'onPlanDocumentReady')
    const unPlanLifecycleEvent = safeSub(chatApi.onPlanLifecycleEvent, (payload) => {
      handlePlanLifecycleEvent(payload, planBridgeDeps)
    }, 'onPlanLifecycleEvent')

    const unQuestionUserRequested = safeSub(chatApi.onQuestionUserRequested, (payload = {}) => {
      const threadId = normalizeThreadId(payload.threadId || payload.questionUser?.threadId)
      const normalizedQuestionUser = normalizeQuestionUserRequest(payload.questionUser || payload)
      if (!threadId || !normalizedQuestionUser) return
      useChatStore.getState().setPendingQuestionUser(
        normalizedQuestionUser,
        { threadId },
      )
    }, 'onQuestionUserRequested')

    const unQuestionUserCleared = safeSub(chatApi.onQuestionUserCleared, (payload = {}) => {
      clearBridgeQuestionUserIfMatching({
        threadId: payload.threadId,
        requestId: payload.requestId,
        turnId: payload.turnId,
      })
    }, 'onQuestionUserCleared')

    const unToolOutput = safeSub(chatApi.onToolOutput, (payload = {}) => {
      queueToolOutputChunk(payload)
    }, 'onToolOutput')

    const unReasoningChunk = safeSub(chatApi.onReasoningChunk, (payload = {}) => {
      const threadId = normalizeThreadId(payload.threadId)
      const id = ensureStreamingIdForPayload(payload)
      if (threadId && id) bindThreadStreamingMessage(threadId, id)
      if (!id) return
      if (payload.flushPending === true) {
        flushBufferedChannel(id, 'reasoning', 'provider_tool_boundary')
        return
      }
      queueBufferedChannelChunk(id, 'reasoning', payload.chunk, payload)
      recordReasoningChunkStats(id, payload.chunk)
    }, 'onReasoningChunk')

    const unReasoningDone = safeSub(chatApi.onReasoningDone, (payload = {}) => {
      const { full, current, threadId, turnId, reasoningTokens, providerId, model, reasoningSegment } = payload
      const targetThreadId = normalizeThreadId(threadId)
      const id = resolveTerminalMessageIdForPayload(payload)
      const fullText = String(full || '').trim()
      const currentText = resolveAuthoritativeCurrentReasoning({
        full,
        current,
        hasCurrent: Object.hasOwn(payload, 'current'),
      })
      const rTokens = Number(reasoningTokens || 0)

      if (id) {
        flushBufferedChannel(id, 'reasoning', 'reasoning_done')
        // finalizeReasoning handles both chunk-streaming and batch providers:
        // - Chunk-streaming (Anthropic, Gemini, etc.): text already in message via
        //   appendReasoning; finalizeReasoning only appends if not already present.
        // - Batch (GPT-5 reasoningSummary): no chunks, finalizeReasoning adopts the
        //   full text directly. Race-safe: finds the message by ID, not streamingId.
        useChatStore.getState().finalizeReasoning(
          id,
          fullText,
          {
            ...(targetThreadId ? { threadId: targetThreadId } : {}),
            authoritative: true,
            currentText,
            ...(reasoningSegment != null ? { reasoningSegment } : {}),
          },
        )
        const meta = finalizeReasoningStats(id, {
          finalText: fullText,
          reasoningTokens: rTokens,
          providerId,
          model,
        })
        if (import.meta?.env?.DEV && meta) {
          console.info('[ChatEventBridge] reasoning_done', {
            messageId: id,
            threadId,
            turnId,
            mode: meta.mode,
            chunkCount: meta.chunkCount,
            charsStreamed: meta.charsStreamed,
            reasoningTokens: meta.reasoningTokens || 0,
            finalTextPresent: !!meta.finalTextPresent,
            providerId: meta.providerId || '',
            model: meta.model || '',
          })
        }
      }
    }, 'onReasoningDone')

    const unAuxSubscriptions = registerChatEventBridgeAuxSubscriptions({
      safeSub,
      chatApi,
      useChatStore,
      useMemoryStore,
    })

    const unOpenAISubscriptions = registerOpenAIEventBridgeHandlers({
      safeSub,
      chatApi,
      useChatStore,
      setReasoningMetaForMessage,
    })
    const unAnthropicSubscriptions = registerAnthropicEventBridgeHandlers({
      safeSub,
      chatApi,
      useChatStore,
    })

    const unTurnState = safeSub(chatApi.onTurnState, (payload = {}) => {
      const state = String(payload.state || '').trim().toLowerCase()
      if (!state) return
      const threadId = normalizeThreadId(payload.threadId)

      // When the onError handler already finalized this message, skip
      // ensureStreamingIdForPayload — it would re-create a placeholder
      // (since streamingId was already cleared by markError), producing a
      // duplicate error bubble in the timeline.
      const assistantMsgId = normalizeMessageId(payload?.assistantMessageId)
      const alreadyFinalizedByError = assistantMsgId && errorFinalizedMessageIds.has(assistantMsgId)
      const isTerminalState = state === 'completed' || state === 'cancelled'
      const idForState = alreadyFinalizedByError
        ? assistantMsgId
        : (state === 'started'
          ? ensureStreamingIdForPayload(payload)
          : resolveTerminalMessageIdForPayload(payload))

      if (threadId && idForState && !alreadyFinalizedByError) bindThreadStreamingMessage(threadId, idForState)
      if (state === 'started' && idForState && !alreadyFinalizedByError) {
        ensureStreamStarted(idForState, {
          startedAt: payload.startedAt,
          threadId: payload.threadId,
          turnId: payload.turnId,
          providerId: payload.providerId,
          model: payload.model,
        })
      }
      const turnActivity = buildTurnStateActivity(state, payload)
      if (turnActivity) useChatStore.getState().pushToolActivity(turnActivity)
      // Mark reasoning as fully done when turn ends so the block collapses.
      if (isTerminalState) {
        bridgeRefreshArchivedSuggestionsForThread({ threadId })
        flushMatchingToolOutputBuffers(toolOutputBuffers, flushToolOutputBuffer, {
          threadId,
          turnId: payload.turnId,
        })
        const id = idForState
        if (id) {
          flushBufferedAllForMessage(id, 'turn_state')
          if (!reasoningStatsByMessageId.has(id)) {
            setReasoningMetaForMessage(id, {
              mode: 'none',
              chunkCount: 0,
              charsStreamed: 0,
            }, threadId)
          }
          useChatStore.getState().markReasoningDone(
            id,
            threadId ? { threadId } : undefined,
          )
          if (import.meta?.env?.DEV) {
            const meta = reasoningStatsByMessageId.get(id)
            if (meta) {
              console.info('[ChatEventBridge] reasoning_turn_complete', {
                messageId: id,
                mode: meta.mode,
                chunkCount: meta.chunkCount,
                charsStreamed: meta.charsStreamed,
                reasoningTokens: meta.reasoningTokens || 0,
              })
            }
          }
          reasoningStatsByMessageId.delete(id)
          finalizeStreamStatsForMessage(id, {
            completedAt: Number(payload.finishedAt || 0) || Date.now(),
            cancelled: state === 'cancelled',
            threadId: payload.threadId,
            turnId: payload.turnId,
            providerId: payload.providerId,
            model: payload.model,
          })
          finalizeExecutionStreamCommentary({
            threadId,
            turnId: payload.turnId,
            providerId: payload.providerId,
            model: payload.model,
            completedAt: Number(payload.finishedAt || 0) || Date.now(),
          })
          clearMessageThreadBinding(id)
          // Clean up the error-finalized tracking
          if (alreadyFinalizedByError) errorFinalizedMessageIds.delete(assistantMsgId)
        }
        if (state === 'cancelled' && idForState) {
          const note = resolveTerminalStreamingNote(state, payload)
          const targetMessage = readAssistantMessage(threadId, idForState)
          useChatStore.getState().finalizeMessage(
            idForState,
            buildCancelledStreamingMessageContent(targetMessage?.content, note),
            threadId ? { threadId } : undefined,
          )
        }
        clearBridgeQuestionUserIfMatching({
          threadId,
          turnId: payload.turnId,
        })
      }
    }, 'onTurnState')

    const unCancelled = safeSub(chatApi.onCancelled, ({ reason, threadId, turnId, assistantMessageId } = {}) => {
      const targetThreadId = normalizeThreadId(threadId)
      const assistantMsgId = normalizeMessageId(assistantMessageId)
      flushMatchingToolOutputBuffers(toolOutputBuffers, flushToolOutputBuffer, {
        threadId: targetThreadId,
        turnId,
      })
      const id = resolveTerminalMessageIdForPayload({
        threadId: targetThreadId,
        turnId,
        assistantMessageId: assistantMsgId,
      })
      if (id) {
        flushBufferedAllForMessage(id, 'cancelled')
        useChatStore.getState().markReasoningDone(
          id,
          targetThreadId ? { threadId: targetThreadId } : undefined,
        )
        finalizeStreamStatsForMessage(id, {
          completedAt: Date.now(),
          cancelled: true,
          threadId: targetThreadId,
        })
      }
      const stopNote = reason || 'Stop requested. Stopping after current action.'
      if (id) {
        const targetMessage = readAssistantMessage(targetThreadId, id)
        useChatStore.getState().finalizeMessage(
          id,
          buildCancelledStreamingMessageContent(targetMessage?.content, stopNote),
          targetThreadId ? { threadId: targetThreadId } : undefined,
        )
      }
      clearBridgeQuestionUserIfMatching({
        threadId: targetThreadId,
        turnId,
      })
      useChatStore.getState().pushToolActivity({
        type: 'result',
        isError: false,
        decision: 'approved',
        threadId: targetThreadId,
        label: `Stop requested: ${reason || 'Stopping after current action.'}`,
      })
      if (id) {
        reasoningStatsByMessageId.delete(id)
        finalizeExecutionStreamCommentary({
          threadId: targetThreadId,
          turnId,
          completedAt: Date.now(),
        })
        clearMessageThreadBinding(id)
      }
    }, 'onCancelled')

    const unAgentFanoutConfirmation = safeSub(
      window?.addom?.agents?.onFanoutConfirmRequest,
      (payload = {}) => {
        useChatStore.getState().setAgentFanoutConfirmRequest(payload)
        useChatStore.getState().pushToolActivity({
          type: 'pending',
          threadId: String(payload?.threadId || ''),
          turnId: String(payload?.turnId || ''),
          stepId: String(payload?.stepId || ''),
          eventKind: 'agent_delegation_fanout_confirmation',
          label: 'Agent fanout needs confirmation',
        })
      },
      'onAgentFanoutConfirmRequest',
    )
    const unAgentRunBridge = registerAgentRunEventBridge({
      agentRunsApi: window?.addom?.agentRuns,
      useAppStore,
      useAgentRunStore,
    })

    return () => {
      for (const key of toolOutputBuffers.keys()) flushToolOutputBuffer(key)
      clearBuffers()
      unsubStreamingId()
      unChunk()
      unAssistantCommentary()
      unDone()
      unError()
      unPending()
      unExecuting()
      unToolOutput()
      unResult()
      unPlanDocumentReady()
      unPlanLifecycleEvent()
      unQuestionUserRequested()
      unQuestionUserCleared()
      unReasoningChunk()
      unReasoningDone()
      unAuxSubscriptions()
      unOpenAISubscriptions()
      unAnthropicSubscriptions()
      unTurnState()
      unCancelled()
      unAgentFanoutConfirmation()
      unAgentRunBridge()
    }
  }, [])

  return null
}
