import React from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import PromptSurface from '../ui/PromptSurface.jsx'

export function toMcpDateTimeLocalValue(value = '') {
  const date = new Date(String(value || ''))
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (part) => String(part).padStart(2, '0')
  const milliseconds = date.getMilliseconds()
  const seconds = `${pad(date.getSeconds())}${milliseconds ? `.${String(milliseconds).padStart(3, '0')}` : ''}`
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${seconds}`,
  ].join('T')
}

export function serializeMcpTextValue(field = {}, value = '') {
  const normalized = String(value ?? '')
  if (!normalized || field.format !== 'date-time') return normalized
  const date = new Date(normalized)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function initialValueForField(field = {}) {
  if (!Object.hasOwn(field, 'defaultValue')) return field.kind === 'multi_select' ? [] : ''
  if (field.kind === 'text' && field.format === 'date-time') {
    return toMcpDateTimeLocalValue(field.defaultValue)
  }
  return field.defaultValue
}

function buildInitialValues(fields = []) {
  return Object.fromEntries(fields.map((field) => [
    field.name,
    initialValueForField(field),
  ]))
}

function buildSubmission(fields = [], values = {}) {
  const content = {}
  for (const field of fields) {
    const value = values[field.name]
    if (field.kind === 'text') {
      const serialized = serializeMcpTextValue(field, value)
      if ((serialized !== '' || field.required) && serialized !== null) content[field.name] = serialized
    } else if (field.kind === 'single_select') {
      if (value !== '' || field.required) content[field.name] = String(value ?? '')
    } else if (field.kind === 'number' || field.kind === 'integer') {
      if (value !== '') content[field.name] = Number(value)
    } else if (field.kind === 'boolean') {
      if (value !== '') content[field.name] = value === true || value === 'true'
    } else if (field.kind === 'multi_select') {
      if ((Array.isArray(value) && value.length > 0) || field.required) {
        content[field.name] = Array.isArray(value) ? value : []
      }
    }
  }
  return content
}

function isFieldValid(field, value) {
  if (!field.required && (value === '' || value === undefined || (Array.isArray(value) && value.length === 0))) {
    return true
  }
  if (field.kind === 'text') {
    const serialized = serializeMcpTextValue(field, value)
    return serialized !== null
      && serialized.length >= field.minLength
      && serialized.length <= field.maxLength
  }
  if (field.kind === 'number' || field.kind === 'integer') {
    const number = Number(value)
    return value !== ''
      && Number.isFinite(number)
      && (field.kind !== 'integer' || Number.isSafeInteger(number))
      && (field.minimum === undefined || number >= field.minimum)
      && (field.maximum === undefined || number <= field.maximum)
  }
  if (field.kind === 'boolean') return value === true || value === false || value === 'true' || value === 'false'
  if (field.kind === 'single_select') return field.options.some((option) => option.value === value)
  if (field.kind === 'multi_select') {
    return Array.isArray(value)
      && value.length >= field.minItems
      && value.length <= field.maxItems
  }
  return false
}

function inputTypeForFormat(format = '') {
  if (format === 'email') return 'email'
  if (format === 'uri') return 'url'
  if (format === 'date') return 'date'
  if (format === 'date-time') return 'datetime-local'
  return 'text'
}

function FieldShell({ field, group = false, children }) {
  const labelId = `mcp-elicitation-${field.name}-label`
  return (
    <div className="space-y-1.5">
      {group ? (
        <p id={labelId} className="text-xs font-medium text-text-primary">
          {field.title || field.name}
          {field.required ? <span aria-hidden="true" className="ml-1 text-warning-soft">*</span> : null}
        </p>
      ) : (
        <label className="block text-xs font-medium text-text-primary" htmlFor={`mcp-elicitation-${field.name}`}>
          {field.title || field.name}
          {field.required ? <span aria-hidden="true" className="ml-1 text-warning-soft">*</span> : null}
        </label>
      )}
      {field.description ? <p className="text-[11px] leading-5 text-text-tertiary">{field.description}</p> : null}
      {group ? <div role="group" aria-labelledby={labelId}>{children}</div> : children}
    </div>
  )
}

export default function McpElicitationCard({
  request = null,
  error = '',
  disabled = false,
  onRespond = async () => {},
}) {
  const { t } = useRendererTranslation(['core'])
  const fields = React.useMemo(
    () => (Array.isArray(request?.fields) ? request.fields : []),
    [request?.fields],
  )
  const resetKey = JSON.stringify({ threadId: request?.threadId, serverName: request?.serverName, fields })
  const [values, setValues] = React.useState(() => buildInitialValues(fields))
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    setValues(buildInitialValues(fields))
    setSubmitting(false)
  }, [fields, resetKey])

  const requestDisabled = disabled || submitting || request?.responsePending === true
  const canSubmit = !requestDisabled && fields.every((field) => isFieldValid(field, values[field.name]))
  const setValue = (name, value) => setValues((current) => ({ ...current, [name]: value }))

  const respond = async (action) => {
    if (requestDisabled || (action === 'accept' && !canSubmit)) return
    setSubmitting(true)
    try {
      await onRespond(action, action === 'accept' ? buildSubmission(fields, values) : null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PromptSurface tone="warning" className="mb-2 space-y-3" data-ui="chat-mcp-elicitation-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-warning-soft">
            {t('core:chat.questionUser.clarificationNeeded', { defaultValue: 'Clarification Needed' })}
          </p>
          <p className="mt-1 text-sm font-semibold text-text-primary">{request?.serverName}</p>
        </div>
        <span className="shrink-0 rounded-md border border-warning-border/60 bg-surface px-2 py-1 text-[10px] font-medium uppercase text-warning-soft">
          {t('core:chat.questionUser.waitingOnYou', { defaultValue: 'Waiting On You' })}
        </span>
      </div>

      <p className="text-sm leading-6 text-text-primary">{request?.message}</p>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void respond('accept')
        }}
      >
        {fields.map((field) => (
          <FieldShell key={field.name} field={field} group={field.kind === 'multi_select'}>
            {field.kind === 'text' ? (
              <input
                id={`mcp-elicitation-${field.name}`}
                type={inputTypeForFormat(field.format)}
                value={values[field.name] ?? ''}
                minLength={field.minLength}
                maxLength={field.maxLength}
                step={field.format === 'date-time' ? 'any' : undefined}
                required={field.required}
                disabled={requestDisabled}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setValue(field.name, event.target.value)}
                className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-strong disabled:opacity-60"
              />
            ) : null}
            {field.kind === 'number' || field.kind === 'integer' ? (
              <input
                id={`mcp-elicitation-${field.name}`}
                type="number"
                value={values[field.name] ?? ''}
                min={field.minimum}
                max={field.maximum}
                step={field.kind === 'integer' ? 1 : 'any'}
                required={field.required}
                disabled={requestDisabled}
                onChange={(event) => setValue(field.name, event.target.value)}
                className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-strong disabled:opacity-60"
              />
            ) : null}
            {field.kind === 'boolean' || field.kind === 'single_select' ? (
              <select
                id={`mcp-elicitation-${field.name}`}
                value={values[field.name] ?? ''}
                required={field.required}
                disabled={requestDisabled}
                onChange={(event) => setValue(field.name, event.target.value)}
                className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-strong disabled:opacity-60"
              >
                <option value="" disabled={field.required}>—</option>
                {field.kind === 'boolean' ? (
                  <>
                    <option value="true">{t('core:common.yes', { defaultValue: 'Yes' })}</option>
                    <option value="false">{t('core:common.no', { defaultValue: 'No' })}</option>
                  </>
                ) : field.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.title}</option>
                ))}
              </select>
            ) : null}
            {field.kind === 'multi_select' ? (
              <div className="grid gap-1.5">
                {field.options.map((option) => {
                  const selected = Array.isArray(values[field.name]) && values[field.name].includes(option.value)
                  return (
                    <label key={option.value} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-panel-alt">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={requestDisabled}
                        onChange={() => {
                          const current = Array.isArray(values[field.name]) ? values[field.name] : []
                          setValue(field.name, selected
                            ? current.filter((value) => value !== option.value)
                            : [...current, option.value])
                        }}
                      />
                      <span>{option.title}</span>
                    </label>
                  )
                })}
              </div>
            ) : null}
          </FieldShell>
        ))}

        {error ? <p role="alert" className="text-xs text-danger-soft">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <ActionButton type="button" disabled={requestDisabled} onClick={() => void respond('decline')}>
            {t('core:common.cancel', { defaultValue: 'Cancel' })}
          </ActionButton>
          <ActionButton type="submit" variant="primary" size="md" disabled={!canSubmit}>
            {submitting
              ? t('core:chat.questionUser.sending', { defaultValue: 'Sending...' })
              : t('core:chat.questionUser.sendAnswer', { defaultValue: 'Send Answer' })}
          </ActionButton>
        </div>
      </form>
    </PromptSurface>
  )
}
