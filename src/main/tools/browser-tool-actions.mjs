import fs from 'node:fs/promises'
import path from 'node:path'

import { parseAndValidateHttpUrl } from '../utils/ssrf-guard.mjs'
import {
  buildDomAccessibilitySnapshot,
  buildDomInspectionSnapshot,
  normalizeBrowserElementSummary,
  normalizeBrowserPageInspection,
} from './browser-tool-inspect.mjs'
import {
  attachBrowserDiagnosticsToPage,
  formatConsoleDiagnostics,
  formatNetworkDiagnostics,
} from './browser-tool-diagnostics.mjs'
import { throwBrowserActionFailure } from './browser-tool-failures.mjs'

const INSPECT_ELEMENT_LIMIT = 100
const FIND_ELEMENT_LIMIT = 50
const LIST_OPTIONS_LIMIT = 100
const DIAGNOSTIC_LIMIT = 100

export function createBrowserActionHandlers({
  clipText,
  constants,
  closeBrowserTool,
  closeSession,
  getExistingSession,
  getRecordingDir,
  getScreenshotDir,
  getSessionKey,
  ensureDirectory,
  ensureSession,
  ensureSessionPage,
  refreshSessionTarget,
  assertBrowserRuntimeAllowed,
  buildBrowserNavigationPolicy,
  evaluateBrowserNavigationRequestPolicy,
  withSessionNavigationPolicy,
} = {}) {
  const {
    VIEWPORT_WIDTH,
    VIEWPORT_HEIGHT,
    NAVIGATION_TIMEOUT_MS,
    JS_EXECUTION_TIMEOUT_MS,
    ELEMENT_TIMEOUT_MS,
    MAX_TEXT_CHARS,
    SCREENSHOT_JPEG_QUALITY,
  } = constants

  function requireSelector(input = {}, action = '') {
    const selector = String(input?.selector || '').trim()
    if (!selector) throw new Error(`selector is required for the ${action} action.`)
    return selector
  }

  function normalizeExecuteJsSource(code = '') {
    const source = String(code || '').trim()
    if (!source) return ''
    if (/^return\b/.test(source)) {
      return `(() => {\n${source}\n})()`
    }
    return source
  }

  function normalizeLimit(value, max, defaultValue = max) {
    return Math.min(max, Math.max(1, Number(value) || defaultValue))
  }

  function firstCssSelector(element = {}) {
    const selector = (Array.isArray(element.selectors) ? element.selectors : [])
      .find((candidate) => candidate?.selector)
    return selector ? String(selector.selector || '').trim() : ''
  }

  function formatElementSummary(element = {}) {
    const parts = [`${Number(element.index) + 1}. <${element.tag || 'element'}>`]
    if (element.role) parts.push(`role=${element.role}`)
    if (element.name) parts.push(`name="${element.name}"`)
    if (element.placeholder) parts.push(`placeholder="${element.placeholder}"`)
    if (element.value) parts.push(`value="${element.value}"`)
    if (element.disabled) parts.push('disabled')
    if (element.hidden) parts.push('hidden')
    const selector = firstCssSelector(element)
    if (selector) parts.push(`selector=${selector}`)
    if (Array.isArray(element.suggestedActions) && element.suggestedActions.length > 0) {
      parts.push(`actions=${element.suggestedActions.join(',')}`)
    }
    const lines = [parts.join(' ')]
    if (element.text && element.text !== element.name) lines.push(`   text: ${element.text}`)
    const selectorHints = (Array.isArray(element.selectors) ? element.selectors : [])
      .map((candidate) => candidate.selector || (candidate.role || candidate.name ? `role=${candidate.role || '*'} name=${candidate.name || '*'}` : ''))
      .filter(Boolean)
      .slice(0, 4)
    if (selectorHints.length > 0) lines.push(`   candidates: ${selectorHints.join(' | ')}`)
    return lines.join('\n')
  }

  function formatInspectionResult(inspection = {}, { heading = 'Browser inspection' } = {}) {
    const lines = [
      heading,
      `URL: ${inspection.url || '(unknown)'}`,
      `Title: ${inspection.title || '(untitled)'}`,
      `Elements returned: ${inspection.elements.length} of ${inspection.elementCount}`,
    ]
    if (inspection.elements.length === 0) {
      lines.push('No matching elements found.')
    } else {
      lines.push('', ...inspection.elements.map(formatElementSummary))
    }
    return clipText(lines.join('\n'), MAX_TEXT_CHARS)
  }

  async function actionLaunch(_projectRoot, input, options = {}) {
    const session = await ensureSession(options, {
      headless: input?.headless === true,
      projectRoot: options.projectRoot,
      userDataPath: options.userDataPath,
      browserRoot: options.browserRoot,
      resourcesPath: options.resourcesPath,
      allowSystemBrowserFallback: options.allowSystemBrowserFallback !== false,
      onRuntimeInstall: options.onRuntimeInstall,
    })
    await refreshSessionTarget(session)
    return `Browser launched (${input?.headless === true ? 'headless' : 'visible'} mode, viewport: ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT}).`
  }

  async function actionInspect(_projectRoot, input, options = {}) {
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    const limit = normalizeLimit(input?.limit, INSPECT_ELEMENT_LIMIT)
    const snapshot = await session.page.evaluate(buildDomInspectionSnapshot, {
      selector: String(input?.selector || '').trim(),
      includeHidden: input?.include_hidden === true || input?.includeHidden === true,
      limit: Math.max(limit, 200),
    })
    const inspection = normalizeBrowserPageInspection(snapshot, { limit })
    return formatInspectionResult(inspection)
  }

  async function actionFindElements(_projectRoot, input, options = {}) {
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    const mode = String(input?.mode || 'auto').trim().toLowerCase()
    const query = String(input?.query ?? input?.text ?? input?.name ?? input?.role ?? input?.selector ?? '').trim()
    if (!query) throw new Error('query is required for the find_elements action.')
    const selector = mode === 'selector' ? String(input?.selector || input?.query || '').trim() : ''
    const limit = normalizeLimit(input?.limit, FIND_ELEMENT_LIMIT)
    const snapshot = await session.page.evaluate(buildDomInspectionSnapshot, {
      selector,
      includeHidden: input?.include_hidden === true || input?.includeHidden === true,
      limit: 500,
    })
    const needle = query.toLowerCase()
    const matches = (Array.isArray(snapshot.elements) ? snapshot.elements : [])
      .filter((element) => {
        if (mode === 'selector') return true
        const fields = {
          text: [element.text, element.textContent, element.innerText],
          role: [element.role],
          label: [element.name, element.label, element.ariaLabel, element.attributes?.['aria-label']],
          name: [element.name],
          placeholder: [element.placeholder, element.attributes?.placeholder],
          title: [element.title, element.attributes?.title],
          auto: [
            element.text,
            element.textContent,
            element.innerText,
            element.role,
            element.name,
            element.label,
            element.ariaLabel,
            element.placeholder,
            element.title,
            element.value,
          ],
        }
        const haystack = fields[mode] || fields.auto
        return haystack.some((value) => String(value || '').toLowerCase().includes(needle))
      })
    const inspection = normalizeBrowserPageInspection({
      ...snapshot,
      elements: matches,
    }, { limit })
    return formatInspectionResult(inspection, { heading: `Browser element matches for "${query}"` })
  }

  async function actionListOptions(_projectRoot, input, options = {}) {
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    let selector = String(input?.selector || '').trim()
    if (!selector && input?.element_index !== undefined) {
      const elementIndex = Number(input.element_index)
      const snapshot = await session.page.evaluate(buildDomInspectionSnapshot, { includeHidden: true, limit: 500 })
      const rawElement = (Array.isArray(snapshot.elements) ? snapshot.elements : []).find((entry) => Number(entry?.index) === elementIndex)
      if (!rawElement) throw new Error(`No inspected element found for element_index ${input.element_index}.`)
      const element = normalizeBrowserElementSummary(rawElement, elementIndex)
      if (element.tag !== 'select') throw new Error(`Element ${input.element_index} is <${element.tag || 'unknown'}>, not <select>.`)
      selector = firstCssSelector(element)
      if (!selector) throw new Error(`Element ${input.element_index} does not have a usable CSS selector. Re-run inspect with a selector or use the select element's selector directly.`)
    }
    if (!selector) throw new Error('selector or element_index is required for the list_options action.')
    const limit = normalizeLimit(input?.limit, LIST_OPTIONS_LIMIT)
    const result = await session.page.evaluate(({ sel, max }) => {
      const select = document.querySelector(sel)
      if (!select) return { found: false, tag: '', options: [] }
      if (!(select instanceof HTMLSelectElement)) {
        return { found: true, tag: select.tagName.toLowerCase(), options: [] }
      }
      return {
        found: true,
        tag: 'select',
        multiple: select.multiple === true,
        options: Array.from(select.options).slice(0, max).map((option, index) => ({
          index,
          value: option.value,
          label: option.label || option.textContent || '',
          disabled: option.disabled === true,
          selected: option.selected === true,
        })),
        total: select.options.length,
      }
    }, { sel: selector, max: limit })
    if (!result?.found) throw new Error(`No element matches selector "${selector}".`)
    if (result.tag !== 'select') throw new Error(`Selector "${selector}" matches <${result.tag || 'unknown'}>, not <select>.`)
    const optionsList = Array.isArray(result.options) ? result.options : []
    const lines = [
      `Options for ${selector}${result.multiple ? ' (multiple)' : ''}`,
      `Options returned: ${optionsList.length} of ${Number(result.total || optionsList.length)}`,
      ...optionsList.map((option) => `${option.index + 1}. value=${JSON.stringify(String(option.value ?? ''))} label=${JSON.stringify(String(option.label || option.value || ''))}${option.disabled ? ' disabled' : ''}${option.selected ? ' selected' : ''}`),
    ]
    return clipText(lines.join('\n'), MAX_TEXT_CHARS)
  }

  async function actionConsoleMessages(_projectRoot, input, options = {}) {
    const session = await getExistingSession(options)
    if (!session) return 'No active browser session.'
    return formatConsoleDiagnostics(session, {
      level: input?.level,
      limit: normalizeLimit(input?.limit, DIAGNOSTIC_LIMIT),
    })
  }

  async function actionNetworkErrors(_projectRoot, input, options = {}) {
    const session = await getExistingSession(options)
    if (!session) return 'No active browser session.'
    return formatNetworkDiagnostics(session, {
      status: input?.status,
      type: input?.type || input?.resource_type,
      limit: normalizeLimit(input?.limit, DIAGNOSTIC_LIMIT),
    })
  }

  async function actionNavigate(_projectRoot, input, options = {}) {
    const url = String(input?.url || '').trim()
    if (!url) throw new Error('url is required for the navigate action.')
    const approvalContext = await assertBrowserRuntimeAllowed(input, options)
    const session = await ensureSessionPage(options, {
      projectRoot: options.projectRoot,
    })
    const parsed = parseAndValidateHttpUrl(url)
    await withSessionNavigationPolicy(session, buildBrowserNavigationPolicy(approvalContext), async () => {
      try {
        await session.page.goto(parsed.toString(), {
          waitUntil: 'domcontentloaded',
          timeout: NAVIGATION_TIMEOUT_MS,
        })
      } catch (error) {
        if (session.lastNavigationBlock?.message) {
          throw new Error(session.lastNavigationBlock.message)
        }
        throw error
      }
    })
    await refreshSessionTarget(session)
    const finalDecision = await evaluateBrowserNavigationRequestPolicy(
      buildBrowserNavigationPolicy(approvalContext),
      session.page.url(),
    )
    if (!finalDecision.allowed) {
      throw new Error(String(finalDecision.message || 'Blocked browser navigation target after load.'))
    }
    const title = await session.page.title().catch(() => '')
    return `Navigated to: ${session.page.url()}${title ? `\nTitle: ${title}` : ''}`
  }

  async function actionScreenshot(_projectRoot, _input, options = {}) {
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    const buffer = await session.page.screenshot({
      type: 'jpeg',
      quality: SCREENSHOT_JPEG_QUALITY,
      fullPage: false,
    })
    const dir = await ensureDirectory(getScreenshotDir())
    const filename = `screenshot-${Date.now()}.jpg`
    const filepath = path.join(dir, filename)
    await fs.writeFile(filepath, buffer)
    return {
      __browserScreenshot: true,
      result: `Screenshot captured (${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT}, JPEG ${SCREENSHOT_JPEG_QUALITY}% quality, ${Math.round(buffer.length / 1024)}KB). Saved to: ${filepath}`,
      screenshotBase64: buffer.toString('base64'),
      mediaType: 'image/jpeg',
      filepath,
    }
  }

  async function actionExecuteJs(_projectRoot, input, options = {}) {
    const code = normalizeExecuteJsSource(input?.code)
    if (!code) throw new Error('code is required for the execute_js action.')
    await assertBrowserRuntimeAllowed(input, options)
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    const result = await Promise.race([
      session.page.evaluate((source) => globalThis.eval(source), code),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('JavaScript execution timed out.')), JS_EXECUTION_TIMEOUT_MS)
      }),
    ])
    if (result === undefined) return 'undefined'
    if (result === null) return 'null'
    if (typeof result === 'string') return result
    try {
      return JSON.stringify(result, null, 2)
    } catch {
      return String(result)
    }
  }

  async function actionClick(_projectRoot, input, options = {}) {
    const selector = requireSelector(input, 'click')
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    try {
      const tagName = typeof session.page.$eval === 'function'
        ? await session.page.$eval(selector, (element) => element.tagName).catch(() => '')
        : ''
      if (String(tagName || '').toLowerCase() === 'option') {
        throw new Error('Cannot click native <option> elements directly.')
      }
      await session.page.click(selector, { timeout: ELEMENT_TIMEOUT_MS })
      await refreshSessionTarget(session)
      return `Clicked element: ${selector}`
    } catch (error) {
      await throwBrowserActionFailure(error, {
        action: 'click',
        input: { ...input, selector },
        page: session.page,
      })
    }
  }

  async function actionType(_projectRoot, input, options = {}) {
    const selector = requireSelector(input, 'type')
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    const text = String(input?.text ?? '')
    try {
      await session.page.fill(selector, text, { timeout: ELEMENT_TIMEOUT_MS })
      await refreshSessionTarget(session)
      return `Typed ${text.length} characters into: ${selector}`
    } catch (error) {
      await throwBrowserActionFailure(error, {
        action: 'type',
        input: { ...input, selector },
        page: session.page,
      })
    }
  }

  async function actionReadText(_projectRoot, input, options = {}) {
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    const selector = String(input?.selector || '').trim()
    let text = ''
    if (selector) {
      text = await session.page.textContent(selector, { timeout: ELEMENT_TIMEOUT_MS })
    } else {
      text = await session.page.evaluate(() => document.body?.innerText || '')
    }
    return clipText(text)
  }

  async function actionClose(_projectRoot, _input, options = {}) {
    const videoPath = await closeBrowserTool(options)
    return videoPath ? `Browser closed. Video recording saved to: ${videoPath}` : 'Browser closed.'
  }

  async function actionScroll(_projectRoot, input, options = {}) {
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    const selector = String(input?.selector || '').trim()
    const direction = String(input?.direction || 'down').trim().toLowerCase() === 'up' ? 'up' : 'down'
    const amount = Math.max(0, Number(input?.amount) || 500)
    if (selector) {
      await session.page.evaluate(
        (sel) => { document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
        selector,
      )
      return `Scrolled element "${selector}" into view.`
    }
    const delta = direction === 'up' ? -amount : amount
    await session.page.evaluate((value) => window.scrollBy(0, value), delta)
    const currentY = await session.page.evaluate(() => window.scrollY)
    return `Scrolled ${direction} by ${amount}px. Current scroll position: ${currentY}px.`
  }

  async function actionWaitFor(_projectRoot, input, options = {}) {
    const selector = requireSelector(input, 'wait_for')
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    const timeoutMs = Math.min(30_000, Math.max(1000, Number(input?.timeout_ms) || ELEMENT_TIMEOUT_MS))
    try {
      await session.page.waitForSelector(selector, { state: 'visible', timeout: timeoutMs })
      return `Element "${selector}" is now visible.`
    } catch (error) {
      await throwBrowserActionFailure(error, {
        action: 'wait_for',
        input: { ...input, selector },
        page: session.page,
      })
    }
  }

  async function actionGetPageInfo(_projectRoot, _input, options = {}) {
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    const info = await session.page.evaluate(() => {
      const metas = {}
      for (const meta of document.querySelectorAll('meta[name], meta[property]')) {
        const key = meta.getAttribute('name') || meta.getAttribute('property') || ''
        const content = meta.getAttribute('content') || ''
        if (key && content) metas[key] = content
      }
      return {
        url: window.location.href,
        title: document.title,
        metas,
        bodyLength: document.body?.innerText?.length || 0,
      }
    })
    const lines = [`URL: ${info.url}`, `Title: ${info.title}`]
    for (const [key, value] of Object.entries(info.metas || {}).slice(0, 20)) {
      lines.push(`${key}: ${value}`)
    }
    lines.push(`Body text length: ${Number(info.bodyLength || 0)} chars`)
    return lines.join('\n')
  }

  async function actionSelectOption(_projectRoot, input, options = {}) {
    const selector = requireSelector(input, 'select_option')
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    try {
      if (input?.value !== undefined) {
        await session.page.selectOption(selector, { value: String(input.value) }, { timeout: ELEMENT_TIMEOUT_MS })
        return `Selected option with value "${input.value}" in: ${selector}`
      }
      if (input?.label !== undefined) {
        await session.page.selectOption(selector, { label: String(input.label) }, { timeout: ELEMENT_TIMEOUT_MS })
        return `Selected option with label "${input.label}" in: ${selector}`
      }
      throw new Error('Either value or label is required for the select_option action.')
    } catch (error) {
      await throwBrowserActionFailure(error, {
        action: 'select_option',
        input: { ...input, selector },
        page: session.page,
      })
    }
  }

  async function actionHover(_projectRoot, input, options = {}) {
    const selector = requireSelector(input, 'hover')
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    try {
      await session.page.hover(selector, { timeout: ELEMENT_TIMEOUT_MS })
      return `Hovered over element: ${selector}`
    } catch (error) {
      await throwBrowserActionFailure(error, {
        action: 'hover',
        input: { ...input, selector },
        page: session.page,
      })
    }
  }

  async function actionStartRecording(projectRoot, _input, options = {}) {
    const key = getSessionKey(options)
    const previousSession = await getExistingSession(options)
    const previousUrl = String(previousSession?.currentPageUrl || '').trim()
    await closeSession(key)
    await ensureSession(options, {
      projectRoot,
      recordVideo: true,
    })
    const session = await getExistingSession(options)
    if (previousUrl && previousUrl !== 'about:blank') {
      try {
        await session.page.goto(previousUrl, {
          waitUntil: 'domcontentloaded',
          timeout: NAVIGATION_TIMEOUT_MS,
        })
        await refreshSessionTarget(session)
      } catch {
        // Best-effort restore only; recording still starts even if navigation cannot be restored.
      }
    }
    return `Video recording started. Videos will be saved to: ${String(session?.recordingDir || getRecordingDir(projectRoot))}`
  }

  async function actionStopRecording(_projectRoot, _input, options = {}) {
    const session = await getExistingSession(options)
    if (!session?.isRecording) return 'No active recording to stop.'
    const page = session.page
    let videoPath = null
    const previousUrl = String(session.currentPageUrl || page?.url?.() || '').trim()
    if (page) {
      const video = page.video()
      if (video) {
        await page.close().catch(() => {})
        videoPath = await video.path().catch(() => null)
        session.page = await session.context.newPage()
        attachBrowserDiagnosticsToPage(session, session.page)
        session.isRecording = false
        if (previousUrl && previousUrl !== 'about:blank') {
          try {
            await session.page.goto(previousUrl, {
              waitUntil: 'domcontentloaded',
              timeout: NAVIGATION_TIMEOUT_MS,
            })
          } catch {
            // Best-effort restore only; stopping recording should still succeed.
          }
        }
        await refreshSessionTarget(session)
      }
    }
    return videoPath
      ? `Recording stopped. Video saved to: ${videoPath}`
      : 'Recording stopped (no video file was generated).'
  }

  async function actionAccessibilityTree(_projectRoot, _input, options = {}) {
    const session = await ensureSessionPage(options, { projectRoot: options.projectRoot })
    let snapshot = null
    if (typeof session.page.accessibility?.snapshot === 'function') {
      snapshot = await session.page.accessibility.snapshot()
    } else {
      snapshot = await session.page.evaluate(buildDomAccessibilitySnapshot).catch(() => null)
    }
    if (!snapshot) return '(empty accessibility tree)'

    const lines = []
    const walk = (node, depth = 0) => {
      if (!node || lines.length >= 200) return
      const indent = '  '.repeat(depth)
      const parts = [`[${String(node.role || 'unknown')}]`]
      if (node.name) parts.push(String(node.name))
      if (node.value && node.value !== node.name) parts.push(`= ${String(node.value)}`)
      if (node.disabled === true) parts.push('(disabled)')
      if (node.checked === true) parts.push('(checked)')
      lines.push(`${indent}${parts.join(' ')}`)
      const children = Array.isArray(node.children) ? node.children : []
      for (const child of children) {
        walk(child, depth + 1)
        if (lines.length >= 200) break
      }
    }
    walk(snapshot, 0)
    return clipText(lines.join('\n'), MAX_TEXT_CHARS, '[Accessibility tree truncated - exceeded 12,000 character limit]')
  }

  return {
    launch: actionLaunch,
    inspect: actionInspect,
    find_elements: actionFindElements,
    list_options: actionListOptions,
    console_messages: actionConsoleMessages,
    network_errors: actionNetworkErrors,
    navigate: actionNavigate,
    screenshot: actionScreenshot,
    execute_js: actionExecuteJs,
    click: actionClick,
    type: actionType,
    read_text: actionReadText,
    close: actionClose,
    scroll: actionScroll,
    wait_for: actionWaitFor,
    get_page_info: actionGetPageInfo,
    select_option: actionSelectOption,
    hover: actionHover,
    start_recording: actionStartRecording,
    stop_recording: actionStopRecording,
    accessibility_tree: actionAccessibilityTree,
  }
}
