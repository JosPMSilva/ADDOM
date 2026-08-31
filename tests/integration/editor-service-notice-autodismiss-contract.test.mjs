import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('EditorPanelView auto-dismisses language service notices after three seconds', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/editor/EditorPanelView.jsx'),
    'utf8',
  )

  assert.match(source, /EDITOR_SERVICE_NOTICE_AUTO_DISMISS_MS = 3_000/)
  assert.match(source, /useEffect\(\(\) => \{/)
  assert.match(source, /currentLanguageServiceNoticeVisible/)
  assert.match(source, /const timerId = setTimeout\(\(\) => \{/)
  assert.match(source, /dismissServiceNoticeByKey\(setDismissedServiceNoticeByTabKey, currentLanguageServiceNoticeKey\)/)
  assert.match(source, /}, EDITOR_SERVICE_NOTICE_AUTO_DISMISS_MS\)/)
  assert.match(source, /clearTimeout\(timerId\)/)
  assert.match(source, /onClick=\{dismissCurrentLanguageServiceNotice\}/)
})
