import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const SURFACE_FILES = [
  'src/renderer/components/AppErrorBoundary.jsx',
  'src/renderer/components/PanelErrorBoundary.jsx',
  'src/renderer/components/ui/PromptSurface.jsx',
  'src/renderer/components/terminal/TerminalStatusBanner.jsx',
  'src/renderer/components/ToolApprovalOverlayPolicyPanels.jsx',
  'src/renderer/components/ToolApprovalOverlayDecisionDetails.jsx',
]

test('semantic surfaces do not use colored vertical edge rails', async () => {
  for (const filePath of SURFACE_FILES) {
    const source = await readFile(new URL(`../../${filePath}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /inset_2px_0_0/, `${filePath} should not use an inset edge rail`)
    assert.doesNotMatch(
      source,
      /border-l(?:-2)?[^\n"']*(?:warning|danger|success|accent)/,
      `${filePath} should not use a semantic-colored left border`,
    )
  }
})

