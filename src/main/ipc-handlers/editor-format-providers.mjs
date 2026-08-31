import fs from 'fs'
import { applyUnifiedDiffToText } from '../tools/apply-patch-core.mjs'
import { cleanString } from './editor-format-support.mjs'
import {
  detectNearestClangFormatConfigRoot,
  detectNearestCSharpProjectRoot,
  detectNearestRuffConfigRoot,
} from './editor-format-config.mjs'
import {
  getClangFormatAvailability,
  getClangTidyFixAvailability,
  getCSharpierAvailability,
  getDotnetFormatFixAvailability,
  getTomlFormatterAvailability,
  loadPrettierModule,
  loadSmolTomlModule,
  resolveBiomeCommand,
  resolveClangFormatCommand,
  resolveClangTidyCommand,
  resolveCSharpierCommand,
  resolveDotnetFormatCommand,
  resolveRuffCommand,
} from './editor-format-commands.mjs'
import { runProcess, runProcessWithStdin } from './editor-format-processes.mjs'
import {
  createClangTidyScratchWorkspace,
  createDotnetFormatScratchWorkspace,
} from './editor-format-scratch-workspaces.mjs'

export async function formatWithBiome({ projectRoot, absPath, content }) {
  const biome = resolveBiomeCommand()
  if (!biome) {
    return {
      ok: true,
      available: false,
      reason: 'biome_not_installed',
      message: 'Biome is not installed. Add @biomejs/biome to enable formatting.',
    }
  }

  const args = [
    ...biome.argsPrefix,
    'format',
    '--stdin-file-path',
    absPath,
  ]

  const result = await runProcessWithStdin({
    command: biome.command,
    args,
    cwd: projectRoot,
    stdin: content,
    env: biome.env || {},
  })

  if (!result.ok) {
    const message = String(result.stderr || result.error || 'Biome format failed').trim()
    return {
      ok: true,
      available: true,
      source: 'biome',
      formattingError: true,
      reason: result.timedOut ? 'timeout' : 'format_failed',
      message,
      changed: false,
      formatted: String(content ?? ''),
    }
  }

  const formatted = String(result.stdout ?? '')
  return {
    ok: true,
    available: true,
    source: 'biome',
    changed: formatted !== String(content ?? ''),
    formatted,
  }
}

export async function formatWithRuff({ projectRoot, relFilePath, absPath, content }) {
  const ruff = resolveRuffCommand()
  if (!ruff) {
    return {
      ok: true,
      available: false,
      source: 'ruff',
      reason: 'ruff_not_installed',
      message: 'Ruff formatter was not found on PATH.',
    }
  }

  const configRoot = detectNearestRuffConfigRoot(projectRoot, relFilePath) || projectRoot
  const args = [
    ...ruff.argsPrefix,
    'format',
    '--stdin-filename',
    absPath,
    '--quiet',
    '-',
  ]

  const result = await runProcessWithStdin({
    command: ruff.command,
    args,
    cwd: configRoot,
    stdin: content,
  })

  if (!result.ok) {
    const message = String(result.stderr || result.error || 'Ruff format failed').trim()
    return {
      ok: true,
      available: true,
      source: 'ruff',
      formattingError: true,
      reason: result.timedOut ? 'timeout' : 'format_failed',
      message,
      changed: false,
      formatted: String(content ?? ''),
    }
  }

  const formatted = String(result.stdout ?? '')
  return {
    ok: true,
    available: true,
    source: 'ruff',
    changed: formatted !== String(content ?? ''),
    formatted,
  }
}

export async function formatWithClangFormat({ projectRoot, relFilePath, absPath, content }) {
  const availability = getClangFormatAvailability(projectRoot, relFilePath)
  if (!availability.available) {
    return {
      ok: true,
      available: false,
      source: availability.source,
      reason: availability.reason,
      message: availability.message,
    }
  }

  const clangFormat = resolveClangFormatCommand()
  const configRoot = detectNearestClangFormatConfigRoot(projectRoot, relFilePath) || projectRoot
  const args = [
    ...clangFormat.argsPrefix,
    '--assume-filename',
    absPath,
    '-style=file',
    '--fallback-style=none',
  ]

  const result = await runProcessWithStdin({
    command: clangFormat.command,
    args,
    cwd: configRoot,
    stdin: content,
    env: clangFormat.env || {},
  })

  if (!result.ok) {
    const message = String(result.stderr || result.error || 'clang-format failed').trim()
    return {
      ok: true,
      available: true,
      source: 'clang-format',
      formattingError: true,
      reason: result.timedOut ? 'timeout' : 'format_failed',
      message,
      changed: false,
      formatted: String(content ?? ''),
    }
  }

  const formatted = String(result.stdout ?? '')
  return {
    ok: true,
    available: true,
    source: 'clang-format',
    changed: formatted !== String(content ?? ''),
    formatted,
  }
}

export async function formatWithCSharpier({ projectRoot, relFilePath, content }) {
  const availability = getCSharpierAvailability(projectRoot, relFilePath)
  if (!availability.available) {
    return {
      ok: true,
      available: false,
      source: availability.source,
      reason: availability.reason,
      message: availability.message,
    }
  }

  const csharpProjectRoot = detectNearestCSharpProjectRoot(projectRoot, relFilePath)
  const csharpier = resolveCSharpierCommand(csharpProjectRoot)
  if (!csharpier) {
    return {
      ok: true,
      available: false,
      source: 'csharpier',
      reason: 'csharpier_not_installed',
      message: 'CSharpier was not found for this project. Install the dotnet csharpier tool or restore the local tool manifest.',
    }
  }

  const args = [
    ...csharpier.argsPrefix,
    'format',
    '--write-stdout',
    '--log-level',
    'Error',
  ]

  const result = await runProcessWithStdin({
    command: csharpier.command,
    args,
    cwd: csharpProjectRoot || projectRoot,
    stdin: content,
    env: csharpier.env || {},
  })

  if (!result.ok) {
    const message = String(result.stderr || result.error || 'CSharpier format failed').trim()
    return {
      ok: true,
      available: true,
      source: 'csharpier',
      formattingError: true,
      reason: result.timedOut ? 'timeout' : 'format_failed',
      message,
      changed: false,
      formatted: String(content ?? ''),
    }
  }

  const formatted = String(result.stdout ?? '')
  return {
    ok: true,
    available: true,
    source: 'csharpier',
    changed: formatted !== String(content ?? ''),
    formatted,
  }
}

export async function formatWithPrettier({ absPath, content }) {
  const prettier = await loadPrettierModule()
  if (!prettier) {
    return {
      ok: true,
      available: false,
      source: 'prettier',
      reason: 'prettier_not_installed',
      message: 'Prettier formatter is not installed.',
    }
  }

  try {
    prettier.clearConfigCache?.()
    const resolvedConfig = await prettier.resolveConfig?.(absPath, { editorconfig: true })
    const formatted = await prettier.format(String(content ?? ''), {
      ...(resolvedConfig && typeof resolvedConfig === 'object' ? resolvedConfig : {}),
      filepath: absPath,
    })
    return {
      ok: true,
      available: true,
      source: 'prettier',
      changed: formatted !== String(content ?? ''),
      formatted,
    }
  } catch (error) {
    return {
      ok: true,
      available: true,
      source: 'prettier',
      formattingError: true,
      reason: 'format_failed',
      message: String(error?.message || 'Prettier format failed').trim(),
      changed: false,
      formatted: String(content ?? ''),
    }
  }
}

export async function formatWithSmolToml({ content }) {
  const availability = getTomlFormatterAvailability({ content })
  if (!availability.available) {
    return {
      ok: true,
      available: false,
      source: availability.source,
      reason: availability.reason,
      message: availability.message,
    }
  }

  const smolToml = loadSmolTomlModule()
  if (!smolToml) {
    return {
      ok: true,
      available: false,
      source: 'smol-toml',
      reason: 'smol_toml_not_installed',
      message: 'The bundled TOML formatter is not installed.',
    }
  }

  try {
    const parsed = smolToml.parse(String(content ?? ''))
    const formatted = smolToml.stringify(parsed)
    return {
      ok: true,
      available: true,
      source: 'smol-toml',
      changed: formatted !== String(content ?? ''),
      formatted,
    }
  } catch (error) {
    return {
      ok: true,
      available: true,
      source: 'smol-toml',
      formattingError: true,
      reason: 'format_failed',
      message: String(error?.message || 'TOML format failed').trim(),
      changed: false,
      formatted: String(content ?? ''),
    }
  }
}

export async function fixWithRuff({ projectRoot, relFilePath, absPath, content }) {
  const ruff = resolveRuffCommand()
  const original = String(content ?? '')
  if (!ruff) {
    return {
      ok: true,
      available: false,
      source: 'ruff',
      reason: 'ruff_not_installed',
      message: 'Ruff was not found on PATH.',
    }
  }

  const configRoot = detectNearestRuffConfigRoot(projectRoot, relFilePath) || projectRoot
  const args = [
    ...ruff.argsPrefix,
    'check',
    '--fix',
    '--diff',
    '--exit-zero',
    '--quiet',
    '--stdin-filename',
    absPath,
    '-',
  ]

  const result = await runProcessWithStdin({
    command: ruff.command,
    args,
    cwd: configRoot,
    stdin: original,
    env: ruff.env || {},
  })

  if (!result.ok) {
    const message = String(result.stderr || result.error || 'Ruff fix failed').trim()
    return {
      ok: true,
      available: true,
      source: 'ruff',
      fixingError: true,
      reason: result.timedOut ? 'timeout' : 'fix_failed',
      message,
      changed: false,
      fixedContent: original,
    }
  }

  const diff = String(result.stdout ?? '')
  if (!diff.trim()) {
    return {
      ok: true,
      available: true,
      source: 'ruff',
      changed: false,
      fixedContent: original,
    }
  }

  try {
    const fixedContent = applyUnifiedDiffToText(original, diff, {
      defaultTrailingNewline: original.endsWith('\n'),
    })
    return {
      ok: true,
      available: true,
      source: 'ruff',
      changed: fixedContent !== original,
      fixedContent,
    }
  } catch (error) {
    return {
      ok: true,
      available: true,
      source: 'ruff',
      fixingError: true,
      reason: 'fix_diff_apply_failed',
      message: String(error?.message || 'Failed to apply Ruff diff').trim(),
      changed: false,
      fixedContent: original,
    }
  }
}

export async function fixWithClangTidy({ projectRoot, relFilePath, absPath, content, language = '' }) {
  const availability = getClangTidyFixAvailability(projectRoot, relFilePath)
  const original = String(content ?? '')
  if (!availability.available) {
    return {
      ok: true,
      available: false,
      source: 'clang-tidy',
      reason: cleanString(availability.reason) || 'real_provider_missing',
      message: cleanString(availability.message) || 'clang-tidy fixes are unavailable.',
    }
  }

  const clangTidy = resolveClangTidyCommand()
  if (!clangTidy) {
    return {
      ok: true,
      available: false,
      source: 'clang-tidy',
      reason: 'clang_tidy_not_installed',
      message: 'clang-tidy was not found on PATH.',
    }
  }

  let scratchWorkspace = null
  try {
    scratchWorkspace = createClangTidyScratchWorkspace({
      projectRoot,
      relFilePath,
      absPath,
      content: original,
      language,
      configRoot: availability.configRoot,
      compileContext: availability.compileContext,
    })
  } catch (error) {
    return {
      ok: true,
      available: true,
      source: 'clang-tidy',
      fixingError: true,
      reason: 'fix_setup_failed',
      message: String(error?.message || 'Failed to prepare the clang-tidy scratch workspace.').trim(),
      changed: false,
      fixedContent: original,
    }
  }

  try {
    const args = [
      ...clangTidy.argsPrefix,
      scratchWorkspace.scratchFilePath,
      '--fix',
      '-p',
      scratchWorkspace.scratchContextRoot,
      '--quiet',
    ]

    const result = await runProcess({
      command: clangTidy.command,
      args,
      cwd: scratchWorkspace.scratchRoot,
      env: clangTidy.env || {},
    })

    if (!result.ok) {
      const message = String(result.stderr || result.error || 'clang-tidy fix failed').trim()
      return {
        ok: true,
        available: true,
        source: 'clang-tidy',
        fixingError: true,
        reason: result.timedOut ? 'timeout' : 'fix_failed',
        message,
        changed: false,
        fixedContent: original,
      }
    }

    const fixedContent = fs.readFileSync(scratchWorkspace.scratchFilePath, 'utf8')
    return {
      ok: true,
      available: true,
      source: 'clang-tidy',
      changed: fixedContent !== original,
      fixedContent,
    }
  } catch (error) {
    return {
      ok: true,
      available: true,
      source: 'clang-tidy',
      fixingError: true,
      reason: 'fix_failed',
      message: String(error?.message || 'clang-tidy fix failed').trim(),
      changed: false,
      fixedContent: original,
    }
  } finally {
    scratchWorkspace?.cleanup?.()
  }
}

export async function fixWithDotnetFormat({ projectRoot, relFilePath, absPath, content }) {
  const availability = getDotnetFormatFixAvailability(projectRoot, relFilePath)
  const original = String(content ?? '')
  if (!availability.available) {
    return {
      ok: true,
      available: false,
      source: 'dotnet-format',
      reason: cleanString(availability.reason) || 'real_provider_missing',
      message: cleanString(availability.message) || 'dotnet format fixes are unavailable.',
    }
  }

  const dotnetFormat = resolveDotnetFormatCommand()
  if (!dotnetFormat) {
    return {
      ok: true,
      available: false,
      source: 'dotnet-format',
      reason: 'dotnet_format_not_installed',
      message: 'dotnet format is unavailable. Install a .NET SDK that includes dotnet format to enable C# fixes.',
    }
  }

  let scratchWorkspace = null
  try {
    scratchWorkspace = createDotnetFormatScratchWorkspace({
      projectRoot: availability.projectRoot || projectRoot,
      projectPath: availability.projectPath,
      absPath,
      content: original,
    })
  } catch (error) {
    return {
      ok: true,
      available: true,
      source: 'dotnet-format',
      fixingError: true,
      reason: 'fix_setup_failed',
      message: String(error?.message || 'Failed to prepare the dotnet format scratch workspace.').trim(),
      changed: false,
      fixedContent: original,
    }
  }

  const runDotnetFormatSubcommand = async (subcommand = '') => {
    const args = [
      ...dotnetFormat.argsPrefix,
      subcommand,
      scratchWorkspace.scratchProjectPath,
      '--include',
      scratchWorkspace.scratchRelativeFilePath,
      '--severity',
      'info',
      '--verbosity',
      'quiet',
    ]

    return runProcess({
      command: dotnetFormat.command,
      args,
      cwd: scratchWorkspace.scratchRoot,
      env: dotnetFormat.env || {},
    })
  }

  try {
    for (const subcommand of ['style', 'analyzers']) {
      const result = await runDotnetFormatSubcommand(subcommand)
      if (result.ok) continue
      const message = String(result.stderr || result.stdout || result.error || `dotnet format ${subcommand} failed`).trim()
      return {
        ok: true,
        available: true,
        source: 'dotnet-format',
        fixingError: true,
        reason: result.timedOut ? 'timeout' : 'fix_failed',
        message,
        changed: false,
        fixedContent: original,
      }
    }

    const fixedContent = fs.readFileSync(scratchWorkspace.scratchFilePath, 'utf8')
    return {
      ok: true,
      available: true,
      source: 'dotnet-format',
      changed: fixedContent !== original,
      fixedContent,
    }
  } catch (error) {
    return {
      ok: true,
      available: true,
      source: 'dotnet-format',
      fixingError: true,
      reason: 'fix_failed',
      message: String(error?.message || 'dotnet format fix failed').trim(),
      changed: false,
      fixedContent: original,
    }
  } finally {
    scratchWorkspace?.cleanup?.()
  }
}
