import { deepFreeze, validateEnum } from './agent-contract-utils.mjs'

export const AGENT_CANCELLATION_SCOPES = Object.freeze(['node', 'parent_turn', 'subtree', 'run'])
export const AGENT_BACKGROUND_KINDS = Object.freeze([
  'foreground',
  'native_background',
  'auto_backgrounded',
  'explicitly_detached',
])

const CANCELLATION_SEMANTICS = Object.freeze({
  node: Object.freeze({
    scope: 'node', cancelTarget: true, descendantSelection: 'none', backgroundDescendants: 'survive',
  }),
  parent_turn: Object.freeze({
    scope: 'parent_turn', cancelTarget: true, descendantSelection: 'foreground_only', backgroundDescendants: 'survive',
  }),
  subtree: Object.freeze({
    scope: 'subtree', cancelTarget: true, descendantSelection: 'all', backgroundDescendants: 'cancel',
  }),
  run: Object.freeze({
    scope: 'run', cancelTarget: true, descendantSelection: 'all', backgroundDescendants: 'cancel',
  }),
})

export function resolveAgentCancellationSemantics(scope) {
  validateEnum(scope, 'cancellation scope', AGENT_CANCELLATION_SCOPES)
  return deepFreeze({ ...CANCELLATION_SEMANTICS[scope] })
}

export function validateAgentBackgroundKind(backgroundKind, background) {
  const value = validateEnum(backgroundKind, 'attempt.backgroundKind', AGENT_BACKGROUND_KINDS)
  const expectedBackground = value !== 'foreground'
  if (background !== expectedBackground) {
    throw new TypeError(`attempt.backgroundKind ${value} is inconsistent with attempt.background`)
  }
  return value
}
