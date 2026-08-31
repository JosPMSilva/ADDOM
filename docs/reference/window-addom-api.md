# window.addom API Reference

## Who This Is For
- Power users and maintainers validating UI/runtime behavior against exposed renderer APIs.

## Prerequisites
- Familiarity with ADDOM panels and workflows.
- Read access to `src/preload/index.mjs`.

## What This Feature Does
Documents the `window.addom` API surface exposed through preload and context bridge.

## Step-by-Step Tasks
1. Identify needed namespace from sections below.
2. Use method/event contract from this page.
3. Validate behavior against runbook/timeline and integration tests.

## Root Metadata and Versioning
- `_version`: app package version string.
- `_ipcVersion`: IPC API channel version (`v1`).
- `ipc` and `v1` helpers:
  - `send(channel, payload)`
  - `invoke(channel, payload)`
  - `on(channel, callback)`

## Namespaces

## `window.addom.window`
- `minimize()`
- `maximize()`
- `close()`

## `window.addom.app`
- `openLegalDocument(documentId)`

## `window.addom.dialog`
- `openFolder()`
- `openFiles()`

## `window.addom.shell`
- `openPath(path)`
- `openExternal(url)`
- `openAttachmentFile(payload)`

## `window.addom.attachments`
- `stage(projectId, threadId, attachments, turnId?)`
- `stat(attachmentId, scope?)`
- `open(attachmentId, scope?)`
- `getTextExtractionStatus(options?)`

## `window.addom.vault`
- `getProviders(forceRefresh?)`
- `getModelCapabilities(providerId, modelId, forceRefresh?)`
- `setKey(providerId, apiKey)`
- `deleteKey(providerId)`

## `window.addom.chat`
- Actions:
  - `stream(providerId, model, messages, projectFolder, permissionMode, mode, memoryCompressionEnabled, memoryCompressionThreshold, projectId, threadId, turnId, currentUserMessage, assistantMessageId, turnOptions?)`
  - `cancel(threadId?, turnId?)`
  - `logComplianceEvent(payload)`
- Event subscriptions:
  - `onChunk`
  - `onDone`
  - `onError`
  - `onToolsPending`
  - `onToolExecuting`
  - `onToolResult`
  - `onMemoryInjected`
  - `onReasoningChunk`
  - `onReasoningDone`
  - `onCancelled`
  - `onUsage`
  - `onSourceUrl`
  - `onSourceDocument`
  - `onProviderToolOutput`
  - `onProviderToolStatus`
  - `onRuntimeDiagnostics`
  - `onCostEstimate`
  - `onPromptComposition`
  - `onTurnState`
  - `onFileChange`
  - `onMemoryCompressed`
  - `onContextCompacted`
  - `onContinuityStatus`
  - `onContinuityPacket`
  - `onOpenAIContinuityStatus`
  - `onOpenAICompactionEvent`
  - `onOpenAIWebSocketReconnect`
  - `onBackgroundResponseQueued`
  - `onBackgroundResponseCompleted`
  - `onBackgroundResponseFailed`
  - `onApprovalCountdown`
  - `onApprovalTimeout`
  - `onCompressionState`
  - `onComplianceEvent`
  - `onNotice`

## `window.addom.workspace`
- `listProjects()`
- `openProject(projectPath)`
- `setActiveProject(projectId)`
- `listThreads(projectId)`
- `createThread(projectId, title?)`
- `setActiveThread(projectId, threadId)`
- `renameThread(projectId, threadId, title)`
- `listTimeline(threadId, opts?)`
- `importLegacyTranscript(threadId, messages?)`
- `exportThread(threadId, options?)`
- `importThread(projectId, payload?)`
- `clearThread(threadId)`
- `deleteThread(threadId)`
- `clearProject(projectId)`
- `deleteProject(projectId)`
- `clearAll()`

## `window.addom.processes`
- `listBackground(project)`
- `stopBackground(id)`
- `stopAllBackground(project)`

## `window.addom.tool`
- `onApprovalRequest(callback)`
- `respond(approvalId, decision, responseChannel?, denyReason?, approvalMeta?)`

## `window.addom.memory`
- `list(project, opts?)`
- `search(project, query, opts?)`
- `add(payload)`
- `previewUrl(project, url, opts?)`
- `ingestUrl(project, url, opts?)`
- `update(id, fields)`
- `delete(id, force?)`
- `clear(project, all?)`
- `pin(id, pinned)`
- `embedderStatus()`
- `exportProjectJson(project)`
- Events:
  - `onUpdated`
  - `onEmbedderStatus`

## `window.addom.file`
- `listTree(project)`
- `readFile(project, filePath)`
- `saveFile(project, filePath, content)`
- Events:
  - `onExternalChange`
  - `onWatcherStatus`

## `window.addom.editor`
- `service.syncDocument(payload?)`
- `service.request(payload?)`
- `requestInlineCompletion(payload?)`
- `logInlineCompletionTelemetry(payload?)`

## `window.addom.updater`
- `checkForUpdates()`
- `downloadUpdate()`
- `installUpdate()`
- Events:
  - `onChecking`
  - `onAvailable`
  - `onNotAvailable`
  - `onError`
  - `onProgress`
  - `onDownloaded`

## `window.addom.settings`
- `get()`
- `set(patch)`
- `detectInstallSandboxBackend(commandSafety?)`
- `getCommandSafetyTelemetry()`
- `clearCommandSafetyTelemetry()`
- `getInlineCompletionTelemetry()`
  - `clearInlineCompletionTelemetry()`
  - `onSecurityWarning(cb)`

## `window.addom.localData`
- `getSummary()`
- `deleteApiKeys()`
- `resetAllAndRestart()`

## `window.addom.system`
- `getGitUserName()`

## `window.addom.skills`
- `list(payload?)`
- `categories(payload?)`
- `get(skillId)`
- `search(query, payload?)`
- `install(payload?)`

## `window.addom.pipeline`
- `list()`
- `get(pipelineId)`
- `start(payload?)`
- `execute(payload?)`
- `getStatus(executionId)`
- `abort(executionId)`
- `save(pipeline)`
- `delete(pipelineId)`

## `window.addom.council`
- `execute(payload?)`
- `start(payload?)`
- `getStatus(executionId)`
- `abort(executionId)`

## `window.addom.agentMemory`
- `list(projectFolder)`
- `clear(projectFolder, roleId)`
- `clearAll(projectFolder)`

## `window.addom.openaiAssets`
- `listProjectAssets(projectId)`
- `ensureProjectVectorStore(projectId)`
- `uploadFiles(payload?)`
- `attachFilesToProjectVectorStore(payload?)`
- `removeProjectAsset(assetId)`
- `deleteProjectVectorStore(projectId)`
- `syncProjectAssets(projectId)`

## `window.addom.openaiMcp`
- `listServers()`
- `saveServer(config?)`
- `deleteServer(serverId)`
- `setServerSecret(serverId, secret?)`
- `testServer(serverId)`

## `window.addom.agents`
- `listRoleTemplates()`
- `onFanoutConfirmRequest(callback)`
- `respondFanoutConfirm(requestId, decision)`
- `createRole(payload?)`

## `window.addom.agentRuns`
- `list({ projectId, threadId, cursor?, limit? })`
- `get({ projectId, threadId, runId })`
- `getTranscriptPage({ projectId, threadId, runId, nodeId, cursor?, limit? })`
- `getEventsPage({ projectId, threadId, runId, nodeId?, cursor?, limit? })`
- `subscribe({ projectId, threadId, runId? }, callback)`
- `control({ projectId, threadId, runId, nodeId?, action, reason? })`
- `message({ projectId, threadId, runId, fromNodeId, toNodeId, text })`
- `retry({ projectId, threadId, runId, nodeId })`
- `setQueuePaused({ projectId, threadId, paused })`
- `resolveApproval({ projectId, threadId, runId, approvalId, outcome, resolutionScope?, expiresAt?, reason? })`
- `decideArtifact({ projectId, threadId, runId, artifactId, operation })`

All methods are explicitly project/thread scoped. `subscribe()` resolves to an async
unsubscribe function and multiplexes the single versioned `agent-runs:event` bridge.

## `window.addom.artifacts`
- `listFiles(project)`
- `listRevisions(project, filePath)`
- `getRevision(id)`
- `reviewContext(project, opts?)`
- `getLatestForFiles(project, filePaths?)`
- `rollback(project, filePath, revId)`
- `applyToDisk(project, filePath, revId)`
- `undoFileChange(project, fileChange)`
- `undoTurnFileChanges(project, changes)`
- `deleteFile(project, filePath)`
- `deleteRevision(project, filePath, id)`
- Event:
  - `onUpdated`

## Common Pitfalls
### What Can Go Wrong
- Invoking project/thread scoped APIs without active IDs.
- Expecting event order guarantees beyond documented lifecycle flow.
- Assuming every invoke path uses versioned fallback in the same way.

## Related Settings
- `settings.get()` and `settings.set()` patches drive runtime behavior, especially
  `permissionMode`, `riskyActionPolicy`, `agentSettings`, and advanced `commandSafety`.

## Related References
- [Tool Catalog](./tool-catalog.md)
- [Settings Catalog](./settings-catalog.md)
- [Events and Runbook](./events-and-runbook.md)
