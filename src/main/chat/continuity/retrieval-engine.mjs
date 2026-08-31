import {
  listContinuityFacts,
  listContinuityInvariants,
  listContinuitySnapshots,
} from './continuity-store.mjs'

export function retrieveContinuityContext({
  threadId = '',
  factLimit = 20,
  invariantLimit = 12,
  snapshotLimit = 4,
} = {}) {
  const facts = listContinuityFacts({
    threadId,
    limit: Math.max(1, factLimit),
  }).slice(0, Math.max(1, factLimit))

  const invariants = listContinuityInvariants({
    threadId,
    limit: Math.max(1, invariantLimit),
  }).slice(0, Math.max(1, invariantLimit))

  const snapshots = listContinuitySnapshots({
    threadId,
    limit: Math.max(1, snapshotLimit),
  }).slice(0, Math.max(1, snapshotLimit))

  return {
    facts,
    invariants,
    snapshots,
    retrievalMeta: {
      scope: 'thread_only',
      requestedFactLimit: factLimit,
      selectedFacts: facts.length,
      selectedInvariants: invariants.length,
      selectedSnapshots: snapshots.length,
      deterministicThreadLocal: true,
    },
  }
}
