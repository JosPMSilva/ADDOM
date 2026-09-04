import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import { resolveBundledChromiumExecutablePath } from '../../src/main/tools/browser-runtime-paths.mjs'

test('plan workflow browser interactions', { skip: process.env.ADDOM_PLAN_UI_TEST !== '1' }, async (t) => {
  const server = await createServer({
    configFile: path.resolve('vite.config.js'),
    server: { host: '127.0.0.1', port: 5198, strictPort: false, hmr: false },
    plugins: [{ name: 'plan-test-fixture', configureServer(vite) {
      vite.middlewares.use('/__plan-test', async (_req, res) => {
        const fixturePath = path.resolve('tests/helpers/plan-workflow-fixture.jsx').replaceAll('\\', '/')
        const html = await vite.transformIndexHtml('/__plan-test', `<html><body><div id="root"></div><script type="module" src="/@fs/${fixturePath}"></script></body></html>`)
        res.setHeader('Content-Type', 'text/html')
        res.end(html)
      })
    } }],
    logLevel: 'error',
  })
  let browser
  try {
    await server.listen()
    const executablePath = await resolveBundledChromiumExecutablePath()
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    page.setDefaultTimeout(10000)
    const url = `http://127.0.0.1:${server.httpServer.address().port}/__plan-test`
    const openFeedback = async () => {
      await page.goto(url)
      await page.getByRole('button', { name: 'Change direction', exact: true }).click()
      await page.getByRole('textbox').fill('Keep everything local.')
    }
    await t.test('accepted direction update clears the form and restores Create plan', async () => {
      await openFeedback()
      await page.getByRole('button', { name: 'Update direction', exact: true }).click()
      await page.waitForFunction(() => typeof window.fixture.resolveSubmit === 'function')
      assert.equal(await page.getByRole('button', { name: 'Update direction', exact: true }).isDisabled(), true)
      await page.evaluate(() => window.fixture.resolveSubmit())
      await page.getByText('Updating the direction from your choices').waitFor()
      await page.getByRole('button', { name: 'Complete update' }).click()
      await page.getByRole('button', { name: 'Create plan', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Change direction', exact: true }).click()
      assert.equal(await page.getByRole('textbox').inputValue(), '')
    })
    await t.test('failed direction submission keeps feedback for retry', async () => {
      await openFeedback()
      await page.evaluate(() => { window.fixture.fail = true })
      await page.getByRole('button', { name: 'Update direction', exact: true }).click()
      await page.waitForFunction(() => typeof window.fixture.resolveSubmit === 'function')
      await page.evaluate(() => window.fixture.resolveSubmit())
      await page.getByText('Update failed', { exact: true }).waitFor()
      assert.equal(await page.getByRole('textbox').inputValue(), 'Keep everything local.')
      assert.equal(await page.getByRole('button', { name: 'Update direction', exact: true }).isEnabled(), true)
    })
    await t.test('managed document opens read-only, reveals its path and exports a copy', async () => {
      await page.goto(url)
      await page.getByRole('button', { name: 'Show document' }).click()
      await page.getByRole('button', { name: 'Open in editor (read-only)', exact: true }).click()
      await page.waitForFunction(() => window.fixture.editorState().tabs.length === 1)
      assert.equal(await page.evaluate(() => window.fixture.editorState().tabs[0].readOnly), true)
      await page.getByRole('button', { name: 'Reveal in file explorer', exact: true }).click()
      assert.equal(await page.evaluate(() => window.fixture.calls.some(([kind]) => kind === 'reveal')), true)
      await page.getByText('C:/ADDOM-data/managed-plans/scope/plan-one.md', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Save a copy…', exact: true }).click()
      await page.getByText('Saved copy: C:/project/Plan.md', { exact: true }).waitFor()
      if (process.env.ADDOM_PLAN_UI_SCREENSHOT) await page.screenshot({ path: process.env.ADDOM_PLAN_UI_SCREENSHOT })
      await page.getByRole('button', { name: 'Implement', exact: true }).click()
      await page.waitForFunction(() => window.fixture.appState().pendingManagedPlanTurnRequest?.kind === 'implement_plan')
      assert.equal(await page.evaluate(() => window.fixture.chatState().chatMode), 'execute')
      assert.equal(await page.evaluate(() => window.fixture.appState().pendingManagedPlanTurnRequest.handoff.revision), 4)
    })
    await t.test('cancelled and failed exports retain the plan and remain retryable', async () => {
      await page.goto(url)
      await page.getByRole('button', { name: 'Show document' }).click()
      await page.evaluate(() => { window.fixture.cancel = true })
      await page.getByRole('button', { name: 'Save a copy…', exact: true }).click()
      assert.equal(await page.getByText('Saved copy:', { exact: false }).count(), 0)
      await page.evaluate(() => { window.fixture.cancel = false; window.fixture.fail = true })
      await page.getByRole('button', { name: 'Save a copy…', exact: true }).click()
      await page.getByText('The copy could not be saved. Choose another location and try again.', { exact: true }).waitFor()
      await page.locator('[data-document-reading-column="true"]').waitFor()
      await page.evaluate(() => { window.fixture.fail = false })
      await page.getByRole('button', { name: 'Save a copy…', exact: true }).click()
      await page.getByText('Saved copy: C:/project/Plan.md', { exact: true }).waitFor()
    })
  } finally {
    await browser?.close()
    await server.close()
  }
})
