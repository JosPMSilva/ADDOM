import {
  cloneContractInput,
  deepFreeze,
  validateEnum,
} from './agent-contract-utils.mjs'

export const AGENT_PERMISSION_LEVELS = Object.freeze(['read_only', 'read_write', 'execute', 'all'])
export const AGENT_TOOL_CLASSES = Object.freeze(['read', 'write', 'execute'])
export const AGENT_TOOL_CLASS_MINIMUM_PERMISSION = Object.freeze({
  read: 'read_only',
  write: 'read_write',
  execute: 'execute',
})

const LEVEL_TOOL_CLASSES = Object.freeze({
  read_only: Object.freeze(['read']),
  read_write: Object.freeze(['read', 'write']),
  execute: Object.freeze(['read', 'execute']),
  all: AGENT_TOOL_CLASSES,
})

const NARROWER_LEVELS = Object.freeze({
  read_only: Object.freeze(['read_only']),
  read_write: Object.freeze(['read_only', 'read_write']),
  execute: Object.freeze(['read_only', 'execute']),
  all: AGENT_PERMISSION_LEVELS,
})

export function validateAgentPermissionSnapshot(input) {
  const source = cloneContractInput(input, 'permission snapshot')
  const level = validateEnum(source.level, 'permission.level', AGENT_PERMISSION_LEVELS)
  if (!Array.isArray(source.toolClasses)) throw new TypeError('permission.toolClasses must be an array')
  const toolClasses = [...new Set(source.toolClasses)]
  for (const toolClass of toolClasses) {
    validateEnum(toolClass, 'permission tool class', AGENT_TOOL_CLASSES)
    if (!LEVEL_TOOL_CLASSES[level].includes(toolClass)) {
      throw new TypeError(`permission.toolClasses includes ${toolClass}, which ${level} does not allow`)
    }
  }
  return deepFreeze({ ...source, level, toolClasses })
}

export function assertPermissionNarrowing(parentInput, childInput) {
  const parent = validateAgentPermissionSnapshot(parentInput)
  const child = validateAgentPermissionSnapshot(childInput)
  if (!NARROWER_LEVELS[parent.level].includes(child.level)) {
    throw new TypeError(`Permission ${child.level} would widen or is incomparable with ${parent.level}`)
  }
  for (const toolClass of child.toolClasses) {
    if (!parent.toolClasses.includes(toolClass)) {
      throw new TypeError(`Permission tool class ${toolClass} would widen the parent snapshot`)
    }
  }
  return true
}
