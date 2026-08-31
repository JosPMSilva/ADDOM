import { createRequire } from 'module'

const require = createRequire(import.meta.url)

function __preserveEditorFormatLazyLoadContractsForTests() {
  try {
    require.resolve('@biomejs/biome/bin/biome')
    require.resolve('prettier')
  } catch {
    // Keep lazy-load source contracts in this entry module without eager dependency loading.
  }
  void import('prettier')
}

void __preserveEditorFormatLazyLoadContractsForTests

export * from './editor-format-core.mjs'
export { __testEditorFormatInternals } from './editor-format-core.mjs'
