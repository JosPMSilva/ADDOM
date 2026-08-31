function cleanString(value) {
  return String(value ?? '').trim()
}

function normalizeRoles(roles = []) {
  if (!Array.isArray(roles)) return []
  return roles
    .filter((role) => role && typeof role === 'object')
    .map((role) => ({
      id: cleanString(role.id),
      name: cleanString(role.name),
      providerId: cleanString(role.providerId),
      model: cleanString(role.model),
    }))
    .filter((role) => role.id && role.name)
}

function isAgentCommandPrefix(text) {
  return /^\/agents?\b/i.test(cleanString(text))
}

function isAgentMentionPrefix(text) {
  return /^@/.test(cleanString(text))
}

function resolveRoleSelector(selector, roles) {
  const wanted = cleanString(selector)
  if (!wanted) return null
  const wantedLower = wanted.toLowerCase()
  return roles.find((role) => role.id.toLowerCase() === wantedLower)
    || roles.find((role) => role.name.toLowerCase() === wantedLower)
    || null
}

export function isDirectAgentCommandText(text) {
  return isAgentCommandPrefix(text) || isAgentMentionPrefix(text)
}

export function parseDirectAgentCommand(rawText, availableRoles = []) {
  const text = cleanString(rawText)
  if (!text) return null
  if (!isAgentCommandPrefix(text) && !isAgentMentionPrefix(text)) return null

  const roles = normalizeRoles(availableRoles)
  if (roles.length === 0) {
    return {
      ok: false,
      error: 'no_roles_configured',
      message: 'No Subagents roles are configured. Add agent roles in Settings > Subagents first.',
    }
  }

  let selectors = []
  let instruction = ''
  let commandLabel = '/agent'

  if (isAgentCommandPrefix(text)) {
    const match = text.match(/^\/(agent|agents)\s+([\s\S]+?)\s*::\s*([\s\S]+)$/i)
    if (!match) {
      return {
        ok: false,
        error: 'invalid_syntax',
        message: 'Invalid agent command. Use `/agent <role name or id> :: <instruction>`, `/agents <role1>, <role2> :: <instruction>`, or `@{Role Name} <instruction>`.',
      }
    }
    const command = String(match[1] || '').toLowerCase()
    const selectorsRaw = cleanString(match[2])
    instruction = cleanString(match[3])
    if (!instruction) {
      return {
        ok: false,
        error: 'missing_instruction',
        message: 'Agent command is missing an instruction after `::`.',
      }
    }
    const isPlural = command === 'agents'
    selectors = isPlural
      ? selectorsRaw.split(',').map((part) => cleanString(part)).filter(Boolean)
      : [selectorsRaw]
    commandLabel = isPlural ? '/agents' : '/agent'
  } else {
    // Mention syntax (MVP): one or more leading `@id` or `@{Role Name}` mentions, followed by instruction text.
    let rest = text
    const mentionSelectors = []
    while (rest.startsWith('@')) {
      const brace = rest.match(/^@\{([^}]+)\}(?:[\s,]+|$)/)
      const simple = !brace ? rest.match(/^@([A-Za-z0-9._:-]+)(?:[\s,]+|$)/) : null
      const match = brace || simple
      if (!match) break
      mentionSelectors.push(cleanString(match[1]))
      rest = rest.slice(match[0].length).trimStart()
    }
    instruction = cleanString(rest)
    selectors = mentionSelectors
    commandLabel = mentionSelectors.length > 1 ? '@agents' : '@agent'
    if (selectors.length === 0) {
      return {
        ok: false,
        error: 'invalid_syntax',
        message: 'Invalid agent mention. Use `@roleId <instruction>` or `@{Role Name} <instruction>` (repeat mentions for fanout).',
      }
    }
    if (!instruction) {
      return {
        ok: false,
        error: 'missing_instruction',
        message: 'Agent mention is missing an instruction after the agent mention(s).',
      }
    }
  }

  if (selectors.length === 0) {
    return {
      ok: false,
      error: 'missing_role_selector',
      message: 'Agent command is missing a role selector.',
    }
  }

  const resolved = []
  const unknownSelectors = []
  for (const selector of selectors) {
    const role = resolveRoleSelector(selector, roles)
    if (!role) {
      unknownSelectors.push(selector)
      continue
    }
    if (resolved.some((row) => row.id === role.id)) continue
    resolved.push(role)
  }

  if (unknownSelectors.length > 0) {
    const roleList = roles.slice(0, 12).map((role) => `${role.name} (${role.id})`).join(', ')
    return {
      ok: false,
      error: 'role_not_found',
      message: `Unknown agent role selector(s): ${unknownSelectors.join(', ')}.${roleList ? ` Available roles: ${roleList}` : ''}`,
    }
  }

  if (commandLabel === '/agent' && resolved.length !== 1) {
    return {
      ok: false,
      error: 'invalid_single_agent_target',
      message: 'The `/agent` command must resolve to exactly one agent role.',
    }
  }

  const route = resolved.length <= 1 ? 'orchestrated_single' : 'orchestrated_fanout'
  return {
    ok: true,
    route,
    instruction,
    roles: resolved,
    tasks: resolved.map((role, idx) => ({
      task_id: `task_${idx + 1}`,
      agentRoleId: role.id,
      agentRole: role.name,
      instruction,
    })),
    commandLabel,
  }
}
