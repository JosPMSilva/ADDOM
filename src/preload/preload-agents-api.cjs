function createAgentsApi(deps) {
  const {
    invokeVersioned,
    sendVersioned,
    subVersioned,
    asTrimmedString,
    asString,
    asPlainObject,
    asBoolean,
  } = deps

  return {
    listRoleTemplates: () => invokeVersioned('agents:list-role-templates'),
    createRole: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('agents:create-role', {
        name: asTrimmedString(source.name),
        systemPrompt: asString(source.systemPrompt).slice(0, 2000),
        providerId: asTrimmedString(source.providerId),
        model: asTrimmedString(source.model),
        canWriteFiles: asBoolean(source.canWriteFiles),
        templateId: asTrimmedString(source.templateId),
        templateLabel: asTrimmedString(source.templateLabel),
      })
    },
    onFanoutConfirmRequest: (cb) => subVersioned('agents:fanout-confirm-request', cb),
    respondFanoutConfirm: (requestId, decision) => sendVersioned('agents:fanout-confirm-response', {
      requestId: String(requestId || ''),
      decision: String(decision || ''),
    }),
  }
}

module.exports = {
  createAgentsApi,
}
