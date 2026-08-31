import { compactHistoryForContextWindow } from '../context-compaction.mjs'
import { stripContinuityPacketMessages, upsertContinuityPacketMessage } from './packet-injection.mjs'
import { buildCompactionHandoffPayload } from './compaction-handoff-state.mjs'
import {
  renderCompactionHandoffPrompt,
  stripCompactionHandoffMessages,
  stripCompactionVicinityMarkerMessages,
  upsertCompactionHandoffMessage,
} from './compaction-handoff-prompt.mjs'

function findCompactionMessageIndex(history = []) {
  const rows = Array.isArray(history) ? history : []
  return rows.findIndex((row) => {
    const role = String(row?.role || '').trim().toLowerCase()
    const content = String(row?.content || '')
    return role === 'system' && content.includes('[ADDOM Context Compaction')
  })
}

export async function applyContinuityCompaction({
  history = [],
  modelLimit = 0,
  packetText = '',
  providerId = '',
  threadId = '',
  model = '',
  apiKey = '',
  turnId = '',
  abortSignal = null,
} = {}) {
  const strippedPackets = stripContinuityPacketMessages(history)
  const withoutPackets = Array.isArray(strippedPackets.history) ? strippedPackets.history : []
  const strippedHandoff = stripCompactionHandoffMessages(withoutPackets)
  const baseHistory = Array.isArray(strippedHandoff.history) ? strippedHandoff.history : []
  const compaction = await compactHistoryForContextWindow(baseHistory, {
    modelLimit: Number(modelLimit || 0) || 0,
    softThreshold: 0.85,
    hardThreshold: 0.92,
    providerId,
    model,
    apiKey,
    abortSignal,
  })
  if (!compaction?.compacted) {
    const packet = String(packetText || '').trim()
    const historyWithPacket = packet
      ? upsertContinuityPacketMessage(baseHistory, packet)
      : [...baseHistory]
    return {
      compacted: false,
      history: historyWithPacket,
      compaction,
      replacedWithPacket: false,
    }
  }

  const nextHistory = Array.isArray(compaction.history) ? [...compaction.history] : []
  let replacedWithPacket = false
  const packet = String(packetText || '').trim()
  if (packet) {
    const idx = findCompactionMessageIndex(nextHistory)
    if (idx >= 0) {
      nextHistory[idx] = { role: 'system', content: packet }
      replacedWithPacket = true
    }
    const dedupedHistory = upsertContinuityPacketMessage(nextHistory, packet)
    const handoffPayload = buildCompactionHandoffPayload({
      compactionEvent: {
        occurred: true,
        type: 'local_summary',
        phase: 'resumed_after',
        providerId,
        turnId,
        source: 'local',
        confidence: 'explicit',
      },
      historyBeforeCompaction: baseHistory,
      removedMessages: Array.isArray(compaction?.removedMessages) ? compaction.removedMessages : [],
      compactedHistory: dedupedHistory,
      threadId,
    })
    const handoffBudget = Number(modelLimit || 0) > 0
      ? Math.max(140, Math.min(420, Math.round(Number(modelLimit || 0) * 0.015)))
      : 260
    const handoffText = renderCompactionHandoffPrompt(handoffPayload, {
      tokenBudget: handoffBudget,
    })
    const historyWithHandoff = upsertCompactionHandoffMessage(dedupedHistory, handoffText)
    const historyWithoutVicinityMarker = stripCompactionVicinityMarkerMessages(historyWithHandoff).history
    return {
      compacted: true,
      history: historyWithoutVicinityMarker,
      compaction: {
        ...compaction,
      },
      replacedWithPacket,
      handoffInjected: !!handoffText,
    }
  }

  const handoffPayload = buildCompactionHandoffPayload({
    compactionEvent: {
      occurred: true,
      type: 'local_summary',
      phase: 'resumed_after',
      providerId,
      turnId,
      source: 'local',
      confidence: 'explicit',
    },
    historyBeforeCompaction: baseHistory,
    removedMessages: Array.isArray(compaction?.removedMessages) ? compaction.removedMessages : [],
    compactedHistory: nextHistory,
    threadId,
  })
  const handoffBudget = Number(modelLimit || 0) > 0
    ? Math.max(140, Math.min(420, Math.round(Number(modelLimit || 0) * 0.015)))
    : 260
  const handoffText = renderCompactionHandoffPrompt(handoffPayload, {
    tokenBudget: handoffBudget,
  })
  const historyWithHandoff = upsertCompactionHandoffMessage(nextHistory, handoffText)
  const historyWithoutVicinityMarker = stripCompactionVicinityMarkerMessages(historyWithHandoff).history
  return {
    compacted: true,
    history: historyWithoutVicinityMarker,
    compaction: {
      ...compaction,
    },
    replacedWithPacket,
    handoffInjected: !!handoffText,
  }
}
