import path from 'node:path'
import { getOpenAIAccountAuthService } from '../openai-account/openai-account-auth-service.mjs'

let accountRuntimeServiceGetterForTests = null
let openAIThreadStateGetterForTests = null

export function normalizeId(value = '') {
  return String(value || '').trim()
}

export function normalizeObject(value = null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function normalizeProjectFolder(value = '') {
  const raw = normalizeId(value)
  if (!raw) return ''
  try {
    return path.resolve(raw)
  } catch {
    return raw
  }
}

export function createAbortError(message = 'The operation was aborted.') {
  const error = new Error(message)
  error.name = 'AbortError'
  error.code = 'ABORT_ERR'
  return error
}

export function createOpenAIAccountRuntimeError(
  reason = 'account_runtime_failed',
  message = 'OpenAI account runtime failed.',
) {
  const error = new Error(normalizeId(message) || 'OpenAI account runtime failed.')
  error.code = 'openai_account_runtime_error'
  error.providerId = 'openai'
  error.authMethod = 'account'
  error.reason = normalizeId(reason) || 'account_runtime_failed'
  return error
}

export function getAccountAuthService() {
  return typeof accountRuntimeServiceGetterForTests === 'function'
    ? accountRuntimeServiceGetterForTests()
    : getOpenAIAccountAuthService()
}

export async function getStoredOpenAIThreadState(threadId = '') {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) return null
  if (typeof openAIThreadStateGetterForTests === 'function') {
    return openAIThreadStateGetterForTests(normalizedThreadId)
  }
  const { getOpenAIThreadState } = await import('./openai-thread-state-service.mjs')
  return getOpenAIThreadState(normalizedThreadId)
}

export async function getStoredContinuityBridgeMeta(threadId = '') {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) {
    return { epoch: 1, reducerVersion: 'thread_local_v1' }
  }
  try {
    const { getThreadContinuityBridgeMeta } = await import('../chat/continuity/continuity-store.mjs')
    return getThreadContinuityBridgeMeta(normalizedThreadId)
  } catch {
    return { epoch: 1, reducerVersion: 'thread_local_v1' }
  }
}

export function __setOpenAIAccountRuntimeServiceGetterForTests(fn = null) {
  accountRuntimeServiceGetterForTests = typeof fn === 'function' ? fn : null
}

export function __resetOpenAIAccountRuntimeServiceGetterForTests() {
  accountRuntimeServiceGetterForTests = null
}

export function __setOpenAIAccountRuntimeThreadStateGetterForTests(fn = null) {
  openAIThreadStateGetterForTests = typeof fn === 'function' ? fn : null
}

export function __resetOpenAIAccountRuntimeThreadStateGetterForTests() {
  openAIThreadStateGetterForTests = null
}
