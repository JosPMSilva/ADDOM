function createArtifactsApi(deps) {
  const {
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asPlainObject,
    asStringArray,
    asOptionalRoundedNumber,
  } = deps

  return {
    listFiles: (project, options = {}) => invokeVersioned('artifacts:listFiles', {
      project: asTrimmedString(project),
      threadId: asTrimmedString(asPlainObject(options).threadId),
    }),
    listRevisions: (project, filePath) => invokeVersioned('artifacts:listRevisions', {
      project: asTrimmedString(project),
      filePath: asTrimmedString(filePath),
    }),
    getRevision: (id) => invokeVersioned('artifacts:getRevision', { id: asTrimmedString(id) }),
    reviewContext: (project, opts = {}) => {
      const source = asPlainObject(opts)
      return invokeVersioned('artifacts:review-context', {
        project: asTrimmedString(project),
        filePaths: asStringArray(source.filePaths),
        limit: asOptionalRoundedNumber(source.limit),
        includeRevisions: typeof source.includeRevisions === 'boolean'
          ? source.includeRevisions
          : undefined,
        revisionsPerFile: asOptionalRoundedNumber(source.revisionsPerFile),
        fromRev: asOptionalRoundedNumber(source.fromRev),
        toRev: asOptionalRoundedNumber(source.toRev),
      })
    },
    getLatestForFiles: (project, filePaths = []) => invokeVersioned('artifacts:getLatestForFiles', {
      project: asTrimmedString(project),
      filePaths: asStringArray(filePaths),
    }),
    rollback: (project, filePath, revId) => invokeVersioned('artifacts:rollback', {
      project: asTrimmedString(project),
      filePath: asTrimmedString(filePath),
      revId: asTrimmedString(revId),
    }),
    applyToDisk: (project, filePath, revId) => invokeVersioned('artifacts:applyToDisk', {
      project: asTrimmedString(project),
      filePath: asTrimmedString(filePath),
      revId: asTrimmedString(revId),
    }),
    undoFileChange: (project, fileChange = {}) => {
      const source = asPlainObject(fileChange)
      return invokeVersioned('artifacts:undoFileChange', {
        project: asTrimmedString(project),
        filePath: asTrimmedString(source.filePath),
        newRevId: asTrimmedString(source.newRevId),
        prevRevId: asTrimmedString(source.prevRevId),
        changeType: asTrimmedString(source.changeType),
      })
    },
    undoTurnFileChanges: (project, changes = []) => invokeVersioned('artifacts:undoTurnFileChanges', { project, changes }),
    deleteFile: (project, filePath) => invokeVersioned('artifacts:deleteFile', {
      project: asTrimmedString(project),
      filePath: asTrimmedString(filePath),
    }),
    deleteRevision: (project, filePath, id) => invokeVersioned('artifacts:deleteRevision', {
      project: asTrimmedString(project),
      filePath: asTrimmedString(filePath),
      id: asTrimmedString(id),
    }),
    requestMergeProposal: (project, opts = {}) => invokeVersioned('artifacts:requestMergeProposal', {
      project: asTrimmedString(project),
      conflictBaseRevId: asTrimmedString(opts.conflictBaseRevId),
      conflictActualRevId: asTrimmedString(opts.conflictActualRevId),
      newRevId: asTrimmedString(opts.newRevId),
      filePath: asTrimmedString(opts.filePath),
      providerId: asTrimmedString(opts.providerId),
      model: asTrimmedString(opts.model),
    }),
    applyMergeResolution: (project, opts = {}) => invokeVersioned('artifacts:applyMergeResolution', {
      project: asTrimmedString(project),
      filePath: asTrimmedString(opts.filePath),
      mergedContent: typeof opts.mergedContent === 'string' ? opts.mergedContent : '',
      conflictId: asTrimmedString(opts.conflictId),
      conflictBaseRevId: asTrimmedString(opts.conflictBaseRevId),
      conflictActualRevId: asTrimmedString(opts.conflictActualRevId),
      newRevId: asTrimmedString(opts.newRevId),
    }),
    onUpdated: (cb) => subVersioned('artifacts:updated', cb),
  }
}

module.exports = {
  createArtifactsApi,
}
