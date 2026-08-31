import {
  buildDomInspectionSnapshot,
  normalizeBrowserElementSummary,
} from './browser-tool-inspect.mjs'

const OPTION_SUMMARY_LIMIT = 20
const SELECTOR_HINT_LIMIT = 5

function messageFor(error) {
  return String(error?.message || error || '').trim()
}

function firstCssSelector(element = {}) {
  const selector = (Array.isArray(element.selectors) ? element.selectors : [])
    .find((candidate) => candidate?.selector)
  return selector ? String(selector.selector || '').trim() : ''
}

function formatSelectOption(option = {}) {
  const value = String(option?.value ?? '')
  const label = String(option?.label || option?.text || '').trim()
  const disabled = option?.disabled === true ? ' disabled' : ''
  const selected = option?.selected === true ? ' selected' : ''
  if (label && label !== value) return `"${value}" (${label}${disabled}${selected})`
  return `"${value}"${disabled}${selected}`
}

async function collectSelectOptionsSummary(page, selector = '') {
  if (!page || typeof page.evaluate !== 'function' || !selector) return ''
  const options = await page.evaluate(({ sel, max }) => {
    const select = document.querySelector(sel)
    if (!(select instanceof HTMLSelectElement)) return []
    return Array.from(select.options).slice(0, max).map((option) => ({
      value: option.value,
      label: option.label || option.textContent || '',
      disabled: option.disabled,
      selected: option.selected,
    }))
  }, { sel: selector, max: OPTION_SUMMARY_LIMIT }).catch(() => [])
  if (!Array.isArray(options) || options.length === 0) return ''
  return `Available options: ${options.map(formatSelectOption).join(', ')}.`
}

async function collectSelectorHints(page, selector = '') {
  if (!page || typeof page.evaluate !== 'function' || !selector) return []
  const snapshot = await page.evaluate(buildDomInspectionSnapshot, {
    selector,
    includeHidden: true,
    limit: SELECTOR_HINT_LIMIT,
  }).catch(() => null)
  const elements = Array.isArray(snapshot?.elements) ? snapshot.elements : []
  return elements
    .map((element, index) => normalizeBrowserElementSummary(element, index))
    .map((element) => {
      const cssSelector = firstCssSelector(element)
      const label = [
        `<${element.tag || 'element'}>`,
        element.role ? `role=${element.role}` : '',
        element.name ? `name="${element.name}"` : '',
        element.hidden ? 'hidden' : '',
        element.disabled ? 'disabled' : '',
        cssSelector ? `selector=${cssSelector}` : '',
      ].filter(Boolean).join(' ')
      return label
    })
    .filter(Boolean)
}

function classifyBrowserActionFailure({ action = '', input = {}, message = '' } = {}) {
  const normalizedAction = String(action || '').trim().toLowerCase()
  const text = String(message || '')
  const selector = String(input?.selector || '').trim()
  const hasSelectValue = input?.value !== undefined || input?.label !== undefined

  if (/native <option>|<option> elements/i.test(text)) {
    return {
      kind: 'native_option_click',
      what: 'The selector targets a native <option>, which cannot be clicked directly.',
      required: 'select_option must target the parent <select> element.',
      next: 'Run list_options for the parent select, then call select_option with an exact value or label.',
    }
  }
  if (/strict mode violation|resolved to \d+ elements|matches multiple|more than one element/i.test(text)) {
    return {
      kind: 'strict_multiple_matches',
      what: 'The selector matched multiple elements.',
      required: 'Interactive actions need one unique target.',
      next: 'Run inspect or find_elements and use a more specific selector from the candidates.',
    }
  }
  if (normalizedAction === 'select_option' && (!hasSelectValue || /did not find.*option|option.*not found|no option|value.*not found|label.*not found/i.test(text))) {
    return {
      kind: 'missing_select_option',
      what: hasSelectValue
        ? 'The requested select option was not found.'
        : 'The select_option action was missing an option value or label.',
      required: 'select_option needs the parent <select> selector and an exact option value or label.',
      next: 'Run list_options for the selector, then retry select_option with one listed value or label.',
    }
  }
  if (/not an <input>|not a textarea|not editable|not fillable|element is not an input|cannot type text/i.test(text)) {
    return {
      kind: 'non_fillable',
      what: 'The target cannot receive typed text.',
      required: 'The type action needs an editable input, textarea, or contenteditable element.',
      next: 'Run inspect or find_elements and choose an element whose suggested action is type, or use click/select_option for controls.',
    }
  }
  if (/timeout \d+ms exceeded/i.test(text) && /visible|waitforselector|waiting for selector|waiting for locator/i.test(text)) {
    return {
      kind: 'visible_timeout',
      what: 'The selector did not become visible before the action timed out.',
      required: 'The target must exist, be visible, and be ready for interaction.',
      next: 'Run inspect with include_hidden when needed, verify navigation or loading state, then retry with a visible selector.',
    }
  }
  if (/not visible|hidden|detached|not attached|outside of the viewport|element is not stable/i.test(text)) {
    return {
      kind: 'hidden_or_detached',
      what: 'The element was hidden, detached, outside the viewport, or not stable when the action ran.',
      required: 'Interactive actions need a visible, attached, stable element.',
      next: 'Run inspect/find_elements again, scroll the element into view if needed, then retry with a current visible selector.',
    }
  }
  if (selector) return null
  return null
}

export async function buildBrowserActionFailureGuidance(context = {}) {
  const message = messageFor(context.error)
  const classification = classifyBrowserActionFailure({
    action: context.action,
    input: context.input,
    message,
  })
  if (!classification) return null

  const selector = String(context.input?.selector || '').trim()
  const details = []
  if (classification.kind === 'missing_select_option') {
    const optionsSummary = await collectSelectOptionsSummary(context.page, selector)
    if (optionsSummary) details.push(optionsSummary)
  } else {
    const hints = await collectSelectorHints(context.page, selector)
    if (hints.length > 0) details.push(`Candidate selectors: ${hints.join(' | ')}`)
  }

  return [
    message || 'Browser action failed.',
    '',
    'Browser action guidance:',
    `What happened: ${classification.what}`,
    `Required scenario: ${classification.required}`,
    `Likely next action: ${classification.next}`,
    ...details,
  ].filter((line) => line !== '').join('\n')
}

export async function throwBrowserActionFailure(error, context = {}) {
  const guidedMessage = await buildBrowserActionFailureGuidance({ ...context, error })
  if (guidedMessage) throw new Error(guidedMessage)
  throw error
}
