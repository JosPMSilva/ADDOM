function cleanString(value) {
  return String(value ?? '').trim()
}

function parseThresholdInteger(value) {
  const normalized = cleanString(value)
  if (!/^\d+$/.test(normalized)) return 0
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.round(numeric)
}

export function isCompactionCommandText(text) {
  return /^\/compact(?:-threshold)?\b/i.test(cleanString(text))
}

function normalizeProviderId(value = '') {
  return cleanString(value).toLowerCase()
}

export function parseCompactionCommand(rawText, { providerId = '' } = {}) {
  const text = cleanString(rawText)
  if (!text || !isCompactionCommandText(text)) return null
  const provider = normalizeProviderId(providerId)

  if (/^\/compact\b/i.test(text) && !/^\/compact-threshold\b/i.test(text)) {
    const withPromptMatch = text.match(/^\/compact\s*::\s*([\s\S]+)$/i)
    if (withPromptMatch) {
      const prompt = cleanString(withPromptMatch[1])
      if (!prompt) {
        return {
          ok: false,
          error: 'missing_prompt',
          message: 'Compaction command is missing a prompt after `::`.',
        }
      }
      return {
        ok: true,
        commandLabel: '/compact',
        prompt,
        turnOptions: {
          openai: {
            forceManualCompaction: true,
          },
        },
      }
    }

    if (/^\/compact\s*$/i.test(text)) {
      return {
        ok: true,
        commandLabel: '/compact',
        prompt: '',
        turnOptions: {
          openai: {
            forceManualCompaction: true,
            commandOnly: true,
          },
        },
      }
    }

    return {
      ok: false,
      error: 'invalid_syntax',
      message: 'Invalid compaction command. Use `/compact` or `/compact :: <prompt>`.',
    }
  }

  const thresholdSyntaxMatch = text.match(/^\/compact-threshold\b([\s\S]*)$/i)
  const thresholdRest = cleanString(thresholdSyntaxMatch?.[1] || '')
  const thresholdCommandMatch = thresholdRest.match(/^([^\s:]+)\s*::\s*([\s\S]+)$/)
  if (!thresholdCommandMatch) {
    return {
      ok: false,
      error: 'invalid_syntax',
      message: 'Invalid threshold compaction command. Use `/compact-threshold <tokens> :: <prompt>`.',
    }
  }

  const thresholdTokens = parseThresholdInteger(thresholdCommandMatch[1])
  if (thresholdTokens <= 0) {
    return {
      ok: false,
      error: 'invalid_threshold',
      message: 'Compaction threshold must be a positive integer token count.',
    }
  }

  const prompt = cleanString(thresholdCommandMatch[2])
  if (!prompt) {
    return {
      ok: false,
      error: 'missing_prompt',
      message: 'Threshold compaction command is missing a prompt after `::`.',
    }
  }

  return {
    ok: true,
    commandLabel: '/compact-threshold',
    prompt,
    turnOptions: provider === 'anthropic'
      ? {
        anthropic: {
          forceContextManagementCompaction: true,
          contextManagementCompactionThresholdTokens: thresholdTokens,
        },
      }
      : {
        openai: {
          forceServerSideCompaction: true,
          serverSideCompactionThresholdTokens: thresholdTokens,
        },
      },
  }
}
