import { buildScopedContextPayload } from '../memory/memory-store.mjs'
import { estimateSingleTurnCost } from './chat-cost-estimator.mjs'
import { OLLAMA_TOOL_FORMAT_PROMPT } from './prompt-constants.mjs'
import { stripMoaOrchestratorPrompt } from './moa-prompts.mjs'
import { upsertExecutionBriefPrompt } from './execution-brief-prompt.mjs'
import { estimateTextTokens } from './token-utils.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'

function stripLegacyMoaRoleCatalogPrompt(content = '') {
  return String(content ?? '')
    .replace(/\n?\[MoA ROLE CATALOG\][\s\S]*?\[MoA ROLE CATALOG END\]\n?/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function bootstrapTurnHistory({
  history = [],
  mode = 'execute',
  modeSystemPrompt = '',
  runtimeContextBlock = '',
  planModePrompt = '',
  thinkModePrompt = '',
  providerId = '',
  model = '',
  modelContext = { limitTokens: 0, maxOutputTokens: null, source: 'estimated' },
  userMessage = '',
  projectFolder = '',
  activeThreadId = '',
  activeTurnId = '',
  ollamaToolPromptEnabled = false,
  delegationAvailable = false,
  includeGlobalMemoryInContext = false,
  executionBriefPrompt = '',
  emitPromptComposition = false,
  authMethod = '',
  promptBudgetProfile = null,
  errorDiagnostics = null,
  send = () => {},
  persistTimelineEvent = () => {},
} = {}) {
  let historyWithMemory = Array.isArray(history) ? [...history] : []
  let injectedMemoryBlock = ''

  const existingSysIdx = historyWithMemory.findIndex((m) => m.role === 'system')
  if (existingSysIdx >= 0) {
    const existingContent = String(historyWithMemory[existingSysIdx].content ?? '')
    if (!existingContent.startsWith('You are ADDOM')) {
      const ollamaExtra = ollamaToolPromptEnabled ? '\n\n' + OLLAMA_TOOL_FORMAT_PROMPT : ''
      historyWithMemory[existingSysIdx] = {
        ...historyWithMemory[existingSysIdx],
        content: stripLegacyMoaRoleCatalogPrompt(upsertExecutionBriefPrompt(
          modeSystemPrompt + ollamaExtra + '\n\n' + stripMoaOrchestratorPrompt(existingContent),
          executionBriefPrompt,
        )),
      }
    } else {
      let nextContent = stripMoaOrchestratorPrompt(
        String(modeSystemPrompt || '').trim() || existingContent,
      )
      if (mode === 'plan' && !nextContent.includes('PLAN MODE INSTRUCTIONS:')) {
        nextContent = nextContent + '\n\n' + planModePrompt
      }
      if (mode === 'thinking' && !nextContent.includes('THINKING MODE INSTRUCTIONS:')) {
        nextContent = nextContent + '\n\n' + thinkModePrompt
      }
      if (!nextContent.includes('[ADDOM Runtime Context]')) {
        nextContent = nextContent + '\n\n' + runtimeContextBlock
      }
      if (ollamaToolPromptEnabled && !nextContent.includes('[OLLAMA TOOL-CALL FORMAT]')) {
        nextContent = nextContent + '\n\n' + OLLAMA_TOOL_FORMAT_PROMPT
      }
      nextContent = upsertExecutionBriefPrompt(nextContent, executionBriefPrompt)
      nextContent = stripLegacyMoaRoleCatalogPrompt(nextContent)
      if (nextContent !== existingContent) {
        historyWithMemory[existingSysIdx] = {
          ...historyWithMemory[existingSysIdx],
          content: nextContent,
        }
      }
    }
  } else {
    const newSysContent = ollamaToolPromptEnabled
      ? modeSystemPrompt + '\n\n' + OLLAMA_TOOL_FORMAT_PROMPT
      : modeSystemPrompt
    historyWithMemory = [{
      role: 'system',
      content: upsertExecutionBriefPrompt(newSysContent, executionBriefPrompt),
    }, ...historyWithMemory]
  }

  if (projectFolder && userMessage) {
    try {
      const memoryMaxNodes = Number(promptBudgetProfile?.memoryMaxNodes || 8) || 8
      const threadQuota = Math.min(4, memoryMaxNodes)
      const remainingAfterThread = Math.max(0, memoryMaxNodes - threadQuota)
      const projectQuota = Math.min(2, remainingAfterThread)
      const remainingAfterProject = Math.max(0, remainingAfterThread - projectQuota)
      const globalQuota = Math.min(1, remainingAfterProject)
      const memoryPayload = await buildScopedContextPayload({
        project: projectFolder,
        threadId: activeThreadId,
        queryText: userMessage,
        quotas: {
          thread: threadQuota,
          project: projectQuota,
          global: globalQuota,
        },
        includeGlobal: !!includeGlobalMemoryInContext,
        maxTokens: Number(promptBudgetProfile?.memoryBudgetTokens || 0) || 0,
      })
      const memBlock = String(memoryPayload?.text || '')
      if (memBlock) {
        injectedMemoryBlock = memBlock
        const sysIdx = historyWithMemory.findIndex((m) => m.role === 'system')
        historyWithMemory[sysIdx] = {
          ...historyWithMemory[sysIdx],
          content: historyWithMemory[sysIdx].content + '\n\n' + memBlock,
        }
        const memoryDiagnostics = memoryPayload?.diagnostics && typeof memoryPayload.diagnostics === 'object'
          ? memoryPayload.diagnostics
          : {}
        const nodeCount = Number(memoryDiagnostics.nodeCount || 0) || (memBlock.match(/^- /gm) || []).length
        const estimatedTokens = Number(memoryDiagnostics.estimatedTokens || 0) || estimateTextTokens(memBlock)
        const laneNodeCounts = memoryDiagnostics?.laneNodeCounts && typeof memoryDiagnostics.laneNodeCounts === 'object'
          ? { ...memoryDiagnostics.laneNodeCounts }
          : { thread: 0, project: 0, global: 0 }
        const laneEstimatedTokens = memoryDiagnostics?.laneEstimatedTokens && typeof memoryDiagnostics.laneEstimatedTokens === 'object'
          ? { ...memoryDiagnostics.laneEstimatedTokens }
          : { thread: 0, project: 0, global: 0 }
        const promotionCounts = memoryDiagnostics?.promotionCounts && typeof memoryDiagnostics.promotionCounts === 'object'
          ? { ...memoryDiagnostics.promotionCounts }
          : { thread: 0, project: 0, global: 0 }
        send('memory:context-injected', {
          nodeCount,
          includeGlobal: !!includeGlobalMemoryInContext,
          estimatedTokens,
          laneNodeCounts,
          laneEstimatedTokens,
          promotionCounts,
          budgetTokens: Number(memoryDiagnostics.maxTokens || 0) || 0,
          budgetReductionApplied: memoryDiagnostics.budgetReductionApplied === true,
          nodeCountBeforeBudget: Number(memoryDiagnostics.nodeCountBeforeBudget || nodeCount) || nodeCount,
        })
        if (errorDiagnostics && typeof errorDiagnostics === 'object') {
          errorDiagnostics.memoryContextNodeCount = nodeCount
          errorDiagnostics.memoryContextEstimatedTokens = estimatedTokens
          errorDiagnostics.memoryContextLaneCounts = laneNodeCounts
          errorDiagnostics.memoryContextLaneEstimatedTokens = laneEstimatedTokens
          errorDiagnostics.memoryContextPromotionCounts = promotionCounts
          errorDiagnostics.memoryContextBudgetTokens = Number(memoryDiagnostics.maxTokens || 0) || 0
          errorDiagnostics.memoryContextNodeCountBeforeBudget = Number(memoryDiagnostics.nodeCountBeforeBudget || nodeCount) || nodeCount
          errorDiagnostics.memoryContextBudgetReductionApplied = memoryDiagnostics.budgetReductionApplied === true
        }
      }
    } catch {
      // Non-fatal.
    }
  }

  const sysIdx = historyWithMemory.findIndex((m) => m.role === 'system')
  const systemPromptContent = sysIdx >= 0 ? String(historyWithMemory[sysIdx]?.content ?? '') : ''
  const promptCompositionPayload = {
    threadId: activeThreadId,
    turnId: activeTurnId,
    mode,
    delegationAvailable: !!delegationAvailable,
    systemPromptTokens: estimateTextTokens(systemPromptContent),
    runtimeContextTokens: estimateTextTokens(runtimeContextBlock),
    executionBriefTokens: estimateTextTokens(executionBriefPrompt),
    memoryContextTokens: estimateTextTokens(injectedMemoryBlock),
    moaControlPromptTokens: 0,
    roleCatalogTokens: 0,
    roleCatalogInjected: false,
    emittedAt: Date.now(),
  }
  if (emitPromptComposition) {
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'prompt_composition',
      options: {
        role: 'system',
        content: `Prompt composition: system=${promptCompositionPayload.systemPromptTokens} tokens, execution_brief=${promptCompositionPayload.executionBriefTokens}, role_catalog=${promptCompositionPayload.roleCatalogTokens}, memory=${promptCompositionPayload.memoryContextTokens}.`,
        meta: promptCompositionPayload,
      },
      channel: 'chat:prompt-composition', payload: promptCompositionPayload,
    })
  }

  if (!delegationAvailable) {
    const preTurnCostEstimate = estimateSingleTurnCost({
      providerId,
      model: model ?? '',
      mode,
      history: historyWithMemory,
      modelContext,
    })
    const costEstimatePayload = {
      ...preTurnCostEstimate,
      threadId: activeThreadId,
      turnId: activeTurnId,
      authMethod: String(authMethod || '').trim().toLowerCase(),
      emittedAt: Date.now(),
    }
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'chat_cost_estimate',
      options: {
        role: 'system',
        content: Number.isFinite(Number(costEstimatePayload.estimatedUsd))
          ? `Pre-turn estimate: ${costEstimatePayload.estimatedTotalTokens} tokens (~$${Number(costEstimatePayload.estimatedUsd).toFixed(4)}).`
          : `Pre-turn estimate: ${costEstimatePayload.estimatedTotalTokens} tokens.`,
        meta: costEstimatePayload,
      },
      channel: 'chat:cost-estimate', payload: costEstimatePayload,
    })
  }

  return historyWithMemory
}
