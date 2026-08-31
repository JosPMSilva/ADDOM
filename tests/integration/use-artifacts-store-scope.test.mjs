import assert from 'node:assert/strict'
import test from 'node:test'

const calls = []
global.window = {
  addom: {
    artifacts: {
      async listFiles(project, options = {}) {
        calls.push({ project, options })
        return [{ file_path: 'src/example.js' }]
      },
    },
  },
}

const { default: useArtifactsStore } = await import('../../src/renderer/store/useArtifactsStore.js')

test.beforeEach(() => {
  calls.length = 0
  useArtifactsStore.getState().resetFiles()
})

test.after(() => {
  delete global.window
})

test('Artifacts store owns project-default and active-thread discovery scope', async () => {
  await useArtifactsStore.getState().loadFiles('artifact-project')
  assert.deepEqual(calls[0], { project: 'artifact-project', options: { threadId: '' } })
  assert.equal(useArtifactsStore.getState().activeScope, 'project')

  await useArtifactsStore.getState().loadFiles('artifact-project', {
    scope: 'thread',
    threadId: 'artifact-thread',
  })
  assert.deepEqual(calls[1], { project: 'artifact-project', options: { threadId: 'artifact-thread' } })
  assert.equal(useArtifactsStore.getState().activeScope, 'thread')
  assert.equal(useArtifactsStore.getState().activeThreadId, 'artifact-thread')
})
