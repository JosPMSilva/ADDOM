function createWorkspaceApi(deps) {
  const {
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asString,
    asPlainObject,
    asBoolean,
    asOptionalRoundedNumber,
    notifyRendererOption,
  } = deps

  return {
    listProjects: () => invokeVersioned('workspace:list-projects'),
    openProject: (projectPath, options = {}) => invokeVersioned('workspace:open-project', {
      path: asTrimmedString(projectPath),
      ...notifyRendererOption(options),
    }),
    setActiveProject: (projectId, options = {}) => invokeVersioned('workspace:set-active-project', {
      projectId: asTrimmedString(projectId),
      ...notifyRendererOption(options),
    }),
    clearActiveProject: (options = {}) => invokeVersioned('workspace:clear-active-project', {
      ...notifyRendererOption(options),
    }),
    onActiveProjectChanged: (cb) => subVersioned('workspace:active-project-changed', cb),
    listThreads: (projectId) => invokeVersioned('workspace:list-threads', {
      projectId: asTrimmedString(projectId),
    }),
    createThread: (projectId, title = '', options = {}) => invokeVersioned('workspace:create-thread', {
      projectId: asTrimmedString(projectId),
      title: asString(title),
      ...notifyRendererOption(options),
    }),
    autoTitleThread: (projectId, threadId, prompt = '') => invokeVersioned('workspace:auto-title-thread', {
      projectId: asTrimmedString(projectId),
      threadId: asTrimmedString(threadId),
      prompt: asString(prompt),
    }),
    setActiveThread: (projectId, threadId, options = {}) => invokeVersioned('workspace:set-active-thread', {
      projectId: asTrimmedString(projectId),
      threadId: asTrimmedString(threadId),
      ...notifyRendererOption(options),
    }),
    acknowledgeThreadActivity: (threadId, acknowledgedAt) => invokeVersioned('workspace:acknowledge-thread-activity', {
      threadId: asTrimmedString(threadId),
      acknowledgedAt: asOptionalRoundedNumber(acknowledgedAt),
    }),
    renameThread: (projectId, threadId, title) => invokeVersioned('workspace:rename-thread', {
      projectId: asTrimmedString(projectId),
      threadId: asTrimmedString(threadId),
      title: asString(title),
    }),
    listTimeline: (threadId, opts = {}) => {
      const source = asPlainObject(opts)
      return invokeVersioned('workspace:list-timeline', {
        threadId: asTrimmedString(threadId),
        limit: asOptionalRoundedNumber(source.limit),
        afterEventId: asOptionalRoundedNumber(source.afterEventId),
      })
    },
    importLegacyTranscript: (threadId, messages = []) => invokeVersioned('workspace:import-legacy-transcript', {
      threadId: asTrimmedString(threadId),
      messages: Array.isArray(messages) ? messages : [],
    }),
    exportThread: (threadId, options = {}) => invokeVersioned('workspace:export-thread', {
      threadId: asTrimmedString(threadId),
      options: { ...asPlainObject(options) },
    }),
    importThread: (projectId, payload = {}) => invokeVersioned('workspace:import-thread', {
      projectId: asTrimmedString(projectId),
      payload: { ...asPlainObject(payload) },
    }),
    getDisposalImpact: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('workspace:get-disposal-impact', {
        scope: asTrimmedString(source.scope).toLowerCase(),
        projectId: asTrimmedString(source.projectId),
        threadId: asTrimmedString(source.threadId),
      })
    },
    stopActiveWork: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('workspace:stop-active-work', {
        scope: asTrimmedString(source.scope).toLowerCase(),
        projectId: asTrimmedString(source.projectId),
        threadId: asTrimmedString(source.threadId),
        stopActive: asBoolean(source.stopActive),
      })
    },
    deleteThread: (threadId, options = {}) => invokeVersioned('workspace:delete-thread', {
      threadId: asTrimmedString(threadId),
      stopActive: asBoolean(asPlainObject(options).stopActive),
    }),
    removeProject: (projectId, options = {}) => invokeVersioned('workspace:remove-project', {
      projectId: asTrimmedString(projectId),
      stopActive: asBoolean(asPlainObject(options).stopActive),
    }),
  }
}

function createDocumentsApi({ invokeVersioned, asTrimmedString, asPlainObject }) {
  const normalizeDirectionAnswer = (answer) => {
    if (typeof answer === 'string') {
      const text = asTrimmedString(answer)
      return text ? { kind: 'custom', optionId: '', text } : null
    }
    const source = asPlainObject(answer)
    const kind = asTrimmedString(source.kind).toLowerCase()
    if (kind === 'option') {
      const optionId = asTrimmedString(source.optionId)
      return optionId ? { kind, optionId, text: asTrimmedString(source.text) } : null
    }
    const text = asTrimmedString(source.text)
    return text ? { kind: 'custom', optionId: '', text } : null
  }
  return {
    read: (projectId, filePath) => invokeVersioned('documents:read', {
      projectId: asTrimmedString(projectId),
      filePath: asTrimmedString(filePath).replace(/\\/g, '/'),
    }),
    reveal: (projectId, filePath) => invokeVersioned('documents:reveal', {
      projectId: asTrimmedString(projectId),
      filePath: asTrimmedString(filePath).replace(/\\/g, '/'),
    }),
    readPlanState: ({ projectRoot, threadId, planId } = {}) => invokeVersioned('documents:read-plan-state', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
    }),
    readManagedPlan: ({ projectRoot, threadId, planId } = {}) => invokeVersioned('documents:read-managed-plan', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
    }),
    revealManagedPlan: ({ projectRoot, threadId, planId } = {}) => invokeVersioned('documents:reveal-managed-plan', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
    }),
    saveManagedPlanCopy: ({ projectRoot, threadId, planId, expectedRevision } = {}) => invokeVersioned('documents:save-managed-plan-copy', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
      expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : -1,
    }),
    addPlanReviewChange: ({ projectRoot, threadId, planId, headingAnchor, blockId, blockKind, blockText, instruction, expectedRevision } = {}) => invokeVersioned('documents:add-plan-review-change', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
      headingAnchor: asTrimmedString(headingAnchor),
      blockId: asTrimmedString(blockId),
      blockKind: asTrimmedString(blockKind),
      blockText: asTrimmedString(blockText),
      instruction: asTrimmedString(instruction),
      expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : -1,
    }),
    removePlanReviewChange: ({ projectRoot, threadId, planId, changeId, expectedRevision } = {}) => invokeVersioned('documents:remove-plan-review-change', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
      changeId: asTrimmedString(changeId),
      expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : -1,
    }),
    submitPlanReviewChanges: ({ projectRoot, threadId, planId, expectedRevision } = {}) => invokeVersioned('documents:submit-plan-review-changes', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
      expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : -1,
    }),
    implementManagedPlan: ({ projectRoot, threadId, planId, expectedRevision } = {}) => invokeVersioned('documents:implement-managed-plan', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
      expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : -1,
    }),
    answerPlanDirection: ({ projectRoot, threadId, planId, questionId, answer, expectedRevision, expectedDirectionRevision } = {}) => invokeVersioned('documents:answer-plan-direction', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
      questionId: asTrimmedString(questionId),
      answer: normalizeDirectionAnswer(answer),
      expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : -1,
      expectedDirectionRevision: Number.isInteger(expectedDirectionRevision) ? expectedDirectionRevision : -1,
    }),
    changePlanDirection: ({ projectRoot, threadId, planId, feedback, expectedRevision, expectedDirectionRevision } = {}) => invokeVersioned('documents:change-plan-direction', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
      feedback: asTrimmedString(feedback),
      expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : -1,
      expectedDirectionRevision: Number.isInteger(expectedDirectionRevision) ? expectedDirectionRevision : -1,
    }),
    retryPlanDirection: ({ projectRoot, threadId, planId, expectedRevision, expectedDirectionRevision } = {}) => invokeVersioned('documents:retry-plan-direction', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
      expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : -1,
      expectedDirectionRevision: Number.isInteger(expectedDirectionRevision) ? expectedDirectionRevision : -1,
    }),
      selectPlanAuthoringProfile: ({ projectRoot, threadId, planId, selectedProfile, expectedRevision, expectedDirectionRevision } = {}) => invokeVersioned('documents:select-plan-authoring-profile', {
      projectRoot: asTrimmedString(projectRoot),
      threadId: asTrimmedString(threadId),
      planId: asTrimmedString(planId),
      selectedProfile: asTrimmedString(selectedProfile).toLowerCase(),
      expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : -1,
        expectedDirectionRevision: Number.isInteger(expectedDirectionRevision) ? expectedDirectionRevision : -1,
      }),
      migrateLegacyPlanState: ({ projectRoot, threadId, legacyState } = {}) => invokeVersioned('documents:migrate-legacy-plan-state', {
        projectRoot: asTrimmedString(projectRoot),
        threadId: asTrimmedString(threadId),
        legacyState: legacyState && typeof legacyState === 'object' ? legacyState : null,
      }),
    }
}

function createProcessesApi({ invokeVersioned, asTrimmedString }) {
  return {
    listBackground: (project) => invokeVersioned('processes:list-background', {
      project: asTrimmedString(project),
    }),
    stopBackground: (id) => invokeVersioned('processes:stop-background', {
      id: asTrimmedString(id),
    }),
    stopAllBackground: (project) => invokeVersioned('processes:stop-all-background', {
      project: asTrimmedString(project),
    }),
  }
}

function createToolApi({ sendVersioned, subVersioned }) {
  return {
    onApprovalRequest: (cb) => subVersioned('tool:approval-request', cb),
    respond: (approvalId, decision, responseChannel = '', denyReason = '', approvalMeta = null) => {
      const payload = {
        id: approvalId,
        decision,
        denyReason,
        ...(approvalMeta && typeof approvalMeta === 'object' ? { approvalMeta } : {}),
      }
      if (responseChannel) {
        const channel = String(responseChannel || '').trim()
        if (!/^tool:approval-response:[a-z0-9_-]+$/i.test(channel)) {
          console.warn(`[preload] Rejected invalid tool approval response channel: "${channel}"`)
          return false
        }
        sendVersioned(channel, payload)
        return true
      }
      sendVersioned('tool:approval-response', payload)
      return true
    },
  }
}

function createMemoryApi(deps) {
  const {
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asString,
    asPlainObject,
    hasOwn,
    asBoolean,
    asOptionalRoundedNumber,
    asOptionalNumber,
    asStringArray,
    normalizeMemoryListPayload,
    normalizeMemorySearchPayload,
    normalizeMemoryScopeMutationPayload,
    normalizeHttpUrl,
  } = deps

  return {
    list: (projectOrPayload, opts = {}) => invokeVersioned(
      'memory:list',
      normalizeMemoryListPayload(projectOrPayload, opts),
    ),
    search: (projectOrPayload, queryOrPayload, opts = {}) => invokeVersioned(
      'memory:search',
      normalizeMemorySearchPayload(projectOrPayload, queryOrPayload, opts),
    ),
    add: (payload = {}) => {
      const source = asPlainObject(payload)
      const nextPayload = {
        project: asTrimmedString(source.project),
        topic: asString(source.topic),
        content: asString(source.content),
        tags: asStringArray(source.tags),
        isGlobal: asBoolean(source.isGlobal),
      }
      if (hasOwn(source, 'source')) nextPayload.source = asTrimmedString(source.source)
      if (hasOwn(source, 'dataPolicy')) nextPayload.dataPolicy = asTrimmedString(source.dataPolicy)
      if (hasOwn(source, 'scope')) nextPayload.scope = asTrimmedString(source.scope).toLowerCase()
      if (hasOwn(source, 'threadId')) nextPayload.threadId = asTrimmedString(source.threadId)
      if (hasOwn(source, 'originThreadId')) nextPayload.originThreadId = asTrimmedString(source.originThreadId)
      if (hasOwn(source, 'durability')) nextPayload.durability = asTrimmedString(source.durability).toLowerCase()
      if (hasOwn(source, 'confidence')) {
        const confidence = asOptionalNumber(source.confidence)
        if (confidence !== undefined) nextPayload.confidence = confidence
      }
      return invokeVersioned('memory:add', nextPayload)
    },
    previewUrl: (project, url, opts = {}) => {
      const source = asPlainObject(opts)
      return invokeVersioned('memory:preview-url', {
        project: asTrimmedString(project),
        url: normalizeHttpUrl(url),
        maxChars: asOptionalRoundedNumber(source.maxChars),
      })
    },
    ingestUrl: (project, url, opts = {}) => {
      const source = asPlainObject(opts)
      return invokeVersioned('memory:ingest-url', {
        project: asTrimmedString(project),
        url: normalizeHttpUrl(url),
        topic: asString(source.topic),
        maxChars: asOptionalRoundedNumber(source.maxChars),
      })
    },
    update: (id, fields = {}) => {
      const source = asPlainObject(fields)
      const nextPayload = { id: asTrimmedString(id) }
      if (hasOwn(source, 'topic')) nextPayload.topic = asString(source.topic)
      if (hasOwn(source, 'content')) nextPayload.content = asString(source.content)
      if (hasOwn(source, 'tags')) nextPayload.tags = asStringArray(source.tags)
      if (typeof source.pinned === 'boolean') nextPayload.pinned = source.pinned
      if (hasOwn(source, 'dataPolicy')) nextPayload.dataPolicy = asTrimmedString(source.dataPolicy)
      return invokeVersioned('memory:update', nextPayload)
    },
    delete: (id, force) => invokeVersioned('memory:delete', {
      id: asTrimmedString(id),
      force: asBoolean(force),
    }),
    clear: (project, all = false) => invokeVersioned('memory:clear', {
      project: asTrimmedString(project),
      all: asBoolean(all),
    }),
    pin: (id, pinned) => invokeVersioned('memory:pin', {
      id: asTrimmedString(id),
      pinned: asBoolean(pinned),
    }),
    promote: (idOrPayload, options = {}) => invokeVersioned(
      'memory:promote',
      normalizeMemoryScopeMutationPayload(idOrPayload, options),
    ),
    demote: (idOrPayload, options = {}) => invokeVersioned(
      'memory:demote',
      normalizeMemoryScopeMutationPayload(idOrPayload, options),
    ),
    invalidate: (idOrPayload, options = {}) => invokeVersioned(
      'memory:invalidate',
      normalizeMemoryScopeMutationPayload(idOrPayload, options),
    ),
    embedderStatus: () => invokeVersioned('memory:embedder-status'),
    exportProjectJson: (project, options = {}) => invokeVersioned('memory:export-project-json', {
      project: asTrimmedString(project),
      includeGlobal: asBoolean(options?.includeGlobal),
    }),
    onUpdated: (cb) => subVersioned('memory:updated', cb),
    onEmbedderStatus: (cb) => subVersioned('memory:embedder-status', cb),
  }
}

module.exports = {
  createWorkspaceApi,
  createDocumentsApi,
  createProcessesApi,
  createToolApi,
  createMemoryApi,
}
