import React from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import PromptSurface from '../ui/PromptSurface.jsx'

function isCustomOptionLabel(label = '') {
  const normalized = String(label || '').trim().toLowerCase()
  return normalized.startsWith('something else') || normalized.startsWith('other')
}

function SendEnterChip() {
  return (
    <span
      data-ui="approval-shortcut-enter"
      aria-hidden="true"
      className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-surface px-1 text-text-secondary"
    >
      <svg
        viewBox="0 0 12 12"
        className="block h-[11px] w-[11px] -translate-x-px"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9.5 2.5v4H3.75" />
        <path d="M5.5 4.75 3.5 6.5l2 1.75" />
      </svg>
    </span>
  )
}

export function shouldSubmitQuestionAnswer(event = {}) {
  if (event.key !== 'Enter') return false
  if (event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229) return false
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false
  return true
}

export default function QuestionUserCard({
  request = null,
  disabled = false,
  onSubmitAnswer = () => {},
}) {
  const { t } = useRendererTranslation(['core'])
  const options = Array.isArray(request?.options) ? request.options : []
  const recommendedOption = options.find((option) => option?.recommended) || null
  const question = String(request?.question || '').trim()
  const header = String(request?.header || '').trim()
  const hasHeader = Boolean(header)
  const showQuestionBody = Boolean(question)
  const requestResetKey = JSON.stringify({
    header,
    question,
    options: options.map((option) => ({
      id: String(option?.id || ''),
      label: String(option?.label || ''),
      description: String(option?.description || ''),
      recommended: option?.recommended === true,
    })),
  })

  const [draftAnswer, setDraftAnswer] = React.useState(() => String(recommendedOption?.label || ''))
  const [selectedOptionId, setSelectedOptionId] = React.useState(() => String(recommendedOption?.id || ''))
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const requestDisabled = disabled || request?.responsePending === true || isSubmitting

  React.useEffect(() => {
    setDraftAnswer(String(recommendedOption?.label || ''))
    setSelectedOptionId(String(recommendedOption?.id || ''))
    setIsSubmitting(false)
  }, [requestResetKey, recommendedOption])

  const canSubmit = !requestDisabled && String(draftAnswer || '').trim().length > 0
  const sending = request?.responsePending === true || isSubmitting

  const handleOptionSelect = React.useCallback((option) => {
    const nextId = String(option?.id || '').trim()
    const nextLabel = String(option?.label || '').trim()
    setSelectedOptionId(nextId)
    setDraftAnswer(isCustomOptionLabel(nextLabel) ? '' : nextLabel)
  }, [])

  const handleSubmit = React.useCallback(async () => {
    const answer = String(draftAnswer || '').trim()
    if (!answer || requestDisabled || isSubmitting) return
    setIsSubmitting(true)
    try {
      await Promise.resolve(onSubmitAnswer(answer, {
        selectedOptionId,
        question,
        header,
      }))
    } finally {
      setIsSubmitting(false)
    }
  }, [draftAnswer, header, isSubmitting, onSubmitAnswer, question, requestDisabled, selectedOptionId])

  const handleTextareaKeyDown = React.useCallback((event) => {
    if (!shouldSubmitQuestionAnswer(event)) return
    event.preventDefault()
    handleSubmit()
  }, [handleSubmit])

  return (
    <PromptSurface
      tone="warning"
      className="mb-2 space-y-2.5"
      data-ui="chat-question-user-card"
    >
      {hasHeader ? (
        <h2 className="text-xs font-medium leading-tight text-text-primary">
          {header}
        </h2>
      ) : null}

      {showQuestionBody ? (
        <p className={[
          'text-xs font-normal leading-5',
          hasHeader ? 'text-text-secondary' : 'text-text-primary',
        ].join(' ')}
        >
          {question}
        </p>
      ) : null}

      {options.length > 0 && (
        <div className="grid gap-0.5">
          {options.map((option) => {
            const optionId = String(option?.id || '').trim()
            const selected = optionId && optionId === selectedOptionId
            return (
              <button
                key={optionId || option?.label}
                type="button"
                disabled={requestDisabled}
                onClick={() => handleOptionSelect(option)}
                className={[
                  'group rounded-md border-0 px-2.5 py-1.5 text-left transition-colors',
                  selected
                    ? 'bg-surface-panel text-text-primary'
                    : 'bg-transparent text-text-secondary hover:bg-surface-panel hover:text-text-primary',
                  requestDisabled ? 'cursor-not-allowed opacity-60' : '',
                ].join(' ')}
                data-ui="chat-question-user-option"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className={[
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors',
                      selected ? 'bg-accent-soft' : 'bg-text-muted/55 group-hover:bg-accent-muted',
                    ].join(' ')}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs font-normal text-text-primary">{option.label}</span>
                      {option.recommended && (
                        <span className="text-[11px] text-text-tertiary">
                          {t('core:chat.questionUser.recommended', { defaultValue: 'Recommended' })}
                        </span>
                      )}
                    </div>
                    {option.description && (
                      <p className="mt-0.5 text-[11px] leading-4 text-text-secondary">{option.description}</p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-[11px] text-text-tertiary" htmlFor="chat-question-user-answer">
          {t('core:chat.questionUser.yourAnswer', { defaultValue: 'Your answer' })}
        </label>
        <textarea
          id="chat-question-user-answer"
          value={draftAnswer}
          onChange={(event) => setDraftAnswer(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          disabled={requestDisabled}
          rows={2}
          placeholder={t('core:chat.questionUser.answerPlaceholder', { defaultValue: 'Type your answer…' })}
          className="w-full resize-y rounded border-0 bg-surface px-2.5 py-2 text-xs leading-5 text-text-primary outline-none transition-colors placeholder:text-text-muted focus-visible:ring-1 focus-visible:ring-border-strong disabled:cursor-not-allowed disabled:opacity-60"
          data-ui="chat-question-user-answer"
        />
      </div>

      <div className="flex items-center justify-end gap-1 pt-0.5">
        <ActionButton
          variant="ghost"
          size="sm"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="h-7 gap-1.5 border-transparent bg-surface-panel-muted-strong px-2.5 leading-none text-text-primary hover:bg-surface-panel"
          title={t('core:chat.questionUser.sendAnswerTitle', { defaultValue: 'Send answer (Enter)' })}
          data-ui="chat-question-user-submit"
        >
          <span className="leading-none">
            {sending
              ? t('core:chat.questionUser.sending', { defaultValue: 'Sending...' })
              : t('core:chat.questionUser.sendAnswer', { defaultValue: 'Send' })}
          </span>
          {sending ? null : <SendEnterChip />}
        </ActionButton>
      </div>
    </PromptSurface>
  )
}
