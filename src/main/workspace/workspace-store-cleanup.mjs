import {
  clearCachedAttachmentsForProject,
  clearCachedAttachmentsForThread,
  clearAllCachedAttachments,
} from '../attachments/attachment-cache.mjs'
import {
  clearAllAttachmentAgentMirrors,
  clearProjectAttachmentAgentMirrors,
  clearThreadAttachmentAgentMirror,
} from '../attachments/attachment-agent-mirror.mjs'
import {
  clearOpenAIThreadAssetAssociations,
  deleteAllOpenAIWorkspaceAssets,
  deleteOpenAIProjectAssets,
} from '../api-clients/openai-asset-service.mjs'

function fallbackCleanupResult() {
  return { ok: false, deletedRows: 0, deletedDirs: 0 }
}

function fallbackProviderAssetCleanupResult(scope = '', id = '') {
  return {
    ok: false,
    scope,
    id,
    deletedFiles: 0,
    deletedVectorStores: 0,
    deletedVectorStoreFiles: 0,
    deletedRemoteFiles: 0,
    deletedRemoteVectorStore: false,
    deletedRemoteVectorStores: 0,
    updatedFiles: 0,
    remoteFailures: [],
  }
}

export async function cleanupThreadAttachments(threadId) {
  try {
    const mirror = await clearThreadAttachmentAgentMirror(threadId)
    const canonical = await clearCachedAttachmentsForThread(threadId)
    return {
      ...canonical,
      ok: canonical?.ok === true && mirror?.ok === true,
      mirror,
    }
  } catch {
    return fallbackCleanupResult()
  }
}

export function cleanupThreadProviderAssets(threadId) {
  try {
    return {
      scope: 'thread',
      id: String(threadId || '').trim(),
      ...clearOpenAIThreadAssetAssociations(threadId),
    }
  } catch {
    return fallbackProviderAssetCleanupResult('thread', String(threadId || '').trim())
  }
}

export async function cleanupProjectAttachments(projectId) {
  try {
    const mirror = await clearProjectAttachmentAgentMirrors(projectId)
    const canonical = await clearCachedAttachmentsForProject(projectId)
    return {
      ...canonical,
      ok: canonical?.ok === true && mirror?.ok === true,
      mirror,
    }
  } catch {
    return fallbackCleanupResult()
  }
}

export async function cleanupProjectProviderAssets(projectId) {
  try {
    return {
      scope: 'project',
      id: String(projectId || '').trim(),
      ...(await deleteOpenAIProjectAssets(projectId)),
    }
  } catch {
    return fallbackProviderAssetCleanupResult('project', String(projectId || '').trim())
  }
}

export async function cleanupAllWorkspaceAttachments() {
  try {
    const mirror = await clearAllAttachmentAgentMirrors()
    const canonical = await clearAllCachedAttachments()
    return {
      ...canonical,
      ok: canonical?.ok === true && mirror?.ok === true,
      mirror,
    }
  } catch {
    return fallbackCleanupResult()
  }
}

export async function cleanupAllWorkspaceProviderAssets() {
  try {
    return {
      scope: 'workspace',
      ...(await deleteAllOpenAIWorkspaceAssets()),
    }
  } catch {
    return fallbackProviderAssetCleanupResult('workspace', '')
  }
}
