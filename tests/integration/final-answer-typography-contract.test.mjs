import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

test('final answers have a dedicated stylesheet after shared execution prose', () => {
  const globals = read('src/renderer/styles/globals.css')
  const finalAnswer = read('src/renderer/styles/final-answer-document.css')

  assert.match(globals, /@import "\.\/chat-prose\.css";\s*@import "\.\/final-answer-document\.css";/)
  assert.match(finalAnswer, /\.final-answer-document \{/)
  assert.doesNotMatch(finalAnswer, /\.prose-chat\.chat-typo-exec-reasoning-prose/)
  assert.doesNotMatch(finalAnswer, /@media[^{}]*min-width[^{}]*font-size/)
})

test('final document uses restrained typography and one explicit block rhythm owner', () => {
  const finalAnswer = read('src/renderer/styles/final-answer-document.css')

  assert.match(finalAnswer, /font-family: var\(--font-sans\);/)
  assert.match(finalAnswer, /font-size: var\(--chat-prose-body-size\);/)
  assert.match(finalAnswer, /line-height: 1\.62;/)
  assert.match(finalAnswer, /\.final-answer-document > \* \+ \* \{/)
  assert.match(finalAnswer, /\.final-answer-heading \{[\s\S]*font-family: var\(--font-display\);/)
  assert.match(finalAnswer, /\.final-answer-inline-code \{[\s\S]*font-family: var\(--font-mono\);/)
  assert.match(finalAnswer, /overflow-wrap: anywhere;/)
})

test('final tables are native, lightly separated, horizontally scrollable, and keyboard visible', () => {
  const finalAnswer = read('src/renderer/styles/final-answer-document.css')
  const components = read('src/renderer/components/chat/final-document/final-answer-markdown-components.jsx')

  assert.match(components, /data-final-answer-table-scroll="true" tabIndex=\{0\}/)
  assert.match(components, /<table className="final-answer-table">/)
  assert.match(finalAnswer, /\.final-answer-table-scroll \{[\s\S]*overflow-x: auto;/)
  assert.match(finalAnswer, /\.final-answer-table-scroll:focus-visible \{[\s\S]*outline:/)
  assert.match(finalAnswer, /\.final-answer-table \{[\s\S]*border-collapse: collapse;/)
  assert.match(finalAnswer, /\.final-answer-table-cell \{[\s\S]*border-bottom:/)
  assert.match(finalAnswer, /\.final-answer-table \{[^}]*width:\s*100%[^}]*table-layout:\s*fixed/s)
  assert.match(finalAnswer, /\.final-answer-table-header,[\s\S]*\.final-answer-table-cell \{[^}]*min-width:\s*0/s)
  assert.match(finalAnswer, /@media\s*\(max-width:\s*700px\)[\s\S]*\.final-answer-table \{[^}]*width:\s*max-content[^}]*table-layout:\s*auto/s)
  assert.doesNotMatch(components, /record_list|reference_table|columnWidths|<colgroup/)
})

test('code blocks keep the shared accessible code primitive', () => {
  const code = read('src/renderer/components/chat/CodeSnippetBlock.jsx')
  const components = read('src/renderer/components/chat/final-document/final-answer-markdown-components.jsx')

  assert.match(components, /<CodeSnippetBlock text=\{nodeText\(children\)\} language=\{codeLanguage\(children\)\} \/>/)
  assert.match(code, /data-chat-code-viewport="true"/)
  assert.match(code, /tabIndex=\{0\}/)
  assert.match(code, /<CopyBlockButton/)
  assert.match(code, /chat-typo-code-label/)
  assert.match(code, /chat-typo-code-body/)
})
