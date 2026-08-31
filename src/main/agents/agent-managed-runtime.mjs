import { randomUUID } from 'node:crypto'
import { createAgentApprovalRouter } from './agent-approval-router.mjs'
import { createAgentContextService } from './agent-context-service.mjs'
import { createAgentControllerRegistry } from './agent-controller-registry.mjs'
import { createAgentControlService } from './agent-control-service.mjs'
import { createAgentEventStore } from './agent-event-store.mjs'
import { createManagedExecutionLauncher } from './agent-managed-execution-launcher.mjs'
import { failOrRetryManagedAttempt } from './agent-managed-attempt-retry.mjs'
import {
  createManagedChildContracts, rebuildManagedContextPacketFromTask, resolveManagedChildAuthority,
} from './agent-managed-child-contracts.mjs'
import { createManagedEventDrafts } from './agent-managed-event-drafts.mjs'
import { completeManagedAttemptWithFinalMessage } from './agent-managed-final-message.mjs'
import { createManagedConversationContinuation, createManagedFollowup } from './agent-managed-followup.mjs'
import { createManagedInterrupt } from './agent-managed-interrupt.mjs'
import { createManagedOwnership } from './agent-managed-ownership.mjs'
import { createManagedRunExecutor } from './agent-managed-run-executor.mjs'
import { createManagedRunLifecycle } from './agent-managed-run-lifecycle.mjs'
import { createManagedManualRetry } from './agent-managed-manual-retry.mjs'
import { createManagedSendMessage } from './agent-managed-message.mjs'
import { startManagedRuntimeRecovery } from './agent-managed-runtime-recovery.mjs'
import { createManagedRuntimeShutdown } from './agent-managed-runtime-shutdown.mjs'
import { createAgentConversationRepository } from './agent-conversation-repository.mjs'
import { createAgentConversationMailboxService } from './agent-conversation-mailbox-service.mjs'
import { createManagedChildConversationOwnership, createManagedContinuationOwnership } from './agent-managed-conversation-ownership.mjs'
import { createManagedConversationLifecycle } from './agent-managed-conversation-lifecycle.mjs'
import { createManagedTerminalContinuations } from './agent-managed-terminal-continuations.mjs'
import { createAgentRunFinalizer } from './agent-run-finalizer.mjs'
import { clipAgentError, isManagedDescendant } from './agent-managed-runtime-values.mjs'
import { createManagedProviderEventAppender } from './agent-managed-provider-event-appender.mjs'
import { createAgentRunRepository } from './agent-run-repository.mjs'
import { createAgentRunService } from './agent-run-service.mjs'
import { createManagedRuntimeDiagnostics } from './agent-managed-runtime-diagnostics.mjs'
import { createAgentScheduler } from './agent-scheduler.mjs'
import { createManagedWorkspaceServices } from './workspaces/agent-managed-workspace-services.mjs'
import { createOpenAIAccountCollaborationProjection } from './openai-account-collaboration-projection.mjs'
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])
export function createManagedAgentRuntime({
  db,
  adapterRegistry,
  resolveChildRoute,
  now = Date.now,
  idFactory = (prefix) => `${prefix}_${randomUUID()}`,
  scheduler: providedScheduler = null,
  workspaceStorageRoot = null,
} = {}) {
  if (!db || !adapterRegistry) throw new TypeError('db and adapterRegistry are required')
  const diagnosticInstrumentation = createManagedRuntimeDiagnostics({ db, idFactory, now })
  const runtimeDiagnostics = diagnosticInstrumentation.store
  const eventStore = createAgentEventStore(db, { diagnostics: runtimeDiagnostics })
  const repository = createAgentRunRepository(db)
  const conversationRepository = createAgentConversationRepository(db)
  const conversationMailbox = createAgentConversationMailboxService({
    repository: conversationRepository,
    now,
    leaseIdFactory: () => idFactory('mailbox_lease'),
  })
  const conversationLifecycle = createManagedConversationLifecycle({ repository: conversationRepository, now })
  const executionInputs = new Map()
  const workspaceServices = createManagedWorkspaceServices({
    db,
    eventStore,
    storageRoot: workspaceStorageRoot,
    now,
    idFactory,
    diagnostics: runtimeDiagnostics,
  })
  const {
    ensureRecovery: ensureWorkspaceRecovery,
    mergeQueue,
    workspaceCleanup,
    workspaceManager,
  } = workspaceServices
  const scheduler = providedScheduler || createAgentScheduler(db, {
    diagnostics: runtimeDiagnostics,
    now,
  })
  const runService = createAgentRunService(db, {
    eventStore,
    repository,
    scheduler,
    now,
    attemptIdFactory: () => idFactory('attempt'),
  })
  const controllerRegistry = createAgentControllerRegistry()
  const terminalContinuations = createManagedTerminalContinuations({
    conversationLifecycle, conversationRepository, eventStore, executionInputs,
    idFactory, now, repository,
  })
  const controlService = createAgentControlService({
    registry: controllerRegistry,
    runService,
    scheduler,
    diagnostics: runtimeDiagnostics,
    onAttemptsCancelled: terminalContinuations.cancelMany,
  })
  const { messageBroker } = terminalContinuations
  const contextService = createAgentContextService({ eventStore, repository, now })
  const approvalRouter = createAgentApprovalRouter({
    eventStore,
    repository,
    now,
    idFactory: () => idFactory('approval'),
    diagnostics: runtimeDiagnostics,
  })
  const sessionsByAttempt = new Map()
  const resultsByNode = new Map()
  const activeExecutions = new Map()
  const suspendedContinuations = new Map()
  const runPolicies = new Map()
  const runRouteResolvers = new Map()
  let drainConversationFollowup = async () => null
  const { draft, statusDraft } = createManagedEventDrafts({ now })
  const { requireOwnedTarget, requireOwner } = createManagedOwnership({ repository })
  const runtimeLifecycle = startManagedRuntimeRecovery({
    db, diagnostics: runtimeDiagnostics, ensureWorkspaceRecovery, now,
    registry: controllerRegistry, runService, scheduler,
  })
  const { createRun, ensureRunRoute, syncRunCounts } = createManagedRunLifecycle({
    eventStore,
    repository,
    runPolicies,
    now,
    idFactory,
    draft,
    statusDraft,
  })
  const runFinalizer = createAgentRunFinalizer({ eventStore, repository, now })
  const collaborationProjection = createOpenAIAccountCollaborationProjection({
    adapterRegistry,
    createRun,
    db,
    draft,
    eventStore,
    idFactory,
    now,
    repository,
    runFinalizer,
    syncRunCounts,
  })
  const appendProviderEvent = createManagedProviderEventAppender({
    collaborationProjection,
    draft,
    eventStore,
    repository,
  })
  async function spawnChild({
    owner,
    task,
    role,
    apiKey,
    projectFolder,
    background = false,
    capabilitySnapshot = null,
    agentRuntime = {},
    conversationClaim = null,
  }) {
    const spawnStartedAt = diagnosticInstrumentation.beginSpawn()
    const graph = repository.getRunGraph(owner.runId)
    if (!graph) throw new TypeError(`Agent run ${owner.runId} was not found`)
    const parent = graph.nodes.find((node) => node.id === owner.nodeId)
    if (!parent) throw new TypeError(`Parent node ${owner.nodeId} was not found`)
    const adapter = adapterRegistry.resolve('addom-managed')
    const snapshot = capabilitySnapshot || await adapter.probe({
      providerId: role.providerId,
      modelId: role.model,
      capturedAt: now(),
      context: { projectId: graph.run.projectId, threadId: graph.run.threadId },
    })
    await ensureRunRoute(graph.run.id, snapshot)
    const createdAt = now()
    const authority = resolveManagedChildAuthority({ parent, role, snapshot })
    const identity = {
      nodeId: idFactory('agent'),
      attemptId: idFactory('attempt'),
      spawnRequestId: idFactory('spawn'),
    }
    const expiresAt = createdAt + graph.run.budgetSnapshot.maxDurationMs
    const preparedWorkspace = await workspaceManager.prepare({
      workspaceId: idFactory('workspace'),
      projectRoot: projectFolder,
      providerWorkspaceId: agentRuntime?.providerWorkspaceId,
      permissionSnapshot: authority.permissionSnapshot,
      capabilitySnapshot: snapshot.nodeCapabilities,
      expiresAt,
    })
    const workspaceLease = {
      leaseId: idFactory('workspace_lease'),
      workspaceId: preparedWorkspace.id,
      workspaceMode: preparedWorkspace.mode,
      baseRevision: preparedWorkspace.baseRevision,
      expiresAt,
    }
    const {
      attempt,
      contextPacket,
      node,
      parentAttemptId,
      reservations,
      spawnRequestId,
    } = createManagedChildContracts({
      graph,
      parent,
      owner,
      task,
      role,
      snapshot,
      background,
      adapterId: adapter.adapterId,
      createdAt,
      idFactory,
      authority,
      identity,
      workspaceLease,
    })
    const nodeId = node.id
    const attemptId = attempt.id
    const ownershipEvents = [
      draft('agent_spawn_requested', {
        runId: graph.run.id,
        nodeId: parent.id,
        parentNodeId: parent.parentNodeId,
        attemptId: graph.attempts.some((attempt) => attempt.id === owner.attemptId)
          ? owner.attemptId
          : null,
        payload: {
          spawnRequestId,
          parentAttemptId,
          taskSummary: node.taskSummary,
        },
        suffix: `${spawnRequestId}:requested`,
      }),
      draft('agent_spawn_queued', {
        runId: graph.run.id,
        nodeId: parent.id,
        parentNodeId: parent.parentNodeId,
        attemptId: null,
        payload: { spawnRequestId },
        suffix: `${spawnRequestId}:queued`,
      }),
      draft('agent_spawned', {
        runId: graph.run.id,
        nodeId,
        parentNodeId: parent.id,
        attemptId: null,
        payload: {
          spawnRequestId,
          childNodeId: nodeId,
          node,
        },
        suffix: `${spawnRequestId}:spawned`,
      }),
    ]
    const admission = runService.queueAttempt({
      node,
      attempt,
      ownershipEvents,
      schedulerEntry: {
        attemptId,
        runId: graph.run.id,
        nodeId,
        parentNodeId: parent.id,
        projectId: graph.run.projectId,
        threadId: graph.run.threadId,
        providerId: snapshot.providerId,
        depth: node.depth,
        ...reservations,
        createdAt,
      },
      createOwnership: conversationClaim
        ? createManagedContinuationOwnership({
            attempt, claim: conversationClaim, conversationRepository, createdAt, node,
          })
        : createManagedChildConversationOwnership({
            attempt, conversationRepository, createdAt, graph, node, owner, parent, task,
          }),
    })
    if (!admission.admitted) {
      await workspaceManager.discardPrepared(preparedWorkspace)
      throw new TypeError(`Agent spawn rejected: ${admission.reason}`)
    }
    const activation = workspaceManager.activate(preparedWorkspace, {
      runId: graph.run.id,
      nodeId,
      attemptId,
      projectId: graph.run.projectId,
    })
    const executionInput = {
      task,
      role,
      apiKey,
      projectFolder: preparedWorkspace.projectViewRoot || projectFolder,
      sourceProjectFolder: projectFolder,
      workspace: preparedWorkspace,
      workspaceReady: activation,
      workspaceAttempts: new Map(),
      adapter,
      contextPacket,
      inbox: [],
      agentRuntime,
    }
    executionInput.workspaceAttempts.set(attemptId, {
      contextPacket,
      workspace: preparedWorkspace,
      workspaceReady: activation,
    })
    executionInputs.set(nodeId, executionInput)
    let workspace = null
    try {
      workspace = await activation
      executionInput.workspace = workspace
    } catch (error) {
      runService.failAttempt({
        attemptId,
        errorSummary: clipAgentError(error, 'Agent workspace activation failed.'),
        errorCode: 'AGENT_WORKSPACE_ACTIVATION_FAILED',
        retryable: false,
      })
      conversationLifecycle.fail(attemptId)
      await workspaceManager.discardPrepared(preparedWorkspace).catch(() => {})
      throw error
    }
    syncRunCounts(graph.run.id)
    contextService.deliver({
      runId: graph.run.id,
      packet: contextPacket,
    })
    diagnosticInstrumentation.recordSpawn(spawnStartedAt, { graph, nodeId, attemptId, snapshot, workspace })
    return { nodeId, attemptId }
  }
  async function executeEntry(entry) {
    const input = executionInputs.get(entry.nodeId)
    if (!input) throw new TypeError(`Execution input for ${entry.nodeId} was not found`)
    const attemptInput = input.workspaceAttempts.get(entry.attemptId)
    if (!attemptInput) {
      throw new TypeError(`Workspace input for attempt ${entry.attemptId} was not found`)
    }
    let workspace = null
    let graph = null
    let node = null
    let attempt = null
    let session = null
    try {
      workspace = await attemptInput.workspaceReady
      attemptInput.workspace = workspace
      graph = repository.getRunGraph(entry.runId)
      node = graph.nodes.find((candidate) => candidate.id === entry.nodeId)
      attempt = graph.attempts.find((candidate) => candidate.id === entry.attemptId)
      const inbox = input.inbox
      const owner = {
        runId: entry.runId,
        nodeId: entry.nodeId,
        attemptId: entry.attemptId,
        depth: node.depth,
        capabilitySnapshot: node.capabilitySnapshot,
        permissionSnapshot: node.permissionSnapshot,
        policyLimits: graph.run.budgetSnapshot,
        backgroundKind: attempt.backgroundKind,
      }
      session = await input.adapter.create({
        providerId: node.providerId,
        modelId: node.modelId,
        capabilitySnapshot: node.providerCapabilitySnapshot,
        capturedAt: now(),
        appendEvent: async (providerEvent) => appendProviderEvent({
          ...entry,
          adapterId: input.adapter.adapterId,
        }, providerEvent),
        context: {
          task: input.task,
          role: input.role,
          apiKey: input.apiKey,
          projectFolder: workspace.projectViewRoot || input.sourceProjectFolder,
          contextPacket: attemptInput.contextPacket,
          emitLegacy: input.agentRuntime?.emitLegacy,
          onMessage: async (message) => inbox.push(message),
          runtime: {
            ...(input.agentRuntime || {}),
            projectId: graph.run.projectId,
            threadId: graph.run.threadId,
            turnId: graph.run.turnId,
            agentWorkspace: workspace,
            sourceProjectFolder: input.sourceProjectFolder,
            managedAgentRuntime: runtime,
            agentCollaborationContext: owner,
            consumeAgentMessages: () => inbox.splice(0),
          },
        },
      })
      const correlation = `${input.adapter.adapterId}:${session.providerSessionId}`
      const startedAt = now()
      graph = repository.getRunGraph(entry.runId)
      node = graph.nodes.find((candidate) => candidate.id === entry.nodeId)
      attempt = graph.attempts.find((candidate) => candidate.id === entry.attemptId)
      const runningNode = {
        ...node,
        status: 'running',
        providerThreadId: session.providerSessionId,
        attemptId: attempt.id,
        startedAt: node.startedAt ?? startedAt,
      }
      const runningAttempt = {
        ...attempt,
        status: 'running',
        providerRequestId: session.providerSessionId,
        providerCorrelationKey: correlation,
        reconciliationState: 'matched',
        startedAt: attempt.startedAt ?? startedAt,
      }
      eventStore.append(draft('agent_started', {
        runId: entry.runId,
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        attemptId: attempt.id,
        providerCorrelationKey: correlation,
        payload: {
          attemptId: attempt.id,
          node: runningNode,
          attempt: runningAttempt,
        },
        suffix: attempt.id,
      }))
      conversationLifecycle.markRunning(attempt.id)
      syncRunCounts(entry.runId)
      controllerRegistry.register({
        attemptId: attempt.id,
        runId: entry.runId,
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        backgroundKind: attempt.backgroundKind,
        supportsCancellation: session.capabilitySnapshot.runCapabilities.cancel,
        onCancel: (reason) => {
          void input.adapter.cancel(session.sessionId, { reason })
        },
      })
      sessionsByAttempt.set(attempt.id, { adapter: input.adapter, session })
      const providerResult = await input.adapter.start(session.sessionId)
      const artifacts = await workspaceManager.captureArtifacts({
        workspaceId: workspace.id,
      })
      const result = {
        ...providerResult,
        artifacts,
        stagedChanges: artifacts,
      }
      resultsByNode.set(node.id, result)
      const latestAttempt = repository.getRunGraph(entry.runId)
        .attempts.find((candidate) => candidate.id === attempt.id)
      if (TERMINAL_STATUSES.has(latestAttempt?.status)) return
      if (result.status === 'completed') {
        completeManagedAttemptWithFinalMessage({
          correlation, conversationRepository, db, draft, entry, eventStore, messageBroker, node, result,
          runService, syncRunCounts,
        })
      } else {
        await failOrRetryManagedAttempt({
          createRetryOwnership: (retryAttemptId) => conversationLifecycle.bindRetry({
            sourceAttemptId: attempt.id, retryAttemptId,
          }),
          onRetryWaiting: conversationLifecycle.markWaiting,
          onTerminalFailure: (failedAttemptId) => {
            terminalContinuations.fail({
              attemptId: failedAttemptId,
              conclusion: typeof result.summary === 'string' && result.summary.trim()
                ? result.summary.trim()
                : typeof result.errorCode === 'string' && result.errorCode.trim()
                  ? result.errorCode.trim()
                  : 'Child turn failed.',
            })
          },
          runService,
          result,
          attempt,
          graph,
          prepareRetry: async () => {
            const retryAttemptId = idFactory('attempt')
            const retryExpiresAt = now() + graph.run.budgetSnapshot.maxDurationMs
            const prepared = await workspaceManager.prepare({
              workspaceId: idFactory('workspace'),
              projectRoot: input.sourceProjectFolder,
              providerWorkspaceId: input.agentRuntime?.providerWorkspaceId,
              permissionSnapshot: attempt.permissionSnapshot,
              capabilitySnapshot: attempt.capabilitySnapshot,
              expiresAt: retryExpiresAt,
            })
            const workspaceLease = {
              leaseId: idFactory('workspace_lease'),
              workspaceId: prepared.id,
              workspaceMode: prepared.mode,
              baseRevision: prepared.baseRevision,
              expiresAt: retryExpiresAt,
            }
            const contextPacket = rebuildManagedContextPacketFromTask({
              priorPacket: input.contextPacket,
              task: input.task,
              packetId: idFactory('context'),
              workspaceLease,
              createdAt: now(),
              idFactory,
            })
            return {
              attemptId: retryAttemptId,
              contextPacket,
              prepared,
              workspaceLease,
            }
          },
          activateRetry: async (retry) => {
            const ready = (async () => {
              const activated = await workspaceManager.activate(retry.prepared, {
                runId: entry.runId,
                nodeId: entry.nodeId,
                attemptId: retry.attemptId,
                projectId: graph.run.projectId,
              })
              contextService.deliver({
                runId: entry.runId,
                packet: retry.contextPacket,
              })
              return activated
            })()
            input.workspaceAttempts.set(retry.attemptId, {
              contextPacket: retry.contextPacket,
              workspace: retry.prepared,
              workspaceReady: ready,
            })
            await ready
          },
          discardRetry: async (retry) => {
            if (!retry) return
            input.workspaceAttempts.delete(retry.attemptId)
            await workspaceManager.discardPrepared(retry.prepared).catch(() => {})
          },
        })
        syncRunCounts(entry.runId)
      }
    } catch (error) {
      if (scheduler.get(entry.attemptId)) {
        const errorSummary = clipAgentError(error)
        runService.failAttempt({
          attemptId: entry.attemptId,
          errorSummary,
          errorCode: 'AGENT_EXECUTION_FAILED',
          retryable: false,
        })
        terminalContinuations.fail({
          attemptId: entry.attemptId,
          conclusion: errorSummary,
        })
        syncRunCounts(entry.runId)
      }
      resultsByNode.set(entry.nodeId, {
        status: 'failed',
        summary: clipAgentError(error),
        errorCode: 'AGENT_EXECUTION_FAILED',
      })
    } finally {
      const latestAttempt = repository.getRunGraph(entry.runId)?.attempts
        .find((candidate) => candidate.id === entry.attemptId)
      if (TERMINAL_STATUSES.has(latestAttempt?.status)) {
        await drainConversationFollowup({
          owner: { runId: entry.runId, nodeId: entry.nodeId, attemptId: entry.attemptId },
        }).catch((error) => {
          console.warn('[agent-conversation] queued follow-up could not be admitted', error?.message || error)
        })
      }
      controllerRegistry.unregister(entry.attemptId)
      sessionsByAttempt.delete(entry.attemptId)
      if (session) await input.adapter.dispose(session.sessionId)
      const terminalWorkspace = workspaceManager.markTerminal({ attemptId: entry.attemptId })
      if (terminalWorkspace && terminalWorkspace.status !== 'reviewable') {
        await workspaceCleanup.cleanupWorkspace(terminalWorkspace.id).catch(() => {})
      }
    }
  }
  const launch = createManagedExecutionLauncher({
    activeExecutions, draft, eventStore, executeEntry, repository,
    runtimeLifecycle, suspendedContinuations,
  })
  async function pumpUntil(predicate) {
    while (!predicate()) {
      let claimed = false
      while (true) {
        const entry = runService.claimNext()
        if (!entry) break
        claimed = true
        launch(entry)
      }
      if (predicate()) return
      if (activeExecutions.size > 0) {
        await Promise.race(activeExecutions.values())
        continue
      }
      if (!claimed) throw new TypeError('Managed agent scheduler stalled with unfinished work')
    }
  }
  async function spawnAgent({
    owner,
    task,
    role: roleLabel,
    providerId,
    modelId,
    background = false,
  }) {
    const { node } = requireOwner(owner)
    const policy = runPolicies.get(owner.runId)
    if (node.depth >= policy.effectiveLimits.maxDepth) {
      throw new TypeError('Agent spawn rejected: max_depth')
    }
    const routeResolver = runRouteResolvers.get(owner.runId) || resolveChildRoute
    if (typeof routeResolver !== 'function') {
      throw new TypeError('No managed child route resolver is configured')
    }
    const route = await routeResolver({
      owner,
      providerId,
      modelId,
      role: roleLabel,
      task,
      parentRole: executionInputs.get(owner.nodeId)?.role || null,
    })
    return spawnChild({
      owner,
      task: {
        task_id: idFactory('task'),
        instruction: task,
        injected_context: `Delegated by ${node.roleLabel}.`,
        expected_output_format: 'Return a concise result to the parent agent.',
      },
      role: route.role,
      apiKey: route.apiKey,
      projectFolder: route.projectFolder,
      background,
      agentRuntime: route.agentRuntime || {},
    })
  }
  async function waitAgent({ owner, targetNodeId }) {
    const { target } = requireOwnedTarget(owner, targetNodeId)
    let graph = repository.getRunGraph(owner.runId)
    let currentTarget = graph.nodes.find((node) => node.id === target.id)
    if (!TERMINAL_STATUSES.has(currentTarget.status)) {
      const ownerAttempt = graph.attempts.find((attempt) => attempt.id === owner.attemptId)
      const ownerNode = graph.nodes.find((node) => node.id === owner.nodeId)
      const waitingNode = { ...ownerNode, status: 'waiting' }
      const waitingAttempt = { ...ownerAttempt, status: 'waiting' }
      eventStore.appendMany([
        statusDraft(
          'node',
          ownerNode.status,
          'waiting',
          waitingNode,
          waitingAttempt,
          `wait:${target.id}`,
        ),
        statusDraft(
          'attempt',
          ownerAttempt.status,
          'waiting',
          waitingAttempt,
          waitingAttempt,
          `wait:${target.id}`,
        ),
        draft('agent_waiting', {
          runId: owner.runId,
          nodeId: owner.nodeId,
          parentNodeId: ownerNode.parentNodeId,
          attemptId: owner.attemptId,
          payload: { reason: `waiting_for:${target.id}` },
          suffix: `${owner.attemptId}:${target.id}`,
        }),
      ])
      if (!scheduler.suspendAttempt(owner.attemptId)) {
        throw new TypeError(`Attempt ${owner.attemptId} could not release its scheduler lease`)
      }
      const grant = new Promise((resolve) => {
        suspendedContinuations.set(owner.attemptId, { resolve })
      })
      await pumpUntil(() => {
        const latest = repository.getRunGraph(owner.runId)
          .nodes.find((node) => node.id === target.id)
        return TERMINAL_STATUSES.has(latest.status)
      })
      scheduler.resumeWaiting(owner.attemptId)
      await pumpUntil(() => !suspendedContinuations.has(owner.attemptId))
      await grant
      graph = repository.getRunGraph(owner.runId)
      currentTarget = graph.nodes.find((node) => node.id === target.id)
    }
    return {
      nodeId: currentTarget.id,
      status: currentTarget.status,
      resultSummary: currentTarget.resultSummary,
      errorSummary: currentTarget.errorSummary,
    }
  }
  function listAgents({ owner, scope = 'children' }) {
    const { graph, node } = requireOwner(owner)
    return graph.nodes
      .filter((candidate) => scope === 'descendants'
        ? isManagedDescendant(candidate, node.id)
        : candidate.parentNodeId === node.id)
      .map((candidate) => ({
        nodeId: candidate.id,
        parentNodeId: candidate.parentNodeId,
        role: candidate.roleLabel,
        taskSummary: candidate.taskSummary,
        status: candidate.status,
        depth: candidate.depth,
        providerId: candidate.providerId,
        modelId: candidate.modelId,
      }))
  }
  const sendMessage = createManagedSendMessage({ messageBroker, requireOwner, sessionsByAttempt })
  const managedFollowup = createManagedFollowup({
    conversationMailbox, conversationRepository, executionInputs, idFactory, now,
    pumpUntil, repository, requireOwner, requireOwnedTarget, spawnChild,
    terminalStatuses: TERMINAL_STATUSES,
  })
  const followupAgent = managedFollowup.followupAgent
  drainConversationFollowup = managedFollowup.drainConversation
  const interruptAgent = createManagedInterrupt({
    approvalRouter,
    controlService,
    requireOwnedTarget,
  })
  const retryAgent = createManagedManualRetry({
    conversationMailbox,
    conversationRepository,
    contextService,
    createContextPacket: rebuildManagedContextPacketFromTask,
    executionInputs,
    idFactory,
    now,
    pumpUntil,
    repository,
    runService,
    syncRunCounts,
    terminalStatuses: TERMINAL_STATUSES,
    workspaceManager,
  })
  const executeTaskGraph = createManagedRunExecutor({
    adapterRegistry,
    approvalRouter,
    controlService,
    createRun,
    ensureRuntimeReady: runtimeLifecycle.start,
    executionInputs,
    activeExecutions,
    now,
    pumpUntil,
    repository,
    resultsByNode,
    runFinalizer,
    runPolicies,
    runRouteResolvers,
    spawnChild,
  })
  const continueConversation = createManagedConversationContinuation({ conversationMailbox,
    conversationRepository, executeTaskGraph, idFactory, now })
  const shutdown = createManagedRuntimeShutdown({
    activeExecutions,
    controlService,
    workspaceCleanup,
    workspaceManager,
    runtimeLifecycle,
  })
  const runtime = Object.freeze({
    approvalRouter,
    controlService,
    contextService,
    continueConversation,
    eventStore,
    executeTaskGraph,
    followupAgent,
    finalizeOpenAIAccountCollaboration: collaborationProjection.finalizeOpenAIAccountCollaboration,
    ingestOpenAIAccountCollaboration: collaborationProjection.ingestOpenAIAccountCollaboration,
    materializeOpenAIAccountDiscoveredChild: collaborationProjection.materializeProviderDiscoveredChild,
    interruptAgent,
    listAgents,
    messageBroker,
    conversationMailbox,
    conversationRepository,
    mergeQueue,
    repository,
    retryAgent,
    runService,
    runtimeDiagnostics,
    ready: runtimeLifecycle.start,
    scheduler,
    sendMessage,
    shutdown,
    spawnAgent,
    waitAgent,
    workspaceCleanup,
    workspaceManager,
  })
  return runtime
}
