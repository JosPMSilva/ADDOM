function createGitApi(deps) {
  const { invokeVersioned, asTrimmedString, asOptionalRoundedNumber } = deps
  return {
    getHeaderStatus: (projectFolder) => invokeVersioned('git:getHeaderStatus', {
      projectFolder: String(projectFolder || '').trim(),
    }),
    getRepositoryStatus: (projectFolder) => invokeVersioned('git:getRepositoryStatus', {
      projectFolder: asTrimmedString(projectFolder),
    }),
    getFileDiff: (projectFolder, filePath, options = {}) => invokeVersioned('git:getFileDiff', {
      projectFolder: asTrimmedString(projectFolder),
      filePath: asTrimmedString(filePath),
      scope: asTrimmedString(options?.scope),
    }),
    stageHunk: (projectFolder, filePath, hunkId) => invokeVersioned('git:stageHunk', {
      projectFolder: asTrimmedString(projectFolder),
      filePath: asTrimmedString(filePath),
      hunkId: asTrimmedString(hunkId),
    }),
    discardHunk: (projectFolder, filePath, hunkId) => invokeVersioned('git:discardHunk', {
      projectFolder: asTrimmedString(projectFolder),
      filePath: asTrimmedString(filePath),
      hunkId: asTrimmedString(hunkId),
    }),
    unstageHunk: (projectFolder, filePath, hunkId) => invokeVersioned('git:unstageHunk', {
      projectFolder: asTrimmedString(projectFolder),
      filePath: asTrimmedString(filePath),
      hunkId: asTrimmedString(hunkId),
    }),
    restoreFile: (projectFolder, filePath) => invokeVersioned('git:restoreFile', {
      projectFolder: asTrimmedString(projectFolder),
      filePath: asTrimmedString(filePath),
    }),
    stageFile: (projectFolder, filePath, payload = {}) => invokeVersioned('git:stageFile', {
      projectFolder: asTrimmedString(projectFolder),
      filePath: asTrimmedString(filePath),
      previousFilePath: asTrimmedString(payload?.previousFilePath || payload?.previousPath),
    }),
    unstageFile: (projectFolder, filePath, payload = {}) => invokeVersioned('git:unstageFile', {
      projectFolder: asTrimmedString(projectFolder),
      filePath: asTrimmedString(filePath),
      previousFilePath: asTrimmedString(payload?.previousFilePath || payload?.previousPath),
    }),
    stageAll: (projectFolder) => invokeVersioned('git:stageAll', {
      projectFolder: asTrimmedString(projectFolder),
    }),
    unstageAll: (projectFolder) => invokeVersioned('git:unstageAll', {
      projectFolder: asTrimmedString(projectFolder),
    }),
    stageLines: (projectFolder, filePath, payload = {}) => invokeVersioned('git:stageLines', {
      projectFolder: asTrimmedString(projectFolder),
      filePath: asTrimmedString(filePath),
      hunkId: asTrimmedString(payload?.hunkId),
      startLine: asOptionalRoundedNumber(payload?.startLine),
      endLine: asOptionalRoundedNumber(payload?.endLine),
    }),
    unstageLines: (projectFolder, filePath, payload = {}) => invokeVersioned('git:unstageLines', {
      projectFolder: asTrimmedString(projectFolder),
      filePath: asTrimmedString(filePath),
      hunkId: asTrimmedString(payload?.hunkId),
      startLine: asOptionalRoundedNumber(payload?.startLine),
      endLine: asOptionalRoundedNumber(payload?.endLine),
    }),
    discardLines: (projectFolder, filePath, payload = {}) => invokeVersioned('git:discardLines', {
      projectFolder: asTrimmedString(projectFolder),
      filePath: asTrimmedString(filePath),
      hunkId: asTrimmedString(payload?.hunkId),
      startLine: asOptionalRoundedNumber(payload?.startLine),
      endLine: asOptionalRoundedNumber(payload?.endLine),
    }),
    commitStaged: (projectFolder, message) => invokeVersioned('git:commitStaged', {
      projectFolder: asTrimmedString(projectFolder),
      message: asTrimmedString(message),
    }),
  }
}

function createSkillsApi({ invokeVersioned, asTrimmedString, asPlainObject }) {
  return {
    list: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('skills:list', {
        projectFolder: asTrimmedString(source.projectFolder),
        category: asTrimmedString(source.category),
      })
    },
    categories: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('skills:categories', {
        projectFolder: asTrimmedString(source.projectFolder),
      })
    },
    get: (skillId) => invokeVersioned('skills:get', {
      skillId: asTrimmedString(skillId),
    }),
    search: (query, payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('skills:search', {
        query: asTrimmedString(query),
        projectFolder: asTrimmedString(source.projectFolder),
        category: asTrimmedString(source.category),
      })
    },
    install: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('skills:install', {
        skillId: asTrimmedString(source.skillId || source.id),
        providerId: asTrimmedString(source.providerId),
        model: asTrimmedString(source.model),
        name: asTrimmedString(source.name),
        projectFolder: asTrimmedString(source.projectFolder),
      })
    },
  }
}

function createPipelineApi({ invokeVersioned, asTrimmedString, asPlainObject }) {
  return {
    list: () => invokeVersioned('pipeline:list', {}),
    get: (pipelineId) => invokeVersioned('pipeline:get', { pipelineId: asTrimmedString(pipelineId) }),
    start: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('pipeline:start', {
        pipelineId: asTrimmedString(source.pipelineId || source.id),
        projectFolder: asTrimmedString(source.projectFolder),
        initialContext: asTrimmedString(source.initialContext || source.context),
        pipeline: source.pipeline || undefined,
        threadId: asTrimmedString(source.threadId),
        turnId: asTrimmedString(source.turnId),
        stepId: asTrimmedString(source.stepId),
      })
    },
    execute: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('pipeline:execute', {
        pipelineId: asTrimmedString(source.pipelineId || source.id),
        projectFolder: asTrimmedString(source.projectFolder),
        initialContext: asTrimmedString(source.initialContext || source.context),
        pipeline: source.pipeline || undefined,
      })
    },
    getStatus: (executionId) => invokeVersioned('pipeline:get-status', { executionId: asTrimmedString(executionId) }),
    abort: (executionId) => invokeVersioned('pipeline:abort', { executionId: asTrimmedString(executionId) }),
    save: (pipeline) => invokeVersioned('pipeline:save', { pipeline: asPlainObject(pipeline) }),
    delete: (pipelineId) => invokeVersioned('pipeline:delete', { pipelineId: asTrimmedString(pipelineId) }),
  }
}

function createCouncilApi({ invokeVersioned, asTrimmedString, asPlainObject }) {
  return {
    execute: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('council:execute', {
        instruction: asTrimmedString(source.instruction),
        projectFolder: asTrimmedString(source.projectFolder),
        councilRoleIds: Array.isArray(source.councilRoleIds)
          ? source.councilRoleIds.map(asTrimmedString).filter(Boolean)
          : undefined,
        maxMembers: source.maxMembers || undefined,
      })
    },
    start: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('council:start', {
        instruction: asTrimmedString(source.instruction),
        projectFolder: asTrimmedString(source.projectFolder),
        councilRoleIds: Array.isArray(source.councilRoleIds)
          ? source.councilRoleIds.map(asTrimmedString).filter(Boolean)
          : undefined,
        maxMembers: source.maxMembers || undefined,
        threadId: asTrimmedString(source.threadId),
        turnId: asTrimmedString(source.turnId),
        stepId: asTrimmedString(source.stepId),
      })
    },
    getStatus: (executionId) => invokeVersioned('council:get-status', { executionId: asTrimmedString(executionId) }),
    abort: (executionId) => invokeVersioned('council:abort', { executionId: asTrimmedString(executionId) }),
  }
}

function createAgentMemoryApi({ invokeVersioned, asTrimmedString }) {
  return {
    list: (projectFolder) => invokeVersioned('agentMemory:list', { projectFolder: asTrimmedString(projectFolder) }),
    clear: (projectFolder, roleId) => invokeVersioned('agentMemory:clear', {
      projectFolder: asTrimmedString(projectFolder),
      roleId: asTrimmedString(roleId),
    }),
    clearAll: (projectFolder) => invokeVersioned('agentMemory:clearAll', {
      projectFolder: asTrimmedString(projectFolder),
    }),
  }
}

function createOpenAIAssetsApi({ invokeVersioned, asTrimmedString, sanitizeOpenAIAssetPayload }) {
  return {
    listProjectAssets: (projectId) => invokeVersioned('openai-assets:list-project-assets', { projectId: asTrimmedString(projectId) }),
    ensureProjectVectorStore: (projectId) => invokeVersioned('openai-assets:ensure-project-vector-store', { projectId: asTrimmedString(projectId) }),
    uploadFiles: (payload = {}) => invokeVersioned('openai-assets:upload-files', sanitizeOpenAIAssetPayload(payload)),
    attachFilesToProjectVectorStore: (payload = {}) => invokeVersioned('openai-assets:attach-files-to-project-vector-store', sanitizeOpenAIAssetPayload(payload)),
    removeProjectAsset: (assetId) => invokeVersioned('openai-assets:remove-project-asset', { assetId: asTrimmedString(assetId) }),
    deleteProjectVectorStore: (projectId) => invokeVersioned('openai-assets:delete-project-vector-store', { projectId: asTrimmedString(projectId) }),
    syncProjectAssets: (projectId) => invokeVersioned('openai-assets:sync-project-assets', { projectId: asTrimmedString(projectId) }),
  }
}

function createOpenAIMcpApi({ invokeVersioned, asTrimmedString, asPlainObject }) {
  return {
    listServers: () => invokeVersioned('openai-mcp:list-servers'),
    saveServer: (config = {}) => invokeVersioned('openai-mcp:save-server', { ...asPlainObject(config) }),
    deleteServer: (serverId) => invokeVersioned('openai-mcp:delete-server', { serverId: asTrimmedString(serverId) }),
    setServerSecret: (serverId, secret = {}) => invokeVersioned('openai-mcp:set-server-secret', {
      serverId: asTrimmedString(serverId),
      secret: asPlainObject(secret),
    }),
    testServer: (serverId) => invokeVersioned('openai-mcp:test-server', { serverId: asTrimmedString(serverId) }),
  }
}

module.exports = {
  createGitApi,
  createSkillsApi,
  createPipelineApi,
  createCouncilApi,
  createAgentMemoryApi,
  createOpenAIAssetsApi,
  createOpenAIMcpApi,
}
