export function resolveContinuationRequestContext(baseRequestContext = {}, continuation = {}) {
  if (continuation?.requestContext && typeof continuation.requestContext === 'object') {
    return continuation.requestContext
  }
  if (Object.prototype.hasOwnProperty.call(continuation || {}, 'openAIContext')) {
    return {
      ...(baseRequestContext && typeof baseRequestContext === 'object' ? baseRequestContext : {}),
      openai: continuation.openAIContext,
    }
  }
  return baseRequestContext && typeof baseRequestContext === 'object'
    ? { ...baseRequestContext }
    : {}
}

export function prepareDefaultContinuationMessages({ messages = [], requestContext = {} } = {}) {
  return {
    messages: Array.isArray(messages) ? messages : [],
    requestContext: requestContext && typeof requestContext === 'object'
      ? { ...requestContext }
      : {},
  }
}
