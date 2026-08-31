import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCodeBlockKeymap,
  applyCodeCommentToggleAction,
  applyCodeEnterAction,
  applyCodeTabAction,
  commentPrefixForLanguage,
} from '../../src/renderer/components/chat/composer-code-keymap.mjs'

test('Tab inserts two spaces at caret for collapsed selections', () => {
  const result = applyCodeTabAction({
    value: 'abc',
    selectionStart: 1,
    selectionEnd: 1,
    shiftKey: false,
  })
  assert.equal(result.handled, true)
  assert.equal(result.value, 'a  bc')
  assert.equal(result.selectionStart, 3)
  assert.equal(result.selectionEnd, 3)
})

test('Tab and Shift+Tab indent/outdent selected lines', () => {
  const source = 'one\n  two\nthree'
  const indented = applyCodeTabAction({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
    shiftKey: false,
  })
  assert.equal(indented.value, '  one\n    two\n  three')

  const outdented = applyCodeTabAction({
    value: indented.value,
    selectionStart: 0,
    selectionEnd: indented.value.length,
    shiftKey: true,
  })
  assert.equal(outdented.value, source)
})

test('Enter preserves indentation and adds one unit after block openers', () => {
  const withColon = applyCodeEnterAction({
    value: 'if ready:',
    selectionStart: 'if ready:'.length,
    selectionEnd: 'if ready:'.length,
  })
  assert.equal(withColon.value, 'if ready:\n  ')

  const withIndent = applyCodeEnterAction({
    value: '  return value',
    selectionStart: '  return'.length,
    selectionEnd: '  return'.length,
  })
  assert.equal(withIndent.value, '  return\n   value')
})

test('Ctrl/Cmd+/ toggles language-aware line comments', () => {
  const pySource = 'print("a")\nprint("b")'
  const commented = applyCodeCommentToggleAction({
    value: pySource,
    selectionStart: 0,
    selectionEnd: pySource.length,
    language: 'py',
  })
  assert.equal(commented.value, '# print("a")\n# print("b")')

  const uncommented = applyCodeCommentToggleAction({
    value: commented.value,
    selectionStart: 0,
    selectionEnd: commented.value.length,
    language: 'py',
  })
  assert.equal(uncommented.value, pySource)

  assert.equal(commentPrefixForLanguage('sql'), '--')
  assert.equal(commentPrefixForLanguage('js'), '//')
})

test('applyCodeBlockKeymap routes key combos and preserves unhandled keys', () => {
  const handled = applyCodeBlockKeymap({
    value: 'abc',
    selectionStart: 1,
    selectionEnd: 1,
    key: 'Tab',
  })
  assert.equal(handled.handled, true)
  assert.equal(handled.value, 'a  bc')

  const comment = applyCodeBlockKeymap({
    value: 'x',
    selectionStart: 0,
    selectionEnd: 1,
    key: '/',
    ctrlKey: true,
    language: 'py',
  })
  assert.equal(comment.handled, true)
  assert.equal(comment.value, '# x')

  const unhandled = applyCodeBlockKeymap({
    value: 'abc',
    selectionStart: 0,
    selectionEnd: 0,
    key: 'a',
  })
  assert.equal(unhandled.handled, false)
  assert.equal(unhandled.value, 'abc')
})
