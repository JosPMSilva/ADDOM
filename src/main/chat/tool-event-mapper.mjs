export function trimText(value, max = 4000) {
  const text = String(value ?? '')
  if (text.length <= max) return text
  return `${text.slice(0, max)}... [truncated]`
}

export function toToolEventInput(toolName, toolInput = {}) {
  if (!toolInput || typeof toolInput !== 'object') return {}

  if (toolName === 'run_command') {
    return {
      command: String(toolInput.command ?? '').trim(),
      cwd: String(toolInput.cwd ?? '.').trim() || '.',
      shell: String(toolInput.shell ?? 'auto').trim() || 'auto',
      timeout_ms: Number(toolInput.timeout_ms ?? 300_000) || 300_000,
      background: !!toolInput.background,
    }
  }

  if (toolName === 'write_file') {
    return {
      path: String(toolInput.path ?? '').trim(),
      contentBytes: Buffer.byteLength(String(toolInput.content ?? ''), 'utf8'),
    }
  }

  if (toolName === 'apply_artifact_revision') {
    return {
      revision_id: String(toolInput.revision_id ?? '').trim(),
      reason: trimText(String(toolInput.reason ?? '').trim(), 240),
    }
  }

  if (toolName === 'read_file' || toolName === 'list_directory') {
    return { path: String(toolInput.path ?? '').trim() || '.' }
  }

  if (toolName === 'search_code') {
    return {
      query: String(toolInput.query ?? '').trim(),
      path: String(toolInput.path ?? '.').trim() || '.',
      ...(Array.isArray(toolInput.file_extensions) && toolInput.file_extensions.length > 0
        ? { file_extensions: toolInput.file_extensions }
        : {}),
    }
  }

  if (toolName === 'edit_file') {
    return {
      path: String(toolInput.path ?? '').trim(),
      old_text_preview: trimText(String(toolInput.old_text ?? ''), 200),
      new_text_preview: trimText(String(toolInput.new_text ?? ''), 200),
    }
  }

  if (toolName === 'create_directory') {
    return { path: String(toolInput.path ?? '').trim() }
  }

  if (toolName === 'view_file_range') {
    return {
      path: String(toolInput.path ?? '').trim(),
      start_line: Number(toolInput.start_line || 1),
      end_line: Number(toolInput.end_line || 1),
    }
  }

  if (toolName === 'grep_file') {
    return {
      path: String(toolInput.path ?? '').trim(),
      pattern: String(toolInput.pattern ?? '').trim(),
      context_lines: Number(toolInput.context_lines || 0),
    }
  }

  if (toolName === 'rollback_file') {
    return {
      path: String(toolInput.path ?? '').trim(),
      ...(toolInput.revision_id ? { revision_id: String(toolInput.revision_id).trim() } : {}),
    }
  }

  if (toolName === 'find_files') {
    return {
      pattern: String(toolInput.pattern ?? '').trim(),
      path: String(toolInput.path ?? '.').trim() || '.',
      type: String(toolInput.type ?? 'file').trim(),
    }
  }

  if (toolName === 'git_status') {
    return {
      path: String(toolInput.path ?? '.').trim() || '.',
      short: toolInput.short !== false,
      show_untracked: toolInput.show_untracked !== false,
    }
  }

  if (toolName === 'git_diff') {
    return {
      path: String(toolInput.path ?? '.').trim() || '.',
      staged: !!toolInput.staged,
      context_lines: Number(toolInput.context_lines ?? 3) || 3,
    }
  }

  if (toolName === 'git_log') {
    return {
      path: String(toolInput.path ?? '.').trim() || '.',
      max_count: Number(toolInput.max_count ?? 20) || 20,
    }
  }

  if (toolName === 'git_commit') {
    const rawPaths = Array.isArray(toolInput.paths) ? toolInput.paths : []
    return {
      message_preview: trimText(String(toolInput.message ?? '').trim(), 200),
      add_all: !!toolInput.add_all,
      paths: rawPaths.map((p) => String(p ?? '').trim()).filter(Boolean).slice(0, 30),
    }
  }

  if (toolName === 'git_checkout_file') {
    return {
      path: String(toolInput.path ?? '').trim(),
      ref: String(toolInput.ref ?? 'HEAD').trim() || 'HEAD',
    }
  }

  if (toolName === 'browser_action') {
    return {
      action: String(toolInput.action ?? '').trim().toLowerCase(),
      ...(toolInput.url ? { url: String(toolInput.url).trim() } : {}),
      ...(toolInput.selector ? { selector: String(toolInput.selector).trim() } : {}),
      ...(toolInput.text != null ? { text_preview: trimText(String(toolInput.text ?? ''), 160) } : {}),
      ...(toolInput.code != null ? { code_preview: trimText(String(toolInput.code ?? ''), 160) } : {}),
      ...(toolInput.direction ? { direction: String(toolInput.direction).trim().toLowerCase() } : {}),
      ...(toolInput.amount != null ? { amount: Number(toolInput.amount || 0) || 0 } : {}),
      ...(toolInput.value != null ? { value: String(toolInput.value ?? '').trim() } : {}),
      ...(toolInput.label != null ? { label: String(toolInput.label ?? '').trim() } : {}),
      ...(toolInput.timeout_ms != null ? { timeout_ms: Number(toolInput.timeout_ms || 0) || 0 } : {}),
      ...(typeof toolInput.headless === 'boolean' ? { headless: toolInput.headless } : {}),
    }
  }

  if (toolName === 'question_user') {
    const options = Array.isArray(toolInput.options)
      ? toolInput.options
        .map((option) => {
          if (typeof option === 'string') {
            const label = trimText(option.trim(), 240)
            return label ? { label } : null
          }
          if (!option || typeof option !== 'object') return null
          const label = trimText(String(option.label ?? '').trim(), 240)
          if (!label) return null
          return {
            ...(option.id ? { id: String(option.id).trim() } : {}),
            label,
            description: trimText(String(option.description ?? '').trim(), 500),
            recommended: option.recommended === true,
          }
        })
        .filter(Boolean)
        .slice(0, 12)
      : []
    return {
      header: trimText(String(toolInput.header ?? '').trim(), 240),
      question: trimText(String(toolInput.question ?? '').trim(), 2000),
      options,
    }
  }

  if (toolName === 'terminal_session_open') {
    return {
      cwd: String(toolInput.cwd ?? toolInput.workdir ?? '.').trim() || '.',
      shell: String(toolInput.shell ?? 'default').trim() || 'default',
      cols: Number(toolInput.cols ?? 80) || 80,
      rows: Number(toolInput.rows ?? 24) || 24,
    }
  }

  if (toolName === 'terminal_session_read_snapshot') {
    return {
      sessionId: String(toolInput.sessionId ?? '').trim(),
      sinceSequence: Number(toolInput.sinceSequence ?? 0) || 0,
      ...(toolInput.maxChars != null ? { maxChars: Number(toolInput.maxChars ?? 0) || 0 } : {}),
      ...(toolInput.mode ? { mode: String(toolInput.mode ?? '').trim().toLowerCase() } : {}),
    }
  }

  if (toolName === 'terminal_session_attach') {
    return {
      sessionId: String(toolInput.sessionId ?? '').trim(),
      sinceSequence: Number(toolInput.sinceSequence ?? 0) || 0,
    }
  }

  if (toolName === 'terminal_session_write') {
    return {
      sessionId: String(toolInput.sessionId ?? '').trim(),
      data_preview: trimText(String(toolInput.data ?? ''), 200),
      dataBytes: Buffer.byteLength(String(toolInput.data ?? ''), 'utf8'),
    }
  }

  if (toolName === 'terminal_session_resize') {
    return {
      sessionId: String(toolInput.sessionId ?? '').trim(),
      cols: Number(toolInput.cols ?? 0) || 0,
      rows: Number(toolInput.rows ?? 0) || 0,
    }
  }

  if (toolName === 'terminal_session_signal' || toolName === 'terminal_session_close') {
    return {
      sessionId: String(toolInput.sessionId ?? '').trim(),
      ...(toolInput.signal ? { signal: String(toolInput.signal).trim() } : {}),
    }
  }

  return {}
}

function parseExitCodeFromText(text) {
  const source = String(text ?? '')
  if (!source) return null
  const match = source.match(/(?:exit code|exited with code)\s+(-?\d+)/i)
  if (!match) return null
  const code = Number(match[1])
  return Number.isFinite(code) ? code : null
}

export function asTokenCount(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

export function extractRunCommandMeta(resultText, toolInput = {}, isError = false) {
  const text = String(resultText ?? '')
  const stdoutMatch = text.match(/stdout:\n([\s\S]*?)(?:\n\nstderr:|\n\nHints:|$)/i)
  const stderrMatch = text.match(/stderr:\n([\s\S]*?)(?:\n\nstdout:|\n\nHints:|$)/i)
  const hintsMatch = text.match(/\n\nHints:\n([\s\S]*)$/i)
  const stdoutPreview = trimText(stdoutMatch?.[1] ?? '', 8000)
  const stderrPreview = trimText(stderrMatch?.[1] ?? '', 8000)
  const hintFlags = hintsMatch
    ? hintsMatch[1]
      .split('\n')
      .map((line) => line.replace(/^-\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 12)
    : []
  const exitCode = parseExitCodeFromText(text)

  return {
    command: String(toolInput.command ?? '').trim(),
    shell: String(toolInput.shell ?? 'auto').trim() || 'auto',
    cwd: String(toolInput.cwd ?? '.').trim() || '.',
    background: !!toolInput.background,
    status: isError ? 'error' : 'success',
    exitCode,
    stdoutPreview,
    stderrPreview,
    hintFlags,
    // Backward compatibility with existing renderer/store mappings:
    trimmed_stdout: stdoutPreview,
    trimmed_stderr: stderrPreview,
    error_hint_flags: hintFlags,
  }
}
