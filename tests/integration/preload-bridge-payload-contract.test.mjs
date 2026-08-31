import test from 'node:test'
import assert from 'node:assert/strict'

import { createPreloadHarness } from './preload-bridge-test-helpers.mjs'

test('preload scopes Artifact file discovery without changing revision requests', async () => {
  const harness = await createPreloadHarness()

  await harness.addom.artifacts.listFiles(' demo-project ', { threadId: ' thread-artifact ' })
  await harness.addom.artifacts.listRevisions(' demo-project ', ' src/example.js ')

  assert.deepEqual(harness.invokeCalls, [
    {
      channel: 'v1:artifacts:listFiles',
      payload: { project: 'demo-project', threadId: 'thread-artifact' },
    },
    {
      channel: 'v1:artifacts:listRevisions',
      payload: { project: 'demo-project', filePath: 'src/example.js' },
    },
  ])
})

test('preload attachment actions retain only scoped descriptors and opaque app IDs', async () => {
  const harness = await createPreloadHarness()
  const attachment = {
    attachmentId: ' att_1 ',
    fileName: ' notes.txt ',
    mediaType: ' text/plain ',
    kind: ' file ',
    path: 'C:\\Private\\notes.txt',
  }
  const scope = { projectId: ' project_1 ', threadId: ' thread_1 ', path: 'private' }

  await harness.addom.attachments.copy(attachment, scope)
  await harness.addom.attachments.reveal(attachment, scope)
  await harness.addom.attachments.saveAs(attachment, scope)
  await harness.addom.attachments.listOpenWith(attachment, scope)
  await harness.addom.attachments.openWith(attachment, ' app_cursor ', scope)

  assert.deepEqual(harness.invokeCalls, [
    {
      channel: 'v1:attachments:copy',
      payload: {
        attachment: {
          attachmentId: 'att_1',
          kind: 'file',
          mediaType: 'text/plain',
          fileName: 'notes.txt',
        },
        projectId: 'project_1',
        threadId: 'thread_1',
      },
    },
    {
      channel: 'v1:attachments:reveal',
      payload: {
        attachment: {
          attachmentId: 'att_1',
          kind: 'file',
          mediaType: 'text/plain',
          fileName: 'notes.txt',
        },
        projectId: 'project_1',
        threadId: 'thread_1',
      },
    },
    {
      channel: 'v1:attachments:save-as',
      payload: {
        attachment: {
          attachmentId: 'att_1',
          kind: 'file',
          mediaType: 'text/plain',
          fileName: 'notes.txt',
        },
        projectId: 'project_1',
        threadId: 'thread_1',
      },
    },
    {
      channel: 'v1:attachments:list-open-with',
      payload: {
        attachment: {
          attachmentId: 'att_1',
          kind: 'file',
          mediaType: 'text/plain',
          fileName: 'notes.txt',
        },
        projectId: 'project_1',
        threadId: 'thread_1',
      },
    },
    {
      channel: 'v1:attachments:open-with',
      payload: {
        attachment: {
          attachmentId: 'att_1',
          kind: 'file',
          mediaType: 'text/plain',
          fileName: 'notes.txt',
        },
        applicationId: 'app_cursor',
        projectId: 'project_1',
        threadId: 'thread_1',
      },
    },
  ])
  assert.equal(JSON.stringify(harness.invokeCalls).includes('Private'), false)
})

test('preload shell helpers validate and normalize shell IPC payloads', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  await addom.shell.openPath('  C:\\Users\\example\\Documents\\ADDOM  ')
  await addom.shell.showOpenContainingFolderMenu('  C:\\Users\\example\\Documents\\ADDOM\\src  ')
  await addom.shell.openExternal('https://example.com/docs?q=1')

  assert.deepEqual(harness.invokeCalls[0], {
    channel: 'v1:shell:openPath',
    payload: 'C:\\Users\\example\\Documents\\ADDOM',
  })
  assert.deepEqual(harness.invokeCalls[1], {
    channel: 'v1:shell:showOpenContainingFolderMenu',
    payload: 'C:\\Users\\example\\Documents\\ADDOM\\src',
  })
  assert.deepEqual(harness.invokeCalls[2], {
    channel: 'v1:shell:openExternal',
    payload: 'https://example.com/docs?q=1',
  })

  assert.throws(
    () => addom.shell.openPath('   '),
    /path is required/,
  )
  assert.throws(
    () => addom.shell.openPath(42),
    /path must be a string/,
  )
  assert.throws(
    () => addom.shell.openExternal('javascript:alert(1)'),
    /url must use http or https/,
  )
  assert.throws(
    () => addom.shell.openExternal('file:///tmp/demo.txt'),
    /url must use http or https/,
  )
  assert.throws(
    () => addom.shell.openExternal('not a url'),
    /url must be a valid URL/,
  )
})

test('preload normalizes string identifiers and prevents payload override merges', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  await addom.workspace.openProject('  C:\\repo\\project-a  ', { notifyRenderer: false, path: 'evil' })
  await addom.workspace.setActiveProject('  project-1  ')
  await addom.workspace.setActiveProject('  project-2  ', { notifyRenderer: false, projectId: 'evil' })
  await addom.git.getRepositoryStatus('  C:\\repo  ')
  await addom.git.getFileDiff('  C:\\repo  ', '  src\\app.js  ', { scope: ' staged ' })
  await addom.git.stageHunk('  C:\\repo  ', '  src\\app.js  ', '  hunk:1  ')
  await addom.git.discardHunk('  C:\\repo  ', '  src\\app.js  ', '  hunk:2  ')
  await addom.git.unstageHunk('  C:\\repo  ', '  src\\app.js  ', '  hunk:3  ')
  await addom.git.restoreFile('  C:\\repo  ', '  src\\deleted.js  ')
  await addom.git.unstageFile('  C:\\repo  ', '  src\\renamed.js  ', { previousPath: ' src\\old.js ', filePath: 'evil' })
  await addom.git.stageLines('  C:\\repo  ', '  src\\app.js  ', { hunkId: ' hunk:3 ', startLine: '12', endLine: '14', filePath: 'evil' })
  await addom.git.unstageLines('  C:\\repo  ', '  src\\app.js  ', { hunkId: ' hunk:4 ', startLine: 15.4, endLine: 16.6 })
  await addom.git.discardLines('  C:\\repo  ', '  src\\app.js  ', { hunkId: ' hunk:4 ', startLine: 18.8, endLine: 21.2, projectFolder: 'evil' })
  await addom.git.commitStaged('  C:\\repo  ', '  staged commit  ')
  await addom.terminal.writeSession('  term_1  ', 'echo hi', {
    submit: true,
    projectFolder: '  C:\\repo  ',
    permissionMode: ' ask ',
    sessionId: 'evil',
    data: 'evil',
  })
  await addom.workspace.listTimeline('safe-thread', { threadId: 'evil-thread', limit: 99, afterEventId: 4 })
  await addom.processes.stopBackground(42)
  await addom.memory.update('safe-id', { id: 'evil-id', topic: 'x', pinned: true })
  await addom.artifacts.undoFileChange('proj', { project: 'evil', filePath: 'a.js', newRevId: 'rev-2' })

  assert.deepEqual(harness.invokeCalls[0], {
    channel: 'v1:workspace:open-project',
    payload: { path: 'C:\\repo\\project-a', notifyRenderer: false },
  })
  assert.deepEqual(harness.invokeCalls[1], {
    channel: 'v1:workspace:set-active-project',
    payload: { projectId: 'project-1' },
  })
  assert.deepEqual(harness.invokeCalls[2], {
    channel: 'v1:workspace:set-active-project',
    payload: { projectId: 'project-2', notifyRenderer: false },
  })
  assert.deepEqual(harness.invokeCalls[3], {
    channel: 'v1:git:getRepositoryStatus',
    payload: {
      projectFolder: 'C:\\repo',
    },
  })
  assert.deepEqual(harness.invokeCalls[4], {
    channel: 'v1:git:getFileDiff',
    payload: {
      projectFolder: 'C:\\repo',
      filePath: 'src\\app.js',
      scope: 'staged',
    },
  })
  assert.deepEqual(harness.invokeCalls[5], {
    channel: 'v1:git:stageHunk',
    payload: {
      projectFolder: 'C:\\repo',
      filePath: 'src\\app.js',
      hunkId: 'hunk:1',
    },
  })
  assert.deepEqual(harness.invokeCalls[6], {
    channel: 'v1:git:discardHunk',
    payload: {
      projectFolder: 'C:\\repo',
      filePath: 'src\\app.js',
      hunkId: 'hunk:2',
    },
  })
  assert.deepEqual(harness.invokeCalls[7], {
    channel: 'v1:git:unstageHunk',
    payload: {
      projectFolder: 'C:\\repo',
      filePath: 'src\\app.js',
      hunkId: 'hunk:3',
    },
  })
  assert.deepEqual(harness.invokeCalls[8], {
    channel: 'v1:git:restoreFile',
    payload: {
      projectFolder: 'C:\\repo',
      filePath: 'src\\deleted.js',
    },
  })
  assert.deepEqual(harness.invokeCalls[9], {
    channel: 'v1:git:unstageFile',
    payload: {
      projectFolder: 'C:\\repo',
      filePath: 'src\\renamed.js',
      previousFilePath: 'src\\old.js',
    },
  })
  assert.deepEqual(harness.invokeCalls[10], {
    channel: 'v1:git:stageLines',
    payload: {
      projectFolder: 'C:\\repo',
      filePath: 'src\\app.js',
      hunkId: 'hunk:3',
      startLine: 12,
      endLine: 14,
    },
  })
  assert.deepEqual(harness.invokeCalls[11], {
    channel: 'v1:git:unstageLines',
    payload: {
      projectFolder: 'C:\\repo',
      filePath: 'src\\app.js',
      hunkId: 'hunk:4',
      startLine: 15,
      endLine: 17,
    },
  })
  assert.deepEqual(harness.invokeCalls[12], {
    channel: 'v1:git:discardLines',
    payload: {
      projectFolder: 'C:\\repo',
      filePath: 'src\\app.js',
      hunkId: 'hunk:4',
      startLine: 19,
      endLine: 21,
    },
  })
  assert.deepEqual(harness.invokeCalls[13], {
    channel: 'v1:git:commitStaged',
    payload: {
      projectFolder: 'C:\\repo',
      message: 'staged commit',
    },
  })
  assert.deepEqual(harness.invokeCalls[14], {
    channel: 'v1:terminal:session:write',
    payload: {
      sessionId: 'term_1',
      data: 'echo hi',
      submit: true,
      projectFolder: 'C:\\repo',
      permissionMode: 'ask',
    },
  })
  assert.deepEqual(harness.invokeCalls[15], {
    channel: 'v1:workspace:list-timeline',
    payload: {
      threadId: 'safe-thread',
      limit: 99,
      afterEventId: 4,
    },
  })
  assert.deepEqual(harness.invokeCalls[16], {
    channel: 'v1:processes:stop-background',
    payload: { id: '42' },
  })
  assert.deepEqual(harness.invokeCalls[17], {
    channel: 'v1:memory:update',
    payload: {
      id: 'safe-id',
      topic: 'x',
      pinned: true,
    },
  })
  assert.deepEqual(harness.invokeCalls[18], {
    channel: 'v1:artifacts:undoFileChange',
    payload: {
      project: 'proj',
      filePath: 'a.js',
      newRevId: 'rev-2',
      prevRevId: '',
      changeType: '',
    },
  })
})

test('workspace thread mutations can suppress renderer activation notifications for store-owned navigation', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  await addom.workspace.createThread('  project-1  ', 'Thread', { notifyRenderer: false })
  await addom.workspace.setActiveThread('  project-1  ', '  thread-1  ', { notifyRenderer: false })

  assert.deepEqual(harness.invokeCalls, [
    {
      channel: 'v1:workspace:create-thread',
      payload: { projectId: 'project-1', title: 'Thread', notifyRenderer: false },
    },
    {
      channel: 'v1:workspace:set-active-thread',
      payload: { projectId: 'project-1', threadId: 'thread-1', notifyRenderer: false },
    },
  ])
})

test('workspace auto-title payload is scoped to the owning project and thread', async () => {
  const harness = await createPreloadHarness()

  await harness.addom.workspace.autoTitleThread(' project-1 ', ' thread-1 ', '  Inspect the renderer state.  ')

  assert.deepEqual(harness.invokeCalls, [{
    channel: 'v1:workspace:auto-title-thread',
    payload: {
      projectId: 'project-1',
      threadId: 'thread-1',
      prompt: '  Inspect the renderer state.  ',
    },
  }])
})

test('preload normalizes whole-file and repository staging payloads', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  await addom.git.stageFile('  C:\\repo  ', '  src\\renamed.js  ', { previousPath: ' src\\old.js ', filePath: 'evil' })
  await addom.git.stageAll('  C:\\repo  ')
  await addom.git.unstageAll('  C:\\repo  ')

  assert.deepEqual(harness.invokeCalls, [
    {
      channel: 'v1:git:stageFile',
      payload: {
        projectFolder: 'C:\\repo',
        filePath: 'src\\renamed.js',
        previousFilePath: 'src\\old.js',
      },
    },
    {
      channel: 'v1:git:stageAll',
      payload: { projectFolder: 'C:\\repo' },
    },
    {
      channel: 'v1:git:unstageAll',
      payload: { projectFolder: 'C:\\repo' },
    },
  ])
})

test('preload normalizes workspace thread activity acknowledgements', async () => {
  const harness = await createPreloadHarness()

  await harness.addom.workspace.acknowledgeThreadActivity('  thread-activity  ', 1250.6)

  assert.deepEqual(harness.invokeCalls, [{
    channel: 'v1:workspace:acknowledge-thread-activity',
    payload: {
      threadId: 'thread-activity',
      acknowledgedAt: 1251,
    },
  }])
})

test('preload scopes workspace disposal preflight and explicit stop authorization', async () => {
  const harness = await createPreloadHarness()

  await harness.addom.workspace.getDisposalImpact({
    scope: ' PROJECT ',
    projectId: ' project-a ',
    threadId: ' ignored-thread ',
  })
  await harness.addom.workspace.stopActiveWork({
    scope: ' PROJECT ',
    projectId: ' project-a ',
    threadId: ' ignored-thread ',
    stopActive: true,
  })
  await harness.addom.workspace.deleteThread(' thread-b ', { stopActive: false })
  await harness.addom.workspace.removeProject(' project-b ', { stopActive: true })

  assert.deepEqual(harness.invokeCalls, [
    {
      channel: 'v1:workspace:get-disposal-impact',
      payload: { scope: 'project', projectId: 'project-a', threadId: 'ignored-thread' },
    },
    {
      channel: 'v1:workspace:stop-active-work',
      payload: {
        scope: 'project',
        projectId: 'project-a',
        threadId: 'ignored-thread',
        stopActive: true,
      },
    },
    {
      channel: 'v1:workspace:delete-thread',
      payload: { threadId: 'thread-b', stopActive: false },
    },
    {
      channel: 'v1:workspace:remove-project',
      payload: { projectId: 'project-b', stopActive: true },
    },
  ])
})

test('preload exposes a scoped active-project clear operation', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  await addom.workspace.clearActiveProject()
  await addom.workspace.clearActiveProject({ notifyRenderer: false })

  assert.deepEqual(harness.invokeCalls, [
    {
      channel: 'v1:workspace:clear-active-project',
      payload: {},
    },
    {
      channel: 'v1:workspace:clear-active-project',
      payload: { notifyRenderer: false },
    },
  ])
})

test('preload normalizes memory.add payloads to a safe plain object', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  await addom.memory.add({
    project: '  demo-project  ',
    topic: 123,
    content: 456,
    tags: [' alpha ', '', 7, null],
    source: '  user  ',
    dataPolicy: ' preserve ',
    isGlobal: 1,
    scope: ' thread ',
    threadId: ' thread-1 ',
    originThreadId: ' origin-thread-1 ',
    durability: ' promoted ',
    confidence: '0.85',
  })

  await addom.memory.add(null)

  assert.deepEqual(harness.invokeCalls[0], {
    channel: 'v1:memory:add',
    payload: {
      project: 'demo-project',
      topic: '123',
      content: '456',
      tags: ['alpha', '7'],
      source: 'user',
      dataPolicy: 'preserve',
      isGlobal: false,
      scope: 'thread',
      threadId: 'thread-1',
      originThreadId: 'origin-thread-1',
      durability: 'promoted',
      confidence: 0.85,
    },
  })
  assert.deepEqual(harness.invokeCalls[1], {
    channel: 'v1:memory:add',
    payload: {
      project: '',
      topic: '',
      content: '',
      tags: [],
      isGlobal: false,
    },
  })
})

test('preload normalizes scoped memory query and mutation payloads', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  await addom.memory.list('  demo-project  ', {
    includeCompressed: true,
    includeDeletedThreads: true,
    includeGlobal: true,
    includeProject: false,
    scope: ' thread ',
    threadId: ' thread-1 ',
  })
  await addom.memory.list({
    project: '  demo-project  ',
    scope: ' project ',
    includeCompressed: true,
  })

  await addom.memory.search('  demo-project  ', '  find this  ', {
    topK: '12.4',
    threshold: '0.75',
    includeCompressed: true,
    includeDeletedThreads: true,
    includeGlobal: true,
    includeProject: false,
    threadId: ' thread-2 ',
  })
  await addom.memory.search({
    project: '  demo-project  ',
    query: 42,
    scope: ' global ',
  })

  await addom.memory.promote(' node-1 ', {
    targetScope: ' global ',
    project: ' demo-project ',
    threadId: ' thread-1 ',
    originThreadId: ' origin-1 ',
  })
  await addom.memory.demote({
    id: ' node-2 ',
    targetScope: ' thread ',
    project: ' demo-project ',
    threadId: ' thread-2 ',
  })
  await addom.memory.invalidate(' node-3 ', { supersededBy: ' node-4 ' })

  assert.deepEqual(harness.invokeCalls[0], {
    channel: 'v1:memory:list',
    payload: {
      project: 'demo-project',
      includeCompressed: true,
      includeDeletedThreads: true,
      includeGlobal: true,
      globalOnly: false,
      scope: 'thread',
      threadId: 'thread-1',
      includeProject: false,
    },
  })
  assert.deepEqual(harness.invokeCalls[1], {
    channel: 'v1:memory:list',
    payload: {
      project: 'demo-project',
      includeCompressed: true,
      includeDeletedThreads: false,
      includeGlobal: false,
      globalOnly: false,
      scope: 'project',
      threadId: '',
    },
  })
  assert.deepEqual(harness.invokeCalls[2], {
    channel: 'v1:memory:search',
    payload: {
      project: 'demo-project',
      query: '  find this  ',
      topK: 12,
      threshold: 0.75,
      includeCompressed: true,
      includeDeletedThreads: true,
      includeGlobal: true,
      scope: '',
      threadId: 'thread-2',
      includeProject: false,
    },
  })
  assert.deepEqual(harness.invokeCalls[3], {
    channel: 'v1:memory:search',
    payload: {
      project: 'demo-project',
      query: '42',
      topK: undefined,
      threshold: undefined,
      includeCompressed: false,
      includeDeletedThreads: false,
      includeGlobal: false,
      scope: 'global',
      threadId: '',
    },
  })
  assert.deepEqual(harness.invokeCalls[4], {
    channel: 'v1:memory:promote',
    payload: {
      id: 'node-1',
      targetScope: 'global',
      project: 'demo-project',
      threadId: 'thread-1',
      originThreadId: 'origin-1',
    },
  })
  assert.deepEqual(harness.invokeCalls[5], {
    channel: 'v1:memory:demote',
    payload: {
      id: 'node-2',
      targetScope: 'thread',
      project: 'demo-project',
      threadId: 'thread-2',
    },
  })
  assert.deepEqual(harness.invokeCalls[6], {
    channel: 'v1:memory:invalidate',
    payload: {
      id: 'node-3',
      supersededBy: 'node-4',
    },
  })
})

test('preload normalizes free-form object payload helpers', async () => {
  const harness = await createPreloadHarness()
  const addom = harness.addom

  addom.chat.logComplianceEvent({
    noticeAction: ' shown ',
    noticeType: ' repeat_warning ',
    threadId: ' thread-1 ',
    repeatedCount: '2',
    preserveCitations: true,
    extraField: 'ignored',
  })
  addom.chat.logComplianceEvent('bad-payload')

  await addom.editor.service.syncDocument(['bad'])
  await addom.editor.service.request({ kind: 'formatting', projectFolder: ' C:\\repo ', filePath: ' src\\app.js ' })
  await addom.editor.requestInlineCompletion(['bad'])
  await addom.editor.logInlineCompletionTelemetry({ eventType: 'accept', chars: 12 })
  assert.equal(addom.moa, undefined)
  assert.deepEqual(
    Object.keys(addom.agents).sort(),
    ['createRole', 'listRoleTemplates', 'onFanoutConfirmRequest', 'respondFanoutConfirm'],
  )

  assert.deepEqual(harness.sent[0], {
    channel: 'v1:chat:compliance-event',
    payload: {
      noticeAction: 'shown',
      noticeType: 'repeat_warning',
      threadId: 'thread-1',
      turnId: '',
      providerId: '',
      toProviderId: '',
      model: '',
      toModelId: '',
      termsVersion: '',
      summary: '',
      message: '',
      content: '',
      source: '',
      sessionSuppressKey: '',
      repeatedCount: 2,
      preserveCitations: true,
    },
  })
  assert.deepEqual(harness.sent[1], {
    channel: 'v1:chat:compliance-event',
    payload: {
      noticeAction: '',
      noticeType: '',
      threadId: '',
      turnId: '',
      providerId: '',
      toProviderId: '',
      model: '',
      toModelId: '',
      termsVersion: '',
      summary: '',
      message: '',
      content: '',
      source: '',
      sessionSuppressKey: '',
      repeatedCount: undefined,
      preserveCitations: undefined,
    },
  })
  assert.deepEqual(harness.invokeCalls[0], {
    channel: 'v1:editor:service:sync-document',
    payload: {},
  })
  assert.deepEqual(harness.invokeCalls[1], {
    channel: 'v1:editor:service:request',
    payload: { kind: 'formatting', projectFolder: ' C:\\repo ', filePath: ' src\\app.js ' },
  })
  assert.deepEqual(harness.invokeCalls[2], {
    channel: 'v1:editor:request-inline-completion',
    payload: {},
  })
  assert.deepEqual(harness.invokeCalls[3], {
    channel: 'v1:editor:log-inline-completion-telemetry',
    payload: { eventType: 'accept', chars: 12 },
  })
})
