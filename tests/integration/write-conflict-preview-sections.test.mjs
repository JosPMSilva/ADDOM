import test from 'node:test'
import assert from 'node:assert/strict'

const { buildMergePreviewSections } = await import('../../src/renderer/components/chat/write-conflict-preview.mjs')

test('buildMergePreviewSections returns both revision comparisons when both revisions are loaded', () => {
  const sections = buildMergePreviewSections({
    mergedContent: 'const merged = true\n',
    oursLoaded: true,
    oursContent: 'const ours = true\n',
    theirsLoaded: true,
    theirsContent: 'const theirs = true\n',
  })

  assert.deepEqual(sections, [
    {
      id: 'ours',
      label: 'Your write -> merge result',
      prevContent: 'const ours = true\n',
      newContent: 'const merged = true\n',
    },
    {
      id: 'theirs',
      label: 'Other write -> merge result',
      prevContent: 'const theirs = true\n',
      newContent: 'const merged = true\n',
    },
  ])
})

test('buildMergePreviewSections omits unloaded revisions', () => {
  const sections = buildMergePreviewSections({
    mergedContent: 'const merged = true\n',
    oursLoaded: false,
    oursContent: '',
    theirsLoaded: true,
    theirsContent: '',
  })

  assert.deepEqual(sections, [
    {
      id: 'theirs',
      label: 'Other write -> merge result',
      prevContent: '',
      newContent: 'const merged = true\n',
    },
  ])
})
