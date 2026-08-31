import test from 'node:test'
import assert from 'node:assert/strict'

import { createRendererTranslator } from '../../src/renderer/i18n/index.mjs'
import {
  __testEditorSetupHintInternals,
  buildLocalizedEditorCapabilityMessage,
  buildLocalizedEditorServiceNotice,
  buildEditorCapabilityActionTitle,
  buildEditorSetupHint,
  buildEditorSetupHints,
  isEditorSetupHintActionable,
  resolveEditorCapabilityProvider,
} from '../../src/renderer/components/editor/editor-setup-hints.mjs'

const tEs = createRendererTranslator({ locale: 'es', namespaces: ['core'] })

test('setup-hint helper resolves formatter and fixer providers, including ESLint message inference', () => {
  assert.deepEqual(resolveEditorCapabilityProvider('formatting', {
    source: 'clang-format',
    message: 'Formatting requires a project .clang-format or _clang-format config.',
  }), {
    id: 'clang-format',
    label: 'clang-format',
  })

  assert.deepEqual(resolveEditorCapabilityProvider('codeActions', {
    source: 'syntax-only',
    message: 'Code actions require a project-configured ESLint provider.',
  }), {
    id: 'eslint-project-config',
    label: 'ESLint',
  })

  assert.deepEqual(resolveEditorCapabilityProvider('codeActions', {
    source: 'dotnet-format',
    message: 'Code actions require a real .csproj or .sln context.',
  }), {
    id: 'dotnet-format',
    label: 'dotnet format',
  })

  assert.deepEqual(resolveEditorCapabilityProvider('formatting', {
    source: 'jdtls',
    message: 'Formatting requires a Maven or Gradle project context (pom.xml, build.gradle, build.gradle.kts, settings.gradle, settings.gradle.kts).',
  }), {
    id: 'jdtls',
    label: 'jdtls',
  })
})

test('setup-hint helper builds provider-aware disabled action titles', () => {
  assert.equal(buildEditorCapabilityActionTitle({
    capabilityKey: 'formatting',
    capability: {
      available: false,
      source: 'clang-format',
      reason: 'real_provider_missing',
      message: 'Formatting requires a project .clang-format or _clang-format config.',
    },
    disabledFallbackTitle: 'Formatting is unavailable for the current file',
  }), 'Format unavailable: uses clang-format. Formatting requires a project .clang-format or _clang-format config.')

  assert.equal(buildEditorCapabilityActionTitle({
    capabilityKey: 'codeActions',
    capability: {
      available: false,
      source: 'syntax-only',
      reason: 'real_provider_missing',
      message: 'Code actions require a project-configured ESLint provider.',
    },
    disabledFallbackTitle: 'Code actions are unavailable for the current file',
  }), 'Fix unavailable: uses ESLint. Code actions require a project-configured ESLint provider.')

  assert.equal(buildEditorCapabilityActionTitle({
    capabilityKey: 'formatting',
    capability: {
      available: false,
      source: 'jdtls',
      reason: 'missing_provider_binary',
      message: 'jdtls was not found in this project or on PATH.',
    },
    disabledFallbackTitle: 'Formatting is unavailable for the current file',
  }), 'Format unavailable: uses jdtls. jdtls was not found in this project or on PATH.')

  assert.equal(buildEditorCapabilityActionTitle({
    capabilityKey: 'formatting',
    capability: {
      available: false,
      source: 'clang-format',
      reason: 'clang_format_not_installed',
      message: 'clang-format was not found on PATH.',
    },
    disabledFallbackTitle: 'El formateo no está disponible para el archivo actual',
    t: tEs,
  }), 'No se encontró clang-format en este proyecto ni en PATH.')
})

test('setup-hint helper only marks user-actionable setup gaps as hint-worthy', () => {
  assert.equal(isEditorSetupHintActionable('formatting', {
    available: false,
    source: 'prettier',
    reason: 'prettier_not_installed',
    message: 'Prettier is not installed.',
  }), true)

  assert.equal(isEditorSetupHintActionable('codeActions', {
    available: false,
    source: 'dotnet-format',
    reason: 'dotnet_not_installed',
    message: 'dotnet was not found on PATH.',
  }), true)

  assert.equal(isEditorSetupHintActionable('formatting', {
    available: false,
    source: 'jdtls',
    reason: 'missing_provider_binary',
    message: 'jdtls was not found in this project or on PATH.',
  }), true)

  assert.equal(isEditorSetupHintActionable('codeActions', {
    available: false,
    source: 'jdtls',
    reason: 'java_not_installed',
    message: 'A usable JDK was not found on PATH or JAVA_HOME. jdtls requires Java.',
  }), true)

  assert.equal(isEditorSetupHintActionable('formatting', {
    available: false,
    source: 'smol-toml',
    reason: 'smol_toml_not_installed',
    message: 'The bundled TOML formatter is not installed.',
  }), false)

  assert.equal(isEditorSetupHintActionable('formatting', {
    available: false,
    source: 'smol-toml',
    reason: 'toml_comments_unsupported',
    message: 'TOML formatting stays disabled for files with comments in this phase.',
  }), false)

  assert.equal(isEditorSetupHintActionable('codeActions', {
    available: false,
    source: 'ruff',
    reason: 'provider_degraded',
    message: 'Ruff failed unexpectedly.',
  }), false)
})

test('setup-hint helper builds stable dismissible hints per workspace, capability, provider, and reason', () => {
  const projectFolder = 'C:\\Workspace\\ADDOM'
  const formattingCapability = {
    available: false,
    source: 'clang-format',
    reason: 'clang_format_not_installed',
    message: 'clang-format was not found on PATH.',
  }
  const codeActionsCapability = {
    available: false,
    source: 'syntax-only',
    reason: 'real_provider_missing',
    message: 'Code actions require a project-configured ESLint provider.',
  }

  const formatHint = buildEditorSetupHint({
    projectFolder,
    capabilityKey: 'formatting',
    capability: formattingCapability,
  })
  const fixHint = buildEditorSetupHint({
    projectFolder,
    capabilityKey: 'codeActions',
    capability: codeActionsCapability,
  })

  assert.equal(formatHint?.id, 'c:/Workspace/ADDOM::formatting::clang-format::clang_format_not_installed')
  assert.equal(formatHint?.providerLabel, 'clang-format')
  assert.equal(fixHint?.id, 'c:/Workspace/ADDOM::codeActions::eslint-project-config::real_provider_missing')
  assert.equal(fixHint?.providerLabel, 'ESLint')

  const visibleHints = buildEditorSetupHints({
    projectFolder,
    capabilities: {
      formatting: formattingCapability,
      codeActions: codeActionsCapability,
    },
    dismissedHintIds: {
      [formatHint.id]: true,
    },
  })

  assert.equal(visibleHints.length, 1)
  assert.equal(visibleHints[0].id, fixHint.id)
})

test('setup-hint helper internals keep the expected provider inventory for current format and fix routes', () => {
  assert.deepEqual(Object.keys(__testEditorSetupHintInternals.PROVIDER_METADATA).sort(), [
    'biome',
    'clang-format',
    'clang-tidy',
    'clangd',
    'csharp-ls',
    'csharpier',
    'dotnet-format',
    'eslint-project-config',
    'jdtls',
    'prettier',
    'pyright',
    'ruff',
    'smol-toml',
    'tsserver',
  ])
})

test('setup and outline helper localize structured editor capability messages', () => {
  assert.equal(buildLocalizedEditorCapabilityMessage({
    t: tEs,
    capabilityKey: 'codeActions',
    capability: {
      source: 'eslint-project-config',
      reason: 'real_provider_missing',
      message: 'Code actions require a project-configured ESLint provider.',
    },
  }), 'Las code actions requieren un provider de ESLint configurado en el proyecto.')

  assert.equal(buildLocalizedEditorCapabilityMessage({
    t: tEs,
    capabilityKey: 'formatting',
    capability: {
      source: 'clang-format',
      reason: 'missing_provider_binary',
      message: 'RAW ENGLISH SHOULD NOT LEAK',
    },
  }), 'No se encontró clang-format en este proyecto ni en PATH.')

  assert.equal(buildLocalizedEditorCapabilityMessage({
    t: tEs,
    capabilityKey: 'symbols',
    context: 'outline',
    capability: {
      source: 'jdtls',
      reason: 'real_provider_missing',
      message: 'RAW ENGLISH SHOULD NOT LEAK',
    },
  }), 'Este archivo se queda solo con sintaxis porque no hay ningún provider real disponible para este lenguaje.')
})

test('service notice helper localizes actionable provider health notices', () => {
  const notice = buildLocalizedEditorServiceNotice({
    t: tEs,
    serviceState: {
      health: {
        status: 'degraded',
        providers: [
          { id: 'clangd', status: 'degraded', message: 'RAW ENGLISH SHOULD NOT LEAK' },
        ],
      },
    },
  })

  assert.deepEqual(notice, {
    id: 'provider:clangd:degraded',
    text: 'clangd está degradado. Las funciones del editor pueden estar limitadas.',
  })
})
