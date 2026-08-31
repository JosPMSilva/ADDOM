import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createCodeComposerBlock,
  extractComposerBlocksFromDraftText,
  parseComposerMarkdownToBlocksAndDraft,
  serializeComposerBlocksAndDraft,
} from '../../src/renderer/components/chat/composer-segments.mjs'
import {
  deriveComposerDraftMetadata,
  hasTripleBacktickFenceCandidate,
  resolveComposerDraftTextChange,
} from '../../src/renderer/components/chat/use-chat-panel-composer-draft-state.mjs'
import {
  applySlashCommandSelection,
  filterSlashCommands,
  resolveSlashCommandMenuState,
  resolveSlashCommandQuery,
  SLASH_COMMANDS,
} from '../../src/renderer/components/chat/slash-command-registry.mjs'

test('extracts a single multi-line fenced block into code block and empty draft', () => {
  const input = '```py\nprint(1)\n```'
  const result = extractComposerBlocksFromDraftText(input)

  assert.equal(result.remainingDraftText, '')
  assert.equal(result.blocksToAppend.length, 1)
  assert.equal(result.blocksToAppend[0].type, 'code')
  assert.equal(result.blocksToAppend[0].language, 'py')
  assert.equal(result.blocksToAppend[0].code, 'print(1)')
})

test('extracts multiple fenced blocks with text between in order', () => {
  const input = '```py\nprint(1)\n```\n\ntext between\n\n```js\nconsole.log(1)\n```'
  const { blocksToAppend, remainingDraftText } = extractComposerBlocksFromDraftText(input)

  assert.equal(remainingDraftText, '')
  assert.deepEqual(
    blocksToAppend.map((b) => [b.type, b.type === 'code' ? b.language : b.text]),
    [
      ['code', 'py'],
      ['text', '\n\ntext between\n\n'],
      ['code', 'js'],
    ],
  )
})

test('extracts inline fenced blocks and preserves surrounding text with trailing draft text', () => {
  const input = 'before ```py print(1)``` middle ```js console.log(2)``` after'
  const { blocksToAppend, remainingDraftText } = extractComposerBlocksFromDraftText(input)

  assert.equal(remainingDraftText, ' after')
  assert.deepEqual(
    blocksToAppend.map((b) => [b.type, b.type === 'code' ? [b.language, b.code] : b.text]),
    [
      ['text', 'before '],
      ['code', ['py', 'print(1)']],
      ['text', ' middle '],
      ['code', ['js', 'console.log(2)']],
    ],
  )
})

test('leaves unclosed fence in draft text and does not create partial code block', () => {
  const input = 'notes before\n```py\nprint(1)'
  const { blocksToAppend, remainingDraftText } = extractComposerBlocksFromDraftText(input)

  assert.equal(blocksToAppend.length, 0)
  assert.equal(remainingDraftText, input)
})

test('round-trip serialization does not amplify blank lines for parsed markdown', () => {
  const input = '```py\nprint(1)\n```\n\ntext between\n\n```js\nconsole.log(1)\n```'
  const parsed = parseComposerMarkdownToBlocksAndDraft(input)
  const output = serializeComposerBlocksAndDraft(parsed)

  assert.equal(output, input)
})

test('serializer uses longer fence when code contains triple backticks', () => {
  const codeBlock = createCodeComposerBlock({
    language: 'md',
    code: '```js\nconst x = 1;\n```',
  }, 'code1')

  const output = serializeComposerBlocksAndDraft({
    blocks: [codeBlock],
    draftText: '',
  })

  assert.match(output, /^````md\n/)
  assert.match(output, /\n````$/)
})

test('mixed inline and multi-line fences preserve order and content', () => {
  const input = 'lead ```py print(1)```\n\n```js\nconsole.log(2)\n```\n\ntrail'
  const parsed = parseComposerMarkdownToBlocksAndDraft(input)
  const output = serializeComposerBlocksAndDraft(parsed)

  assert.equal(output, 'lead \n\n```py\nprint(1)\n```\n\n```js\nconsole.log(2)\n```\n\ntrail')
  assert.deepEqual(
    parsed.composerBlocks.map((b) => b.type),
    ['text', 'code', 'text', 'code'],
  )
  assert.equal(parsed.composerBlocks[1].language, 'py')
  assert.equal(parsed.composerBlocks[1].code, 'print(1)')
  assert.equal(parsed.composerBlocks[3].language, 'js')
  assert.equal(parsed.composerBlocks[3].code, 'console.log(2)')
  assert.equal(parsed.composerDraftText, '\n\ntrail')
})

test('serializes code-text-code blocks with safe markdown boundaries', () => {
  const blocks = [
    createCodeComposerBlock({ language: 'js', code: 'If you read this say hello' }, 'c1'),
    { id: 't1', type: 'text', text: 'If you read this say hi' },
    createCodeComposerBlock({ language: 'py', code: 'If you read this say test' }, 'c2'),
  ]

  const output = serializeComposerBlocksAndDraft({ blocks, draftText: '' })

  assert.equal(
    output,
    '```js\nIf you read this say hello\n```\n\nIf you read this say hi\n\n```py\nIf you read this say test\n```',
  )
})

test('plain-text draft typing stays on the fast path and preserves prior blocks', () => {
  const previousBlocks = []
  const result = resolveComposerDraftTextChange({
    nextDraftValue: 'hello world',
    previousBlocks,
  })

  assert.equal(result.usedFenceParsing, false)
  assert.equal(result.parseFailed, false)
  assert.equal(result.nextComposerBlocks, previousBlocks)
  assert.equal(result.nextComposerDraftText, 'hello world')
})

test('plain-text deleting after removing fence markers stays on the fast path', () => {
  const previousBlocks = []
  const nextDraftValue = '``py\nprint(1)\n``'
  const result = resolveComposerDraftTextChange({
    nextDraftValue,
    previousBlocks,
  })

  assert.equal(hasTripleBacktickFenceCandidate(nextDraftValue), false)
  assert.equal(result.usedFenceParsing, false)
  assert.equal(result.nextComposerBlocks, previousBlocks)
  assert.equal(result.nextComposerDraftText, nextDraftValue)
})

test('complete fence entry still promotes the draft into a code block', () => {
  const result = resolveComposerDraftTextChange({
    nextDraftValue: '```py\nprint(1)\n```',
    previousBlocks: [],
  })

  assert.equal(result.usedFenceParsing, true)
  assert.equal(result.parseFailed, false)
  assert.equal(result.nextComposerBlocks.length, 1)
  assert.equal(result.nextComposerBlocks[0].type, 'code')
  assert.equal(result.nextComposerBlocks[0].language, 'py')
  assert.equal(result.nextComposerBlocks[0].code, 'print(1)')
  assert.equal(result.nextComposerDraftText, '')
})

test('incomplete fence candidate still stays in the draft without promoting a block', () => {
  const previousBlocks = []
  const nextDraftValue = '```py\nprint(1)'
  const result = resolveComposerDraftTextChange({
    nextDraftValue,
    previousBlocks,
  })

  assert.equal(result.usedFenceParsing, true)
  assert.equal(result.parseFailed, false)
  assert.equal(result.nextComposerBlocks, previousBlocks)
  assert.equal(result.nextComposerDraftText, nextDraftValue)
})

test('composer draft metadata keeps direct-agent detection cheap for plain drafts', () => {
  assert.deepEqual(
    deriveComposerDraftMetadata({
      composerBlocks: [],
      composerDraftText: '@agent fix this flow',
    }),
    {
      hasComposerContent: true,
      isDirectAgentDraft: true,
    },
  )

  assert.deepEqual(
    deriveComposerDraftMetadata({
      composerBlocks: [{ id: 'code', type: 'code', language: 'js', code: '' }],
      composerDraftText: '@agent fix this flow',
    }),
    {
      hasComposerContent: true,
      isDirectAgentDraft: false,
    },
  )
})

test('slash menu opens for a leading slash token and exposes the full command list', () => {
  const result = resolveSlashCommandMenuState({
    draftText: '/',
    selectionStart: 1,
    selectionEnd: 1,
    slashCommandsEnabled: true,
  })

  assert.equal(result.open, true)
  assert.equal(result.query, '')
  assert.equal(result.items.length, SLASH_COMMANDS.length)
})

test('slash menu filters commands by the typed query', () => {
  const filtered = filterSlashCommands('rev')

  assert.deepEqual(
    filtered.map((item) => item.label),
    ['/review'],
  )
})

test('slash query does not activate for non-leading slash text', () => {
  const result = resolveSlashCommandQuery({
    draftText: 'please /review this',
    selectionStart: 19,
    selectionEnd: 19,
    slashCommandsEnabled: true,
  })

  assert.equal(result, null)
})

test('slash menu stays disabled when composer blocks are present', () => {
  const result = resolveSlashCommandMenuState({
    draftText: '/review',
    selectionStart: 7,
    selectionEnd: 7,
    slashCommandsEnabled: false,
  })

  assert.deepEqual(result, {
    open: false,
    query: '',
    token: '',
    items: [],
  })
})

test('slash selection replaces the leading token with the command template', () => {
  const nextDraft = applySlashCommandSelection({
    draftText: '/rev',
    command: SLASH_COMMANDS.find((item) => item.id === 'review'),
    selectionStart: 4,
    selectionEnd: 4,
    slashCommandsEnabled: true,
  })

  assert.equal(nextDraft, '/review ')
})
