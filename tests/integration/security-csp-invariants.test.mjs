import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function extractProdCspArraySource(source = '') {
  const match = String(source || '').match(/const PROD_CSP = \[([\s\S]*?)\]\.join\('; '\)/)
  return match ? String(match[1] || '') : ''
}

test('production CSP keeps required hardening invariants', () => {
  const source = fs.readFileSync(path.resolve('src/main/index.mjs'), 'utf8')
  const cspArraySource = extractProdCspArraySource(source)
  assert.ok(cspArraySource, 'PROD_CSP definition should exist in main process source')

  assert.match(cspArraySource, /"default-src 'self'"/)
  assert.match(cspArraySource, /"script-src 'self'"/)
  assert.match(cspArraySource, /"worker-src 'self' blob:"/)
  assert.match(cspArraySource, /"style-src 'self' 'unsafe-inline'"/)
  assert.match(cspArraySource, /"font-src 'self' data:"/)
  assert.match(cspArraySource, /img-src 'self' data: blob: \$\{ATTACHMENT_PREVIEW_SCHEME\}:/)
  assert.match(cspArraySource, /"connect-src 'self'"/)
  assert.match(cspArraySource, /"object-src 'none'"/)
  assert.match(cspArraySource, /"frame-src 'none'"/)
  assert.match(cspArraySource, /"frame-ancestors 'none'"/)
  assert.match(cspArraySource, /"base-uri 'self'"/)
  assert.match(cspArraySource, /"form-action 'self'"/)

  assert.doesNotMatch(cspArraySource, /script-src[^"\n]*'unsafe-eval'/)
  assert.doesNotMatch(cspArraySource, /script-src[^"\n]*'unsafe-inline'/)
  assert.doesNotMatch(cspArraySource, /connect-src[^"\n]*(https?:|ws:|wss:)/)
  assert.doesNotMatch(cspArraySource, /script-src[^"\n]*(https?:|blob:)/)
})

test('packaged renderer is served through the addom-app protocol instead of file loads', () => {
  const source = fs.readFileSync(path.resolve('src/main/index.mjs'), 'utf8')
  const protocolSource = fs.readFileSync(path.resolve('src/main/main-protocol-registration.mjs'), 'utf8')

  assert.match(source, /const RENDERER_APP_SCHEME = 'addom-app'/)
  assert.match(source, /rendererAppScheme: RENDERER_APP_SCHEME/)
  assert.match(protocolSource, /scheme: rendererAppScheme/)
  assert.match(protocolSource, /standard: true/)
  assert.match(protocolSource, /secure: true/)
  assert.match(protocolSource, /supportFetchAPI: true/)
  assert.match(source, /protocol\.handle\(RENDERER_APP_SCHEME,\s*async \(request\)/)
  assert.match(source, /mainWindow\.loadURL\(buildRendererAppUrl\(\)\)/)
  assert.doesNotMatch(source, /mainWindow\.loadFile\(path\.join\(__dirname,\s*'\.\.',\s*'\.\.',\s*'dist',\s*'index\.html'\)\)/)
})

test('renderer CSP fallback is injected by Vite with a strict production branch', () => {
  const viteSource = fs.readFileSync(path.resolve('vite.config.js'), 'utf8')
  const rendererHtml = fs.readFileSync(path.resolve('src/renderer/index.html'), 'utf8')

  assert.match(rendererHtml, /content="%ADDOM_RENDERER_CSP%"/)
  assert.match(viteSource, /function buildRendererCsp\s*\(\s*\{\s*isProd\s*\}\s*\)/)
  assert.match(viteSource, /name:\s*'addom-renderer-csp'/)
  assert.match(viteSource, /html\.replace\(\/%ADDOM_RENDERER_CSP%\/g,\s*rendererCsp\)/)
  assert.match(viteSource, /isProd \? "script-src 'self'" : "script-src 'self' 'unsafe-inline'"/)
  assert.match(viteSource, /isProd \? "worker-src 'self' blob:" : "worker-src 'self' blob: http:\/\/localhost:5173"/)
  assert.match(viteSource, /isProd \? "connect-src 'self'" : "connect-src 'self' http:\/\/localhost:5173 ws:\/\/localhost:5173(?: http:\/\/localhost:4723)?"/)
  assert.doesNotMatch(viteSource, /"frame-ancestors 'none'"/)
  assert.match(rendererHtml, /fallback omits frame-ancestors because browsers ignore that directive/i)
  assert.doesNotMatch(viteSource, /unsafe-eval/)
})

test('renderer fallback keeps only localhost dev allowances in source contract', () => {
  const viteSource = fs.readFileSync(path.resolve('vite.config.js'), 'utf8')

  assert.match(viteSource, /"script-src 'self' 'unsafe-inline'"/)
  assert.match(viteSource, /"worker-src 'self' blob: http:\/\/localhost:5173"/)
  assert.match(viteSource, /"connect-src 'self' http:\/\/localhost:5173 ws:\/\/localhost:5173 http:\/\/localhost:4723"/)
  assert.doesNotMatch(viteSource, /connect-src[^"\n]*(https:\/\/|wss:\/\/)/)
  assert.doesNotMatch(viteSource, /unsafe-eval/)
})
