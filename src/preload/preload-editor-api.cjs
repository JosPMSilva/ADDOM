function createFileApi({ invokeVersioned, subVersioned }) {
  return {
    listTree: (project) => invokeVersioned('file:listTree', { project }),
    readFile: (project, filePath) => invokeVersioned('file:readFile', { project, filePath }),
    saveFile: (project, filePath, content, encoding = '') => invokeVersioned('file:saveFile', {
      project,
      filePath,
      content,
      encoding,
    }),
    onTreeChanged: (cb) => subVersioned('file:tree-changed', cb),
    onExternalChange: (cb) => subVersioned('file:external-change', cb),
    onWatcherStatus: (cb) => subVersioned('file:watcher-status', cb),
  }
}

function createEditorApi({ invokeVersioned, asPlainObject }) {
  return {
    service: {
      syncDocument: (payload = {}) => invokeVersioned(
        'editor:service:sync-document',
        { ...asPlainObject(payload) },
      ),
      request: (payload = {}) => invokeVersioned(
        'editor:service:request',
        { ...asPlainObject(payload) },
      ),
      refreshRuntime: (payload = {}) => invokeVersioned(
        'editor:service:refresh-runtime',
        { ...asPlainObject(payload) },
      ),
    },
    requestInlineCompletion: (payload = {}) => invokeVersioned(
      'editor:request-inline-completion',
      { ...asPlainObject(payload) },
    ),
    logInlineCompletionTelemetry: (payload = {}) => invokeVersioned(
      'editor:log-inline-completion-telemetry',
      { ...asPlainObject(payload) },
    ),
  }
}

module.exports = {
  createFileApi,
  createEditorApi,
}
