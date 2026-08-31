import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPreloadHarness } from './preload-bridge-test-helpers.mjs'

test('preload normalization stays single-sourced in the live preload entrypoint', () => {
  assert.equal(fs.existsSync(path.resolve('src/preload/preload-bridge-utils.cjs')), false)
})

test('preload exposes addom API contract and versioned IPC helpers', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom
  assert.ok(addom && typeof addom === 'object')

  assert.equal(addom._ipcVersion, 'v1')
  assert.equal(addom._version, '1.0.0-test')
  assert.equal(addom.ipc, undefined)
  assert.equal(addom.v1, undefined)
  assert.equal(addom.admin, undefined)
  assert.equal(addom.maintenance, undefined)
  assert.equal(typeof addom.dialog?.openFiles, 'function')
  assert.equal(typeof addom.terminal?.getRuntimeHealth, 'function')
  assert.equal(typeof addom.terminal?.createSession, 'function')
  assert.equal(typeof addom.terminal?.listSessions, 'function')
  assert.equal(typeof addom.terminal?.attachSession, 'function')
  assert.equal(typeof addom.terminal?.readSessionSnapshot, 'function')
  assert.equal(typeof addom.terminal?.publishVisibleSnapshot, 'function')
  assert.equal(typeof addom.terminal?.writeSession, 'function')
  assert.equal(typeof addom.terminal?.resizeSession, 'function')
  assert.equal(typeof addom.terminal?.signalSession, 'function')
  assert.equal(typeof addom.terminal?.interruptSession, 'function')
  assert.equal(typeof addom.terminal?.closeSession, 'function')
  assert.equal(typeof addom.terminal?.terminateSession, 'function')
  assert.equal(typeof addom.terminal?.renameSession, 'function')
  assert.equal(typeof addom.terminal?.takeOverSession, 'function')
  assert.equal(typeof addom.terminal?.handBackSession, 'function')
  assert.equal(typeof addom.terminal?.focusSessionSurface, 'function')
  assert.equal(typeof addom.terminal?.listArchivedSessions, 'function')
  assert.equal(typeof addom.terminal?.getArchivedSession, 'function')
  assert.equal(typeof addom.terminal?.deleteArchivedSession, 'function')
  assert.equal(typeof addom.terminal?.dismissArchivedSessionSuggestion, 'function')
  assert.equal(typeof addom.terminal?.acceptArchivedSessionSuggestion, 'function')
  assert.equal(typeof addom.terminal?.saveArchivedSessionToMemory, 'function')
  assert.equal(typeof addom.terminal?.subscribe, 'function')
  assert.equal(typeof addom.chat?.stream, 'function')
  assert.equal(typeof addom.chat?.onNotice, 'function')
  assert.equal(typeof addom.chat?.onSourceUrl, 'function')
  assert.equal(typeof addom.chat?.onSourceDocument, 'function')
  assert.equal(typeof addom.chat?.onProviderToolOutput, 'function')
  assert.equal(typeof addom.chat?.onProviderToolStatus, 'function')
  assert.equal(typeof addom.chat?.onToolOutput, 'function')
  assert.equal(typeof addom.chat?.onRuntimeDiagnostics, 'function')
  assert.equal(typeof addom.chat?.onArtifactTracking, 'function')
  assert.equal(typeof addom.chat?.onToolWorkflowTelemetry, 'function')
  assert.equal(typeof addom.chat?.onOpenAIContinuityStatus, 'function')
  assert.equal(typeof addom.chat?.onOpenAICompactionEvent, 'function')
  assert.equal(typeof addom.chat?.onAnthropicCompactionEvent, 'function')
  assert.equal(typeof addom.chat?.onOpenAIWebSocketReconnect, 'function')
  assert.equal(typeof addom.chat?.onBackgroundResponseQueued, 'function')
  assert.equal(typeof addom.chat?.onBackgroundResponseCompleted, 'function')
  assert.equal(typeof addom.chat?.onBackgroundResponseFailed, 'function')
  assert.equal(typeof addom.attachments?.getTextExtractionStatus, 'function')
  assert.equal(typeof addom.settings?.get, 'function')
  assert.equal(typeof addom.settings?.setProviderAuthMethod, 'function')
  assert.equal(typeof addom.settings?.setProviderRuntimeSettings, 'function')
  assert.equal(typeof addom.settings?.setMoaRoles, 'function')
  assert.equal(typeof addom.settings?.getAdvancedConfigDiagnostics, 'function')
  assert.equal(typeof addom.settings?.reloadAdvancedConfig, 'function')
  assert.equal(typeof addom.settings?.getAdvancedConfigSecurityWarning, 'function')
  assert.equal(typeof addom.settings?.getEffectiveSourceDiagnostics, 'function')
  assert.equal(typeof addom.localData?.getSummary, 'function')
  assert.equal(typeof addom.localData?.getProviderBudgetSummary, 'function')
  assert.equal(typeof addom.localData?.cleanupProviderBudgetProfiles, 'function')
  assert.equal(typeof addom.localData?.resetProviderBudgetProfiles, 'function')
  assert.equal(typeof addom.localData?.getToolResultSpilloverSummary, 'function')
  assert.equal(typeof addom.localData?.cleanupToolResultSpillover, 'function')
  assert.equal(typeof addom.localData?.resetToolResultSpillover, 'function')
  assert.equal(typeof addom.localData?.deleteApiKeys, 'function')
  assert.equal(typeof addom.localData?.resetAllAndRestart, 'function')
  assert.equal(typeof addom.memory?.list, 'function')
  assert.equal(typeof addom.memory?.search, 'function')
  assert.equal(typeof addom.memory?.add, 'function')
  assert.equal(typeof addom.memory?.promote, 'function')
  assert.equal(typeof addom.memory?.demote, 'function')
  assert.equal(typeof addom.memory?.invalidate, 'function')
  assert.equal(typeof addom.openaiAccount?.getState, 'function')
  assert.equal(typeof addom.openaiAccount?.refreshState, 'function')
  assert.equal(typeof addom.openaiAccount?.prepareRuntime, 'function')
  assert.equal(typeof addom.openaiAccount?.checkRuntimeUpdate, 'function')
  assert.equal(typeof addom.openaiAccount?.installRuntimeUpdate, 'function')
  assert.equal(typeof addom.openaiAccount?.startLogin, 'function')
  assert.equal(typeof addom.openaiAccount?.reopenLoginBrowser, 'function')
  assert.equal(typeof addom.openaiAccount?.cancelLogin, 'function')
  assert.equal(typeof addom.openaiAccount?.disconnect, 'function')
  assert.equal(typeof addom.openaiAccount?.onSessionUpdated, 'function')
  assert.equal(typeof addom.openaiAccount?.onLoginUpdated, 'function')
  assert.equal(typeof addom.openaiAccount?.onStorageUpdated, 'function')
  assert.equal(typeof addom.cursorAgent?.getState, 'function')
  assert.equal(typeof addom.cursorAgent?.prepareRuntime, 'function')
  assert.equal(typeof addom.cursorAgent?.startLogin, 'function')
  assert.equal(typeof addom.cursorAgent?.cancelLogin, 'function')
  assert.equal(typeof addom.cursorAgent?.logout, 'function')
  assert.equal(typeof addom.openaiAssets?.listProjectAssets, 'function')
  assert.equal(typeof addom.openaiAssets?.ensureProjectVectorStore, 'function')
  assert.equal(typeof addom.openaiAssets?.uploadFiles, 'function')
  assert.equal(typeof addom.openaiAssets?.attachFilesToProjectVectorStore, 'function')
  assert.equal(typeof addom.openaiAssets?.removeProjectAsset, 'function')
  assert.equal(typeof addom.openaiAssets?.deleteProjectVectorStore, 'function')
  assert.equal(typeof addom.openaiAssets?.syncProjectAssets, 'function')
  assert.equal(typeof addom.openaiMcp?.listServers, 'function')
  assert.equal(typeof addom.openaiMcp?.saveServer, 'function')
  assert.equal(typeof addom.openaiMcp?.deleteServer, 'function')
  assert.equal(typeof addom.openaiMcp?.setServerSecret, 'function')
  assert.equal(typeof addom.openaiMcp?.testServer, 'function')
  assert.equal(typeof addom.settings?.getInlineCompletionTelemetry, 'function')
  assert.equal(typeof addom.settings?.clearInlineCompletionTelemetry, 'function')
  assert.equal(typeof addom.settings?.onSecurityWarning, 'function')
  assert.equal(typeof addom.workspace?.listProjects, 'function')
  assert.equal(typeof addom.workspace?.onActiveProjectChanged, 'function')
  assert.equal(typeof addom.documents?.read, 'function')
  assert.equal(typeof addom.documents?.reveal, 'function')
  assert.equal(typeof addom.documents?.answerPlanDirection, 'function')
  assert.equal(typeof addom.documents?.changePlanDirection, 'function')
  assert.equal(typeof addom.documents?.retryPlanDirection, 'function')
  assert.equal(typeof addom.documents?.selectPlanAuthoringProfile, 'function')
  assert.equal(typeof addom.git?.getHeaderStatus, 'function')
  assert.equal(typeof addom.git?.getRepositoryStatus, 'function')
  assert.equal(typeof addom.git?.getFileDiff, 'function')
  assert.equal(typeof addom.git?.stageHunk, 'function')
  assert.equal(typeof addom.git?.discardHunk, 'function')
  assert.equal(typeof addom.git?.unstageHunk, 'function')
  assert.equal(typeof addom.git?.restoreFile, 'function')
  assert.equal(typeof addom.git?.stageFile, 'function')
  assert.equal(typeof addom.git?.unstageFile, 'function')
  assert.equal(typeof addom.git?.stageAll, 'function')
  assert.equal(typeof addom.git?.unstageAll, 'function')
  assert.equal(typeof addom.git?.stageLines, 'function')
  assert.equal(typeof addom.git?.unstageLines, 'function')
  assert.equal(typeof addom.git?.discardLines, 'function')
  assert.equal(typeof addom.git?.commitStaged, 'function')
  assert.equal(typeof addom.editor?.service?.syncDocument, 'function')
  assert.equal(typeof addom.editor?.service?.request, 'function')
  assert.equal(typeof addom.editor?.service?.refreshRuntime, 'function')
  assert.equal(typeof addom.editor?.requestInlineCompletion, 'function')
  assert.equal(typeof addom.editor?.logInlineCompletionTelemetry, 'function')
  assert.equal(typeof addom.pipeline?.start, 'function')
  assert.equal(typeof addom.pipeline?.getStatus, 'function')
  assert.equal(typeof addom.council?.start, 'function')
  assert.equal(typeof addom.council?.getStatus, 'function')
  assert.equal(addom.moa, undefined)
  assert.equal(typeof addom.agents?.listRoleTemplates, 'function')
  assert.equal(typeof addom.agents?.createRole, 'function')
  assert.equal(typeof addom.agents?.onFanoutConfirmRequest, 'function')
  assert.equal(typeof addom.agents?.respondFanoutConfirm, 'function')
})

test('preload resolves app version from package metadata when npm_package_version is unset', async () => {
  const harness = await createPreloadHarness({ npmPackageVersion: null })
  assert.equal(harness.addom._version, '1.0.0')
})

test('preload resolves app version from additional process arguments in sandbox-safe mode', async () => {
  const harness = await createPreloadHarness({
    npmPackageVersion: null,
    processArgv: ['--inspect', '--addom-app-version=2.4.6'],
  })
  assert.equal(harness.addom._version, '2.4.6')
})

test('preload bridge methods invoke only on versioned channels', async () => {
  const harness = await createPreloadHarness({
    invokeBehavior: async (channel, payload) => ({ ok: true, channel, payload }),
  })
  const addom = harness.addom

  addom.chat.cancel()
  assert.equal(harness.sent.length, 1)
  assert.equal(harness.sent[0].channel, 'v1:chat:cancel')

  const response = await addom.workspace.listProjects({ force: true })
  assert.equal(harness.invokeCalls.length, 1)
  assert.equal(harness.invokeCalls[0].channel, 'v1:workspace:list-projects')
  assert.deepEqual(response, {
    ok: true,
    channel: 'v1:workspace:list-projects',
    payload: undefined,
  })

  await addom.workspace.listProjects()
  await addom.documents.read('project-1', 'docs\\PLAN.md')
  await addom.documents.reveal('project-1', 'docs\\PLAN.md')
  await addom.documents.answerPlanDirection({
    projectRoot: 'C:\\repo', threadId: 'thread_1', planId: 'plan_1', questionId: 'scope',
    answer: { kind: 'option', optionId: 'full', text: 'Full workflow' },
    expectedRevision: 2, expectedDirectionRevision: 1,
  })
  await addom.documents.changePlanDirection({
    projectRoot: 'C:\\repo', threadId: 'thread_1', planId: 'plan_1', feedback: 'Narrow the first slice.',
    expectedRevision: 3, expectedDirectionRevision: 2,
  })
  await addom.documents.retryPlanDirection({
    projectRoot: 'C:\\repo', threadId: 'thread_1', planId: 'plan_1',
    expectedRevision: 4, expectedDirectionRevision: 3,
  })
  await addom.documents.selectPlanAuthoringProfile({
    projectRoot: 'C:\\repo', threadId: 'thread_1', planId: 'plan_1', selectedProfile: 'implementation',
    expectedRevision: 3, expectedDirectionRevision: 2,
  })
  await addom.dialog.openFiles()
  await addom.terminal.getRuntimeHealth()
  await addom.terminal.createSession({ projectFolder: 'C:\\repo', cwd: '.', shell: 'default', cols: 90, rows: 30 })
  await addom.terminal.listSessions()
  await addom.terminal.attachSession('term_1', { sinceSequence: 2 })
  await addom.terminal.readSessionSnapshot('term_1', { sinceSequence: 2, maxChars: 512, mode: 'buffer_tail' })
  await addom.terminal.publishVisibleSnapshot('term_1', {
    text: 'prompt> ',
    capturedAt: 1234,
    cols: 120,
    rows: 40,
    surface: 'chat_dock',
    available: true,
  })
  await addom.terminal.writeSession('term_1', 'echo hi')
  await addom.terminal.resizeSession('term_1', 120, 40)
  await addom.terminal.signalSession('term_1', 'SIGTERM')
  await addom.terminal.interruptSession('term_1')
  await addom.terminal.closeSession('term_1', 'SIGHUP')
  await addom.terminal.terminateSession('term_1')
  await addom.terminal.renameSession('term_1', 'Build logs')
  await addom.terminal.takeOverSession('term_1')
  await addom.terminal.handBackSession('term_1')
  await addom.terminal.focusSessionSurface('term_1', 'chat_dock')
  await addom.terminal.listArchivedSessions({ projectFolder: 'C:\\repo', limit: 25 })
  await addom.terminal.getArchivedSession('term_1', { projectFolder: 'C:\\repo' })
  await addom.terminal.deleteArchivedSession('term_1', { projectFolder: 'C:\\repo' })
  await addom.terminal.dismissArchivedSessionSuggestion('term_1', { projectFolder: 'C:\\repo' })
  await addom.terminal.acceptArchivedSessionSuggestion('term_1', { projectFolder: 'C:\\repo' })
  await addom.terminal.saveArchivedSessionToMemory('term_1', { projectFolder: 'C:\\repo' })
  await addom.attachments.getTextExtractionStatus({ forceRefresh: true })
  await addom.settings.get()
  await addom.settings.setProviderAuthMethod('openai', 'account')
  await addom.settings.setProviderRuntimeSettings('openai', { reasoningEffort: 'medium' })
  await addom.settings.setMoaRoles([{ id: 'role_1', name: 'Reviewer', providerId: 'openai', model: 'gpt-5.4' }])
  await addom.localData.getSummary()
  await addom.localData.getProviderBudgetSummary()
  await addom.localData.cleanupProviderBudgetProfiles()
  await addom.localData.resetProviderBudgetProfiles()
  await addom.localData.getToolResultSpilloverSummary()
  await addom.localData.cleanupToolResultSpillover()
  await addom.localData.resetToolResultSpillover()
  await addom.localData.deleteApiKeys()
  await addom.localData.resetAllAndRestart()
  await addom.openaiAccount.getState()
  await addom.openaiAccount.refreshState()
  await addom.openaiAccount.prepareRuntime()
  await addom.openaiAccount.checkRuntimeUpdate()
  await addom.openaiAccount.installRuntimeUpdate()
  await addom.openaiAccount.startLogin()
  await addom.openaiAccount.reopenLoginBrowser('login_1')
  await addom.openaiAccount.cancelLogin('login_1')
  await addom.openaiAccount.disconnect()
  await addom.cursorAgent.getState()
  await addom.cursorAgent.prepareRuntime()
  await addom.cursorAgent.checkRuntimeUpdate()
  await addom.cursorAgent.installRuntimeUpdate()
  await addom.cursorAgent.startLogin()
  await addom.cursorAgent.cancelLogin()
  await addom.cursorAgent.logout()
  await addom.git.getHeaderStatus('C:\\repo')
  await addom.git.getRepositoryStatus('C:\\repo')
  await addom.git.getFileDiff('C:\\repo', 'src\\app.js', { scope: 'staged' })
  await addom.git.stageHunk('C:\\repo', 'src\\app.js', 'hunk:1')
  await addom.git.discardHunk('C:\\repo', 'src\\app.js', 'hunk:2')
  await addom.git.unstageHunk('C:\\repo', 'src\\app.js', 'hunk:2')
  await addom.git.restoreFile('C:\\repo', 'src\\deleted.js')
  await addom.git.stageFile('C:\\repo', 'src\\app.js', { previousFilePath: '' })
  await addom.git.unstageFile('C:\\repo', 'src\\renamed.js', { previousFilePath: 'src\\old.js' })
  await addom.git.stageAll('C:\\repo')
  await addom.git.unstageAll('C:\\repo')
  await addom.git.stageLines('C:\\repo', 'src\\app.js', { hunkId: 'hunk:3', startLine: 4, endLine: 6 })
  await addom.git.unstageLines('C:\\repo', 'src\\app.js', { hunkId: 'hunk:4', startLine: 8, endLine: 9 })
  await addom.git.discardLines('C:\\repo', 'src\\app.js', { hunkId: 'hunk:4', startLine: 8, endLine: 9 })
  await addom.git.commitStaged('C:\\repo', 'staged commit')
  await addom.openaiAssets.listProjectAssets('project-1')
  await addom.openaiAssets.ensureProjectVectorStore('project-1')
  await addom.openaiAssets.uploadFiles({ projectId: 'project-1', files: [], apiKey: 'sk-ignored' })
  await addom.openaiAssets.attachFilesToProjectVectorStore({ projectId: 'project-1', fileIds: [], apiKey: 'sk-ignored' })
  await addom.openaiAssets.removeProjectAsset('asset-1')
  await addom.openaiAssets.deleteProjectVectorStore('project-1')
  await addom.openaiAssets.syncProjectAssets('project-1')
  await addom.openaiMcp.listServers()
  await addom.openaiMcp.saveServer({ label: 'Docs', serverUrl: 'https://example.com/mcp', enabled: true })
  await addom.openaiMcp.deleteServer('docs')
  await addom.openaiMcp.setServerSecret('docs', { type: 'bearer', bearerToken: 'token' })
  await addom.openaiMcp.testServer('docs')
  await addom.settings.detectInstallSandboxBackend({ mode: 'strict' })
  await addom.settings.getAdvancedConfigDiagnostics()
  await addom.settings.reloadAdvancedConfig()
  await addom.settings.getAdvancedConfigSecurityWarning()
  await addom.settings.getEffectiveSourceDiagnostics()
  await addom.settings.getCommandSafetyTelemetry()
  await addom.settings.clearCommandSafetyTelemetry()

  await addom.editor.service.syncDocument({ event: 'open', projectFolder: 'C:\\repo', filePath: 'src/app.js' })
  await addom.editor.service.request({ kind: 'diagnostics', projectFolder: 'C:\\repo', filePath: 'src/app.js' })
  await addom.editor.service.refreshRuntime({ projectFolder: 'C:\\repo', filePath: 'src/app.js', language: 'javascript' })
  await addom.editor.requestInlineCompletion({ providerId: 'openai', model: 'gpt-5' })
  await addom.editor.logInlineCompletionTelemetry({ eventType: 'accept' })
  await addom.settings.getInlineCompletionTelemetry()
  await addom.settings.clearInlineCompletionTelemetry()
  await addom.pipeline.start({ pipelineId: 'review-fix-test', projectFolder: 'C:\\repo' })
  await addom.pipeline.getStatus('pipe_exec_1')
  await addom.council.start({ instruction: 'Review the codebase', projectFolder: 'C:\\repo' })
  await addom.council.getStatus('council_exec_1')
  await addom.agents.listRoleTemplates()
  await addom.agents.createRole({
    name: 'Auth Reviewer',
    systemPrompt: 'Review authentication code.',
    providerId: 'openai',
    model: 'gpt-5',
  })

  const invokedChannels = harness.invokeCalls.map((row) => row.channel)
  assert.ok(invokedChannels.every((channel) => String(channel || '').startsWith('v1:')))
  assert.match(invokedChannels.join('|'), /v1:workspace:list-projects/)
  assert.match(invokedChannels.join('|'), /v1:documents:read/)
  assert.match(invokedChannels.join('|'), /v1:documents:reveal/)
  assert.match(invokedChannels.join('|'), /v1:documents:answer-plan-direction/)
  assert.match(invokedChannels.join('|'), /v1:documents:change-plan-direction/)
  assert.match(invokedChannels.join('|'), /v1:documents:retry-plan-direction/)
  assert.match(invokedChannels.join('|'), /v1:documents:select-plan-authoring-profile/)
  assert.match(invokedChannels.join('|'), /v1:dialog:openFiles/)
  assert.match(invokedChannels.join('|'), /v1:terminal:runtime-health/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:create/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:list/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:attach/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:read-snapshot/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:publish-visible-snapshot/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:write/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:resize/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:signal/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:interrupt/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:close/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:terminate/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:rename/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:takeover/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:handback/)
  assert.match(invokedChannels.join('|'), /v1:terminal:session:focus-surface/)
  assert.match(invokedChannels.join('|'), /v1:terminal:archive:list/)
  assert.match(invokedChannels.join('|'), /v1:terminal:archive:get/)
  assert.match(invokedChannels.join('|'), /v1:terminal:archive:delete/)
  assert.match(invokedChannels.join('|'), /v1:terminal:archive:dismiss-suggestion/)
  assert.match(invokedChannels.join('|'), /v1:terminal:archive:accept-suggestion/)
  assert.match(invokedChannels.join('|'), /v1:terminal:archive:save-to-memory/)
  assert.match(invokedChannels.join('|'), /v1:attachments:text-extraction-status/)
  assert.match(invokedChannels.join('|'), /v1:settings:get/)
  assert.match(invokedChannels.join('|'), /v1:provider-auth:set-method/)
  assert.match(invokedChannels.join('|'), /v1:provider-runtime-settings:set/)
  assert.match(invokedChannels.join('|'), /v1:moa-roles:set/)
  assert.match(invokedChannels.join('|'), /v1:advanced-config:get-diagnostics/)
  assert.match(invokedChannels.join('|'), /v1:advanced-config:reload/)
  assert.match(invokedChannels.join('|'), /v1:advanced-config:security-warning/)
  assert.match(invokedChannels.join('|'), /v1:settings:get-effective-source-diagnostics/)
  assert.match(invokedChannels.join('|'), /v1:local-data:get-summary/)
  assert.match(invokedChannels.join('|'), /v1:local-data:get-provider-budget-summary/)
  assert.match(invokedChannels.join('|'), /v1:local-data:cleanup-provider-budget-profiles/)
  assert.match(invokedChannels.join('|'), /v1:local-data:reset-provider-budget-profiles/)
  assert.match(invokedChannels.join('|'), /v1:local-data:get-tool-result-spillover-summary/)
  assert.match(invokedChannels.join('|'), /v1:local-data:cleanup-tool-result-spillover/)
  assert.match(invokedChannels.join('|'), /v1:local-data:reset-tool-result-spillover/)
  assert.match(invokedChannels.join('|'), /v1:local-data:delete-api-keys/)
  assert.match(invokedChannels.join('|'), /v1:local-data:reset-all-and-restart/)
  assert.match(invokedChannels.join('|'), /v1:openai-account:get-state/)
  assert.match(invokedChannels.join('|'), /v1:openai-account:refresh-state/)
  assert.match(invokedChannels.join('|'), /v1:openai-account:prepare-runtime/)
  assert.match(invokedChannels.join('|'), /v1:openai-account:check-runtime-update/)
  assert.match(invokedChannels.join('|'), /v1:openai-account:install-runtime-update/)
  assert.match(invokedChannels.join('|'), /v1:openai-account:start-login/)
  assert.match(invokedChannels.join('|'), /v1:openai-account:reopen-login-browser/)
  assert.match(invokedChannels.join('|'), /v1:openai-account:cancel-login/)
  assert.match(invokedChannels.join('|'), /v1:openai-account:disconnect/)
  assert.match(invokedChannels.join('|'), /v1:cursor-agent:get-state/)
  assert.match(invokedChannels.join('|'), /v1:cursor-agent:prepare-runtime/)
  assert.match(invokedChannels.join('|'), /v1:cursor-agent:start-login/)
  assert.match(invokedChannels.join('|'), /v1:cursor-agent:cancel-login/)
  assert.match(invokedChannels.join('|'), /v1:cursor-agent:logout/)
  assert.match(invokedChannels.join('|'), /v1:git:getHeaderStatus/)
  assert.match(invokedChannels.join('|'), /v1:git:getRepositoryStatus/)
  assert.match(invokedChannels.join('|'), /v1:git:getFileDiff/)
  assert.match(invokedChannels.join('|'), /v1:git:stageHunk/)
  assert.match(invokedChannels.join('|'), /v1:git:discardHunk/)
  assert.match(invokedChannels.join('|'), /v1:git:unstageHunk/)
  assert.match(invokedChannels.join('|'), /v1:git:restoreFile/)
  assert.match(invokedChannels.join('|'), /v1:git:stageFile/)
  assert.match(invokedChannels.join('|'), /v1:git:unstageFile/)
  assert.match(invokedChannels.join('|'), /v1:git:stageAll/)
  assert.match(invokedChannels.join('|'), /v1:git:unstageAll/)
  assert.match(invokedChannels.join('|'), /v1:git:stageLines/)
  assert.match(invokedChannels.join('|'), /v1:git:unstageLines/)
  assert.match(invokedChannels.join('|'), /v1:git:discardLines/)
  assert.match(invokedChannels.join('|'), /v1:git:commitStaged/)
  assert.match(invokedChannels.join('|'), /v1:openai-assets:list-project-assets/)
  assert.match(invokedChannels.join('|'), /v1:openai-assets:ensure-project-vector-store/)
  assert.match(invokedChannels.join('|'), /v1:openai-assets:upload-files/)
  assert.match(invokedChannels.join('|'), /v1:openai-assets:attach-files-to-project-vector-store/)
  assert.match(invokedChannels.join('|'), /v1:openai-assets:remove-project-asset/)
  assert.match(invokedChannels.join('|'), /v1:openai-assets:delete-project-vector-store/)
  assert.match(invokedChannels.join('|'), /v1:openai-assets:sync-project-assets/)
  assert.match(invokedChannels.join('|'), /v1:openai-mcp:list-servers/)
  assert.match(invokedChannels.join('|'), /v1:openai-mcp:save-server/)
  assert.match(invokedChannels.join('|'), /v1:openai-mcp:delete-server/)
  assert.match(invokedChannels.join('|'), /v1:openai-mcp:set-server-secret/)
  assert.match(invokedChannels.join('|'), /v1:openai-mcp:test-server/)
  assert.match(invokedChannels.join('|'), /v1:settings:detect-install-sandbox-backend/)
  assert.match(invokedChannels.join('|'), /v1:settings:get-command-safety-telemetry/)
  assert.match(invokedChannels.join('|'), /v1:settings:clear-command-safety-telemetry/)
  assert.match(invokedChannels.join('|'), /v1:settings:get-inline-completion-telemetry/)
  assert.match(invokedChannels.join('|'), /v1:settings:clear-inline-completion-telemetry/)
  assert.match(invokedChannels.join('|'), /v1:editor:service:sync-document/)
  assert.match(invokedChannels.join('|'), /v1:editor:service:request/)
  assert.match(invokedChannels.join('|'), /v1:editor:service:refresh-runtime/)
  assert.match(invokedChannels.join('|'), /v1:editor:request-inline-completion/)
  assert.match(invokedChannels.join('|'), /v1:editor:log-inline-completion-telemetry/)
  assert.match(invokedChannels.join('|'), /v1:pipeline:start/)
  assert.match(invokedChannels.join('|'), /v1:pipeline:get-status/)
  assert.match(invokedChannels.join('|'), /v1:council:start/)
  assert.match(invokedChannels.join('|'), /v1:council:get-status/)
  assert.match(invokedChannels.join('|'), /v1:agents:list-role-templates/)
  assert.match(invokedChannels.join('|'), /v1:agents:create-role/)
  assert.doesNotMatch(invokedChannels.join('|'), /v1:moa:/)

  const uploadCall = harness.invokeCalls.find((row) => row.channel === 'v1:openai-assets:upload-files')
  assert.deepEqual(uploadCall?.payload, { projectId: 'project-1', files: [] })
  const attachCall = harness.invokeCalls.find((row) => row.channel === 'v1:openai-assets:attach-files-to-project-vector-store')
  assert.deepEqual(attachCall?.payload, { projectId: 'project-1', fileIds: [] })
})

test('preload invokeVersioned rethrows genuine handler errors instead of falling back silently', async () => {
  const harness = await createPreloadHarness({
    invokeBehavior: async (channel) => {
      if (String(channel || '') === 'v1:workspace:list-projects') {
        throw new Error('workspace db unavailable')
      }
      return { ok: true, channel }
    },
  })

  await assert.rejects(
    () => harness.addom.workspace.listProjects(),
    /workspace db unavailable/,
  )
  assert.deepEqual(
    harness.invokeCalls.map((row) => row.channel),
    ['v1:workspace:list-projects'],
  )
})

test('preload missing versioned handlers reject instead of falling back to bare channels', async () => {
  const harness = await createPreloadHarness({
    invokeBehavior: async (channel) => {
      throw new Error(`No handler registered for ${channel}`)
    },
  })

  await assert.rejects(
    () => harness.addom.workspace.listProjects(),
    /No handler registered for v1:workspace:list-projects/,
  )
  assert.deepEqual(
    harness.invokeCalls.map((row) => row.channel),
    ['v1:workspace:list-projects'],
  )
})

test('preload always routes OpenAI account actions through versioned IPC without feature-flag short-circuits', async () => {
  const harness = await createPreloadHarness({
    invokeBehavior: async (channel) => ({ ok: true, channel }),
  })

  const state = await harness.addom.openaiAccount.refreshState()
  const loginResult = await harness.addom.openaiAccount.startLogin()
  const reopenResult = await harness.addom.openaiAccount.reopenLoginBrowser('login_1')

  assert.equal(state?.channel, 'v1:openai-account:refresh-state')
  assert.equal(loginResult?.ok, true)
  assert.equal(loginResult?.channel, 'v1:openai-account:start-login')
  assert.equal(reopenResult?.ok, true)
  assert.equal(reopenResult?.channel, 'v1:openai-account:reopen-login-browser')
  assert.deepEqual(
    harness.invokeCalls.map((row) => row.channel),
    [
      'v1:openai-account:refresh-state',
      'v1:openai-account:start-login',
      'v1:openai-account:reopen-login-browser',
    ],
  )
})

test('preload keeps OpenAI account routing free of legacy result-shape shims', () => {
  const source = fs.readFileSync(path.resolve('src/preload/index.mjs'), 'utf8')
  assert.match(source, /async function invokeOpenAIAccountVersioned\(channel, payload\)/)
  assert.doesNotMatch(source, /resultShape/)
})

test('preload tool.respond only sends allowlisted approval response channels', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  addom.tool.respond('approval_1', 'approved', 'tool:approval-response:approval_1', '', {
    runCommand: { hostFullAccess: true },
  })
  assert.equal(harness.sent.length, 1)
  assert.equal(harness.sent[0].channel, 'v1:tool:approval-response:approval_1')

  addom.tool.respond('approval_2', 'approved', 'settings:set', '')
  assert.equal(harness.sent.length, 1)

  addom.tool.respond('approval_3', 'denied')
  assert.equal(harness.sent.length, 2)
  assert.equal(harness.sent[1].channel, 'v1:tool:approval-response')
})

test('preload subscription helpers register and unsubscribe versioned listeners', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  let chunkPayload = null
  const unsub = addom.chat.onChunk((payload) => {
    chunkPayload = payload
  })
  assert.equal(typeof unsub, 'function')
  assert.equal(harness.listenerCount('v1:chat:chunk'), 1)

  harness.emit('v1:chat:chunk', { chunk: 'hello' })
  assert.deepEqual(chunkPayload, { chunk: 'hello' })

  unsub()
  assert.equal(harness.listenerCount('v1:chat:chunk'), 0)
  harness.emit('v1:chat:chunk', { chunk: 'ignored' })
  assert.deepEqual(chunkPayload, { chunk: 'hello' })

  let securityWarning = null
  const unsubSecurity = addom.settings.onSecurityWarning((payload) => {
    securityWarning = payload
  })
  assert.equal(harness.listenerCount('v1:settings:security-warning'), 1)

  harness.emit('v1:settings:security-warning', { changedFields: ['permissionMode'] })
  assert.deepEqual(securityWarning, { changedFields: ['permissionMode'] })

  unsubSecurity()
  assert.equal(harness.listenerCount('v1:settings:security-warning'), 0)

  let workspaceActivationPayload = null
  const unsubWorkspaceActivation = addom.workspace.onActiveProjectChanged((payload) => {
    workspaceActivationPayload = payload
  })
  assert.equal(harness.listenerCount('v1:workspace:active-project-changed'), 1)

  harness.emit('v1:workspace:active-project-changed', {
    action: 'open-project',
    project: { id: 'project_1' },
    activeThread: { id: 'thread_1' },
  })
  assert.deepEqual(workspaceActivationPayload, {
    action: 'open-project',
    project: { id: 'project_1' },
    activeThread: { id: 'thread_1' },
  })

  unsubWorkspaceActivation()
  assert.equal(harness.listenerCount('v1:workspace:active-project-changed'), 0)

  let accountSessionPayload = null
  const unsubOpenAIAccountSession = addom.openaiAccount.onSessionUpdated((payload) => {
    accountSessionPayload = payload
  })
  assert.equal(harness.listenerCount('v1:openai-account:session-updated'), 1)

  harness.emit('v1:openai-account:session-updated', { hasSession: true, status: 'connected' })
  assert.deepEqual(accountSessionPayload, { hasSession: true, status: 'connected' })

  unsubOpenAIAccountSession()
  assert.equal(harness.listenerCount('v1:openai-account:session-updated'), 0)

  let accountLoginPayload = null
  const unsubOpenAIAccountLogin = addom.openaiAccount.onLoginUpdated((payload) => {
    accountLoginPayload = payload
  })
  assert.equal(harness.listenerCount('v1:openai-account:login-updated'), 1)

  harness.emit('v1:openai-account:login-updated', { loginId: 'login_1', phase: 'failed' })
  assert.deepEqual(accountLoginPayload, { loginId: 'login_1', phase: 'failed' })

  unsubOpenAIAccountLogin()
  assert.equal(harness.listenerCount('v1:openai-account:login-updated'), 0)

  let accountStoragePayload = null
  const unsubOpenAIAccountStorage = addom.openaiAccount.onStorageUpdated((payload) => {
    accountStoragePayload = payload
  })
  assert.equal(harness.listenerCount('v1:openai-account:storage-updated'), 1)

  harness.emit('v1:openai-account:storage-updated', { runtime: { status: 'runtime_downloading', percent: 42 } })
  assert.deepEqual(accountStoragePayload, { runtime: { status: 'runtime_downloading', percent: 42 } })

  unsubOpenAIAccountStorage()
  assert.equal(harness.listenerCount('v1:openai-account:storage-updated'), 0)

  let compactionPayload = null
  const unsubCompaction = addom.chat.onOpenAICompactionEvent((payload) => {
    compactionPayload = payload
  })
  assert.equal(harness.listenerCount('v1:chat:openai-compaction-event'), 1)

  harness.emit('v1:chat:openai-compaction-event', { status: 'applied', compactionId: 'cmp_1' })
  assert.deepEqual(compactionPayload, { status: 'applied', compactionId: 'cmp_1' })

  unsubCompaction()
  assert.equal(harness.listenerCount('v1:chat:openai-compaction-event'), 0)

  let anthropicCompactionPayload = null
  const unsubAnthropicCompaction = addom.chat.onAnthropicCompactionEvent((payload) => {
    anthropicCompactionPayload = payload
  })
  assert.equal(harness.listenerCount('v1:chat:anthropic-compaction-event'), 1)

  harness.emit('v1:chat:anthropic-compaction-event', { status: 'applied', providerId: 'anthropic' })
  assert.deepEqual(anthropicCompactionPayload, { status: 'applied', providerId: 'anthropic' })

  unsubAnthropicCompaction()
  assert.equal(harness.listenerCount('v1:chat:anthropic-compaction-event'), 0)

  let toolOutputPayload = null
  const unsubToolOutput = addom.chat.onToolOutput((payload) => {
    toolOutputPayload = payload
  })
  assert.equal(harness.listenerCount('v1:chat:tool-output'), 1)

  harness.emit('v1:chat:tool-output', { stepId: 'step-1', chunk: 'hello' })
  assert.deepEqual(toolOutputPayload, { stepId: 'step-1', chunk: 'hello' })

  unsubToolOutput()
  assert.equal(harness.listenerCount('v1:chat:tool-output'), 0)

  let toolWorkflowTelemetryPayload = null
  const unsubToolWorkflowTelemetry = addom.chat.onToolWorkflowTelemetry((payload) => {
    toolWorkflowTelemetryPayload = payload
  })
  assert.equal(harness.listenerCount('v1:chat:tool-workflow-telemetry'), 1)

  harness.emit('v1:chat:tool-workflow-telemetry', { turnId: 'turn-1', lintRejectCount: 2 })
  assert.deepEqual(toolWorkflowTelemetryPayload, { turnId: 'turn-1', lintRejectCount: 2 })

  unsubToolWorkflowTelemetry()
  assert.equal(harness.listenerCount('v1:chat:tool-workflow-telemetry'), 0)
})

test('preload terminal subscription helper stays on versioned IPC and cleans up both listener layers', async () => {
  const harness = await createPreloadHarness({
    invokeBehavior: async (channel, payload) => {
      if (channel === 'v1:terminal:session:subscribe') {
        return { ok: true, subscriptionId: 'term_sub_1', sessionId: payload?.sessionId || '' }
      }
      if (channel === 'v1:terminal:session:unsubscribe') {
        return { ok: true, subscriptionId: payload?.subscriptionId || '' }
      }
      return { ok: true, channel, payload }
    },
  })

  let received = null
  const unsubscribe = await harness.addom.terminal.subscribe({ sessionId: 'term_1' }, (payload) => {
    received = payload
  })

  assert.equal(typeof unsubscribe, 'function')
  assert.equal(harness.listenerCount('v1:terminal:session:event'), 1)
  harness.emit('v1:terminal:session:event', {
    subscriptionId: 'term_sub_1',
    event: { type: 'data', sessionId: 'term_1' },
  })
  assert.deepEqual(received, { type: 'data', sessionId: 'term_1' })

  await unsubscribe()
  assert.equal(harness.listenerCount('v1:terminal:session:event'), 0)
  assert.deepEqual(
    harness.invokeCalls.map((row) => row.channel).slice(-2),
    ['v1:terminal:session:subscribe', 'v1:terminal:session:unsubscribe'],
  )
})

test('preload terminal subscriptions share one IPC event listener across sessions', async () => {
  const harness = await createPreloadHarness({
    invokeBehavior: async (channel, payload) => {
      if (channel === 'v1:terminal:session:subscribe') {
        return { ok: true, subscriptionId: `sub:${payload?.sessionId || ''}` }
      }
      if (channel === 'v1:terminal:session:unsubscribe') {
        return { ok: true, subscriptionId: payload?.subscriptionId || '' }
      }
      return { ok: true, channel, payload }
    },
  })

  let firstReceived = null
  let secondReceived = null
  const unsubscribeFirst = await harness.addom.terminal.subscribe({ sessionId: 'term_1' }, (payload) => {
    firstReceived = payload
  })
  const unsubscribeSecond = await harness.addom.terminal.subscribe({ sessionId: 'term_2' }, (payload) => {
    secondReceived = payload
  })

  assert.equal(harness.listenerCount('v1:terminal:session:event'), 1)

  harness.emit('v1:terminal:session:event', {
    subscriptionId: 'sub:term_1',
    event: { type: 'data', sessionId: 'term_1', chunk: 'one' },
  })
  harness.emit('v1:terminal:session:event', {
    subscriptionId: 'sub:term_2',
    event: { type: 'data', sessionId: 'term_2', chunk: 'two' },
  })

  assert.deepEqual(firstReceived, { type: 'data', sessionId: 'term_1', chunk: 'one' })
  assert.deepEqual(secondReceived, { type: 'data', sessionId: 'term_2', chunk: 'two' })

  await unsubscribeFirst()
  assert.equal(harness.listenerCount('v1:terminal:session:event'), 1)

  await unsubscribeSecond()
  assert.equal(harness.listenerCount('v1:terminal:session:event'), 0)
})

test('preload subscription helpers reject non-function callbacks', async () => {
  const harness = await createPreloadHarness()

  assert.throws(
    () => harness.addom.chat.onChunk(null),
    /callback must be a function/,
  )
  assert.equal(harness.listenerCount('v1:chat:chunk'), 0)
})

test('preload exposes artifact tracking subscription on the versioned chat channel', async () => {
  const harness = await createPreloadHarness()

  const unsubscribe = harness.addom.chat.onArtifactTracking(() => {})

  assert.equal(harness.listenerCount('v1:chat:artifact-tracking'), 1)
  unsubscribe()
  assert.equal(harness.listenerCount('v1:chat:artifact-tracking'), 0)
})

test('preload chat stream forwards assistantMessageId and background response subscriptions', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  addom.chat.stream(
    'openai',
    'gpt-5.2',
    [{ role: 'user', content: 'Hello' }],
    'C:\\repo',
    'autonomy',
    'execute',
    true,
    50,
    'project-1',
    'thread-1',
    'turn-1',
    'Hello',
    'assistant-1',
  )

  assert.deepEqual(harness.sent[0], {
    channel: 'v1:chat:stream',
    payload: {
      providerId: 'openai',
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: 'Hello' }],
      projectFolder: 'C:\\repo',
      permissionMode: 'autonomy',
      mode: 'execute',
      memoryCompressionEnabled: true,
      memoryCompressionThreshold: 50,
      projectId: 'project-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      currentUserMessage: 'Hello',
      assistantMessageId: 'assistant-1',
    },
  })

  const unsub = addom.chat.onBackgroundResponseQueued(() => {})
  assert.equal(harness.listenerCount('v1:chat:background-response-queued'), 1)
  unsub()
  assert.equal(harness.listenerCount('v1:chat:background-response-queued'), 0)
})

test('preload chat stream forwards sanitized turn options only when present', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  addom.chat.stream(
    'openai',
    'gpt-5.2',
    [{ role: 'user', content: 'Continue' }],
    'C:\\repo',
    'ask',
    'execute',
    true,
    50,
    'project-1',
    'thread-1',
    'turn-1',
    'Continue',
    'assistant-2',
    {
      openai: {
        forceServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 180000.6,
        commandOnly: false,
      },
    },
  )

  assert.deepEqual(harness.sent[0], {
    channel: 'v1:chat:stream',
    payload: {
      providerId: 'openai',
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: 'Continue' }],
      projectFolder: 'C:\\repo',
      permissionMode: 'ask',
      mode: 'execute',
      memoryCompressionEnabled: true,
      memoryCompressionThreshold: 50,
      projectId: 'project-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      currentUserMessage: 'Continue',
      assistantMessageId: 'assistant-2',
      turnOptions: {
        openai: {
          forceServerSideCompaction: true,
          serverSideCompactionThresholdTokens: 180001,
        },
      },
    },
  })
})

test('preload chat stream preserves Anthropic compaction turn options', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  addom.chat.stream(
    'anthropic',
    'claude-sonnet-4-6',
    [{ role: 'user', content: 'Continue' }],
    'C:\\repo',
    'ask',
    'execute',
    true,
    50,
    'project-1',
    'thread-1',
    'turn-1',
    'Continue',
    'assistant-3',
    {
      anthropic: {
        forceContextManagementCompaction: true,
        contextManagementCompactionThresholdTokens: 80000.2,
        contextManagementCompactionInstructions: '  Keep decisions and constraints.  ',
      },
    },
  )

  assert.deepEqual(harness.sent[0], {
    channel: 'v1:chat:stream',
    payload: {
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Continue' }],
      projectFolder: 'C:\\repo',
      permissionMode: 'ask',
      mode: 'execute',
      memoryCompressionEnabled: true,
      memoryCompressionThreshold: 50,
      projectId: 'project-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      currentUserMessage: 'Continue',
      assistantMessageId: 'assistant-3',
      turnOptions: {
        anthropic: {
          forceContextManagementCompaction: true,
          contextManagementCompactionThresholdTokens: 80000,
          contextManagementCompactionInstructions: 'Keep decisions and constraints.',
        },
      },
    },
  })
})

test('preload chat stream preserves command tool-disable turn options', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  addom.chat.stream(
    'anthropic',
    'claude-haiku-4-5',
    [{ role: 'user', content: 'Create an agent role for: codebase analyzer' }],
    'C:\\repo',
    'ask',
    'execute',
    true,
    50,
    'project-1',
    'thread-1',
    'turn-1',
    'Create an agent role for: codebase analyzer',
    'assistant-3b',
    {
      command: {
        disableTools: true,
        preserveHistory: false,
      },
    },
  )

  assert.deepEqual(harness.sent[0], {
    channel: 'v1:chat:stream',
    payload: {
      providerId: 'anthropic',
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'Create an agent role for: codebase analyzer' }],
      projectFolder: 'C:\\repo',
      permissionMode: 'ask',
      mode: 'execute',
      memoryCompressionEnabled: true,
      memoryCompressionThreshold: 50,
      projectId: 'project-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      currentUserMessage: 'Create an agent role for: codebase analyzer',
      assistantMessageId: 'assistant-3b',
      turnOptions: {
        command: {
          disableTools: true,
        },
      },
    },
  })
})

test('preload chat stream discards obsolete renderer-owned plan-state turn options', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  addom.chat.stream(
    'openai',
    'gpt-5.2',
    [{ role: 'user', content: 'Implement it.' }],
    'C:\\repo',
    'ask',
    'execute',
    true,
    50,
    'project-1',
    'thread-1',
    'turn-1',
    'Implement it.',
    'assistant-4',
    {
      planState: {
        mode: 'execute_from_plan',
        summary: '  Preserve OpenAI first.  ',
        decisions: [' msg_1: opt_a '],
        questionsResolved: [' q_scope: keep OpenAI '],
        questionsOpen: [' request:msg_1:req_1 '],
        steps: [{
          id: ' msg_1:req_1 ',
          text: ' Inspect compaction modules ',
          status: 'pending',
        }],
        immediateNextStep: ' Inspect compaction modules ',
        canonicalPlan: {
          messageId: ' msg_1 ',
          summary: ' Preserve OpenAI first. ',
          selectedOptionId: ' opt_a ',
          customDirection: ' ',
          questions: [{
            id: ' q_scope ',
            text: ' What provider should lead? ',
            choices: [' keep OpenAI ', ' stay provider agnostic '],
            answer: ' keep OpenAI ',
          }],
          options: [{
            id: ' opt_a ',
            title: ' OpenAI first ',
            description: ' Start with OpenAI continuity surfaces. ',
            recommended: true,
            selected: true,
          }],
          requests: [{
            id: ' req_1 ',
            type: ' artifact_review ',
            reason: ' Inspect compaction modules ',
            trackedRequestId: ' msg_1:req_1 ',
            status: ' pending ',
            traceSummary: ' Inspect compaction modules ',
            filePaths: [' src\\main\\chat\\chat-stream-precall-round.mjs '],
          }],
        },
      },
    },
  )

  assert.equal(harness.sent[0].payload.turnOptions?.planState, undefined)
})

test('preload subscription helpers enforce a per-channel listener cap', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom
  const unsubscribers = []

  for (let i = 0; i < 10; i += 1) {
    unsubscribers.push(addom.chat.onChunk(() => {}))
  }
  assert.equal(harness.listenerCount('v1:chat:chunk'), 10)

  const noOpUnsub = addom.chat.onChunk(() => {})
  assert.equal(typeof noOpUnsub, 'function')
  assert.equal(harness.listenerCount('v1:chat:chunk'), 10)

  noOpUnsub()
  assert.equal(harness.listenerCount('v1:chat:chunk'), 10)

  const firstUnsub = unsubscribers[0]
  firstUnsub()
  firstUnsub()
  assert.equal(harness.listenerCount('v1:chat:chunk'), 9)

  for (const unsub of unsubscribers.slice(1)) {
    unsub()
  }
  assert.equal(harness.listenerCount('v1:chat:chunk'), 0)
})
