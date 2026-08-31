import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// 1. Prompt construction
// ---------------------------------------------------------------------------

test('buildMergePrompt includes all three content blocks for three-way merge', async () => {
  const { buildMergePrompt } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_prompt=${Date.now()}`
  )

  const result = buildMergePrompt(
    'base content',
    'ours content',
    'theirs content',
    'src/utils/helpers.ts',
  )

  assert.ok(result.includes('File: src/utils/helpers.ts'), 'includes file path')
  assert.ok(result.includes('BASE (common ancestor)'), 'includes BASE label')
  assert.ok(result.includes('OURS'), 'includes OURS label')
  assert.ok(result.includes('THEIRS'), 'includes THEIRS label')
  assert.ok(result.includes('base content'), 'includes base content')
  assert.ok(result.includes('ours content'), 'includes ours content')
  assert.ok(result.includes('theirs content'), 'includes theirs content')
})

test('buildMergePrompt adjusts for no-base (two independent creations)', async () => {
  const { buildMergePrompt } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_no_base=${Date.now()}`
  )

  const result = buildMergePrompt(
    '',
    'version A',
    'version B',
    'src/new-file.ts',
  )

  assert.ok(!result.includes('BASE'), 'no BASE label when base is empty')
  assert.ok(result.includes('OURS (first version)'), 'uses first/second version labels')
  assert.ok(result.includes('THEIRS (second version)'), 'uses second version label')
  assert.ok(result.includes('Reconcile'), 'asks for reconciliation')
})

// ---------------------------------------------------------------------------
// 2. Code block extraction
// ---------------------------------------------------------------------------

test('extractCodeBlock extracts content from fenced code block', async () => {
  const { extractCodeBlock } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_extract=${Date.now()}`
  )

  const text = [
    'Here is the merged result:',
    '```typescript',
    'const a = 1;',
    'const b = 2;',
    '```',
    'I merged both changes.',
  ].join('\n')

  const result = extractCodeBlock(text)
  assert.equal(result, 'const a = 1;\nconst b = 2;\n')
})

test('extractCodeBlock returns null when no code block found', async () => {
  const { extractCodeBlock } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_no_block=${Date.now()}`
  )

  assert.equal(extractCodeBlock('just plain text'), null)
  assert.equal(extractCodeBlock(''), null)
  assert.equal(extractCodeBlock(null), null)
})

test('extractCodeBlock handles nested code blocks (first open + last close)', async () => {
  const { extractCodeBlock } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_nested=${Date.now()}`
  )

  // Simulates a Markdown file with embedded code examples
  const text = [
    '```markdown',
    '# README',
    '',
    '```javascript',
    'const x = 1;',
    '```',
    '',
    'More text.',
    '```',
    'I merged both changes.',
  ].join('\n')

  const result = extractCodeBlock(text)
  // Should capture everything between first opening ``` and last closing ```
  assert.ok(result.includes('# README'), 'includes start of file')
  assert.ok(result.includes('const x = 1;'), 'includes inner code block content')
  assert.ok(result.includes('More text.'), 'includes text after inner block')
})

// ---------------------------------------------------------------------------
// 3. Explanation extraction
// ---------------------------------------------------------------------------

test('extractExplanation returns text after last code fence', async () => {
  const { extractExplanation } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_explain=${Date.now()}`
  )

  const text = '```\ncode\n```\nMerged both changes cleanly.'
  assert.equal(extractExplanation(text), 'Merged both changes cleanly.')
})

test('extractExplanation returns empty string with no code fence', async () => {
  const { extractExplanation } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_explain_empty=${Date.now()}`
  )

  assert.equal(extractExplanation('no fences here'), '')
  assert.equal(extractExplanation(''), '')
})

// ---------------------------------------------------------------------------
// 4. Content size guard
// ---------------------------------------------------------------------------

test('checkContentSize flags hard limit when any file exceeds MAX_CONTENT_BYTES', async () => {
  const { checkContentSize, MAX_CONTENT_BYTES } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_size=${Date.now()}`
  )

  const large = 'x'.repeat(MAX_CONTENT_BYTES + 1)
  const result = checkContentSize(large, 'small', 'small')

  assert.equal(result.exceedsHard, true)
  assert.ok(result.totalBytes > MAX_CONTENT_BYTES)
})

test('checkContentSize flags soft limit correctly', async () => {
  const { checkContentSize, SOFT_CONTENT_BYTES } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_soft=${Date.now()}`
  )

  const medium = 'x'.repeat(SOFT_CONTENT_BYTES + 1)
  const result = checkContentSize('small', medium, 'small')

  assert.equal(result.exceedsSoft, true)
  assert.equal(result.exceedsHard, false)
})

test('checkContentSize reports no flags for small files', async () => {
  const { checkContentSize } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_small=${Date.now()}`
  )

  const result = checkContentSize('a', 'b', 'c')
  assert.equal(result.exceedsHard, false)
  assert.equal(result.exceedsSoft, false)
})

// ---------------------------------------------------------------------------
// 5. generateMergeProposal — edge cases (no AI call needed)
// ---------------------------------------------------------------------------

test('generateMergeProposal returns error when provider/model is missing', async () => {
  const { generateMergeProposal } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_no_prov=${Date.now()}`
  )

  const result = await generateMergeProposal({
    baseContent: 'a',
    oursContent: 'b',
    theirsContent: 'c',
    filePath: 'test.txt',
    providerId: '',
    apiKey: 'key',
    model: '',
  })

  assert.equal(result.ok, false)
  assert.ok(result.error.includes('No AI provider'))
})

test('generateMergeProposal returns error when OpenAI authentication is not ready', async () => {
  const previousUserDataPath = process.env.ADDOM_USER_DATA_PATH
  const isolatedUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-merge-no-key-'))

  try {
    process.env.ADDOM_USER_DATA_PATH = isolatedUserDataPath
    const { setSettingsPatch } = await import('../../src/main/settings.mjs')
    await setSettingsPatch({
      providerAuthSettings: {
        openai: {
          authMethod: 'api_key',
        },
      },
    })

    const { generateMergeProposal } = await import(
      `../../src/main/chat/merge-resolution.mjs?merge_no_key=${Date.now()}`
    )

    const result = await generateMergeProposal({
      baseContent: 'a',
      oursContent: 'b',
      theirsContent: 'c',
      filePath: 'test.txt',
      providerId: 'openai',
      apiKey: '',
      model: 'gpt-4o',
    })

    assert.equal(result.ok, false)
    assert.match(
      result.error,
      /OpenAI authentication is not ready yet|OpenAI authentication is currently unavailable|No API key available for the selected provider/i,
    )
  } finally {
    process.env.ADDOM_USER_DATA_PATH = previousUserDataPath
    try { fs.rmSync(isolatedUserDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('generateMergeProposal fails closed when OpenAI account auth is selected without an account runtime', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousUserDataPath = process.env.ADDOM_USER_DATA_PATH
  const isolatedUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-resolution-auth-'))

  try {
    process.env.NODE_ENV = 'test'
    process.env.ADDOM_USER_DATA_PATH = isolatedUserDataPath
    const { setSettingsPatch } = await import(
      `../../src/main/settings.mjs?merge_account_settings=${Date.now()}`
    )
    await setSettingsPatch({
      providerAuthSettings: {
        openai: {
          authMethod: 'account',
        },
      },
    })

    const { generateMergeProposal } = await import(
      `../../src/main/chat/merge-resolution.mjs?merge_account_blocked=${Date.now()}`
    )

    const result = await generateMergeProposal({
      baseContent: 'a',
      oursContent: 'b',
      theirsContent: 'c',
      filePath: 'test.txt',
      providerId: 'openai',
      apiKey: '',
      model: 'gpt-4o',
    })

    assert.equal(result.ok, false)
    assert.match(
      result.error,
      /OpenAI authentication is currently unavailable|OpenAI account auth is unavailable|runtime path still requires API-key execution|bridge availability has not been checked yet/i,
    )
  } finally {
    process.env.NODE_ENV = previousNodeEnv
    process.env.ADDOM_USER_DATA_PATH = previousUserDataPath
    try { fs.rmSync(isolatedUserDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('generateMergeProposal short-circuits when ours equals theirs', async () => {
  const { generateMergeProposal } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_identical=${Date.now()}`
  )

  const result = await generateMergeProposal({
    baseContent: 'old',
    oursContent: 'same content',
    theirsContent: 'same content',
    filePath: 'test.txt',
    providerId: 'openai',
    apiKey: 'key',
    model: 'gpt-4o',
  })

  assert.equal(result.ok, true)
  assert.equal(result.mergedContent, 'same content')
  assert.ok(result.explanation.includes('identical'))
})

test('generateMergeProposal rejects files exceeding hard size limit', async () => {
  const { generateMergeProposal, MAX_CONTENT_BYTES } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_too_big=${Date.now()}`
  )

  const large = 'x'.repeat(MAX_CONTENT_BYTES + 1)
  const result = await generateMergeProposal({
    baseContent: large,
    oursContent: 'ours version',
    theirsContent: 'theirs version',
    filePath: 'big.txt',
    providerId: 'openai',
    apiKey: 'key',
    model: 'gpt-4o',
  })

  assert.equal(result.ok, false)
  assert.ok(result.error.includes('too large'))
})

test('generateMergeProposal returns error on abort', async () => {
  const { generateMergeProposal } = await import(
    `../../src/main/chat/merge-resolution.mjs?merge_abort=${Date.now()}`
  )

  const abortController = new AbortController()
  abortController.abort()

  const result = await generateMergeProposal({
    baseContent: 'a',
    oursContent: 'b',
    theirsContent: 'c',
    filePath: 'test.txt',
    providerId: 'openai',
    apiKey: 'key',
    model: 'gpt-4o',
    abortSignal: abortController.signal,
  })

  assert.equal(result.ok, false)
  assert.ok(result.error.includes('cancelled'))
})
