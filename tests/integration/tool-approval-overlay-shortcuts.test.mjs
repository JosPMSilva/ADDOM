import test from 'node:test'
import assert from 'node:assert/strict'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let resolveApprovalKeyboardAction = null

test.before(async () => {
  const mod = await ssrLoadRendererModule('/components/tool-approval-keyboard.mjs')
  resolveApprovalKeyboardAction = mod?.resolveApprovalKeyboardAction || null
})

test.after(async () => {
  await closeViteSsrLoader()
})

test('resolveApprovalKeyboardAction maps Enter to approve and Escape to deny', () => {
  assert.equal(typeof resolveApprovalKeyboardAction, 'function')

  const approve = resolveApprovalKeyboardAction({
    event: { key: 'Enter', target: { tagName: 'DIV' } },
    expired: false,
    enterApprovalDisabled: false,
    keyboardLocked: false,
  })
  assert.equal(approve, 'approve')

  const deny = resolveApprovalKeyboardAction({
    event: { key: 'Escape', target: { tagName: 'DIV' } },
    expired: false,
    enterApprovalDisabled: false,
    keyboardLocked: false,
  })
  assert.equal(deny, 'deny')
})

test('resolveApprovalKeyboardAction blocks shortcuts for text fields, modifiers, locked state, and expired approvals', () => {
  const samples = [
    { event: { key: 'Enter', target: { tagName: 'INPUT' } } },
    { event: { key: 'Enter', ctrlKey: true, target: { tagName: 'DIV' } } },
    { event: { key: 'Enter', target: { tagName: 'DIV' } }, keyboardLocked: true },
    { event: { key: 'Enter', target: { tagName: 'DIV' } }, expired: true },
    { event: { key: 'Enter', target: { tagName: 'DIV' } }, enterApprovalDisabled: true },
    { event: { key: 'x', target: { tagName: 'DIV' } } },
  ]
  for (const sample of samples) {
    const action = resolveApprovalKeyboardAction({
      event: sample.event,
      expired: !!sample.expired,
      enterApprovalDisabled: !!sample.enterApprovalDisabled,
      keyboardLocked: !!sample.keyboardLocked,
    })
    assert.equal(action, 'none')
  }
})

test('resolveApprovalKeyboardAction leaves Enter to the focused approval action', () => {
  const focusedButtonEnter = resolveApprovalKeyboardAction({
    event: { key: 'Enter', target: { tagName: 'BUTTON' } },
  })
  assert.equal(focusedButtonEnter, 'none')

  const nestedButtonEnter = resolveApprovalKeyboardAction({
    event: {
      key: 'Enter',
      target: {
        tagName: 'SPAN',
        closest: () => ({ tagName: 'BUTTON' }),
      },
    },
  })
  assert.equal(nestedButtonEnter, 'none')

  const focusedButtonEscape = resolveApprovalKeyboardAction({
    event: { key: 'Escape', target: { tagName: 'BUTTON' } },
  })
  assert.equal(focusedButtonEscape, 'deny')
})
