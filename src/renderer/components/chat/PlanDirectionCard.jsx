import React from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import PromptSurface from '../ui/PromptSurface.jsx'
import {
  createPlanDirectionAnswer,
  createPlanDirectionDrafts,
  isPlanDirectionDraftComplete,
  resolvePlanDirectionIndex,
} from './plan-direction-card-state.mjs'

const PROFILE_LABEL_KEYS = Object.freeze({
  implementation: 'implementation',
  technical_design: 'technicalDesign',
  investigation: 'investigation',
  deep_implementation: 'deepImplementation',
})

function answerText(answer = null) {
  return String(answer?.text || '').trim()
}

function isInteractiveTarget(target = null) {
  return Boolean(target?.closest?.('textarea, button, details, [role="menu"]'))
}

function QuestionDots({ questions = [], index = 0, onSelect = () => {}, label = '', labelFor = () => '' }) {
  return <div className="flex gap-1" role="group" aria-label={label}>
    {questions.map((item, itemIndex) => <button
      key={item.id}
      type="button"
      onClick={() => onSelect(itemIndex)}
      className={itemIndex === index
        ? 'h-1.5 w-3 rounded bg-accent'
        : 'h-1.5 w-1.5 rounded bg-text-muted/50'}
      aria-label={labelFor(itemIndex)}
      aria-current={itemIndex === index ? 'step' : undefined}
    />)}
  </div>
}

function ProfileMenu({ disabled = false, recommendation = null, onCreatePlan = () => {}, t }) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef(null)
  const menuRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    queueMicrotask(() => menuRef.current?.querySelector('[role="menuitem"]')?.focus())
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const recommendedProfile = String(recommendation?.profile || '').trim()
  return <div ref={containerRef} className="relative">
    <ActionButton
      size="sm"
      disabled={disabled}
      onClick={() => setOpen((value) => !value)}
      aria-haspopup="menu"
      aria-expanded={open}
    >{t('core:chat.planDirection.create')}</ActionButton>
    {open ? <div
      ref={menuRef}
      role="menu"
      aria-label={t('core:chat.planDirection.profileMenu')}
      className="absolute bottom-8 left-0 z-20 w-52 rounded-md bg-surface-panel p-1 shadow-lg"
    >{Object.entries(PROFILE_LABEL_KEYS).map(([id, labelKey]) => <button
      key={id}
      role="menuitem"
      type="button"
      onClick={() => { setOpen(false); onCreatePlan(id) }}
      className="block w-full rounded px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface hover:text-text-primary focus:bg-surface focus:text-text-primary focus:outline-none"
    >
      {t(`core:chat.planDirection.profiles.${labelKey}`)}
      {id === recommendedProfile
        ? <span className="ml-1 text-text-tertiary">· {t('core:chat.planDirection.recommendedShort')}</span>
        : null}
    </button>)}</div> : null}
  </div>
}

export default function PlanDirectionCard({
  plan = null,
  disabled = false,
  error = '',
  onAnswer = () => {},
  onCreatePlan = () => {},
  onChangeDirection = () => {},
  onRetry = () => {},
  onRetryDraft = () => {},
}) {
  const { t } = useRendererTranslation(['core'])
  const direction = plan?.direction && typeof plan.direction === 'object' ? plan.direction : null
  const questions = React.useMemo(
    () => (Array.isArray(direction?.questions) ? direction.questions : []),
    [direction?.questions],
  )
  const stage = String(direction?.stage || '').trim() || (questions.length > 0 ? 'collecting_answers' : 'review')
  const [index, setIndex] = React.useState(0)
  const [drafts, setDrafts] = React.useState(() => createPlanDirectionDrafts(questions))
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [feedback, setFeedback] = React.useState('')
  const pointerStart = React.useRef(null)
  const question = questions[index] || null
  const draft = question ? drafts[question.id] : null

  React.useEffect(() => {
    const next = questions.findIndex((item) => !item?.answer)
    setIndex(next >= 0 ? next : Math.max(0, questions.length - 1))
    setDrafts((current) => createPlanDirectionDrafts(questions, current))
  }, [plan?.revision, questions])

  if (!direction) return null

  const moveQuestion = (offset) => {
    setIndex((current) => resolvePlanDirectionIndex(current, current + offset, questions.length))
  }
  const onKeyDown = (event) => {
    if (stage !== 'collecting_answers' || !question || isInteractiveTarget(event.target)) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveQuestion(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveQuestion(1)
    }
  }
  const onPointerUp = (event) => {
    const start = pointerStart.current
    pointerStart.current = null
    if (!start || isInteractiveTarget(event.target)) return
    const deltaX = Number(event.clientX) - start.x
    const deltaY = Number(event.clientY) - start.y
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY)) return
    moveQuestion(deltaX < 0 ? 1 : -1)
  }
  const setDraft = (next) => {
    if (!question) return
    setDrafts((current) => ({ ...current, [question.id]: next }))
  }

  return <PromptSurface
    tone="decision"
    className="mb-2 space-y-2.5"
    data-ui="chat-plan-direction-card"
    tabIndex={stage === 'collecting_answers' && question ? 0 : undefined}
    onKeyDown={onKeyDown}
    onPointerDown={(event) => { pointerStart.current = { x: Number(event.clientX), y: Number(event.clientY) } }}
    onPointerUp={onPointerUp}
  >
    {stage === 'collecting_answers' && question ? <>
      {question.header ? <h2 className="text-xs font-medium text-text-primary">{question.header}</h2> : null}
      <p className="text-xs leading-5 text-text-secondary">{question.question}</p>
      {question.options?.length > 0 ? <div className="grid gap-1.5">
        {question.options.map((option) => {
          const selected = draft?.kind === 'option' && draft?.optionId === option.id
          return <button
            key={option.id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => setDraft({ kind: 'option', optionId: option.id, text: option.label })}
            className={selected
              ? 'rounded-md bg-surface px-2.5 py-2 text-left text-xs text-text-primary'
              : 'rounded-md px-2.5 py-2 text-left text-xs text-text-secondary hover:bg-surface hover:text-text-primary'}
          >
            <span className="font-medium">{option.label}</span>
            {option.recommended
              ? <span className="ml-1.5 text-[10px] text-text-tertiary">{t('core:chat.planDirection.recommendedShort')}</span>
              : null}
            {option.description ? <span className="mt-0.5 block text-[11px] leading-4 text-text-tertiary">{option.description}</span> : null}
          </button>
        })}
      </div> : null}
      <textarea
        value={draft?.kind === 'custom' ? draft.text : ''}
        onChange={(event) => setDraft({ kind: 'custom', optionId: '', text: event.target.value })}
        disabled={disabled}
        rows={2}
        placeholder={t('core:chat.planDirection.customPlaceholder')}
        aria-label={t('core:chat.planDirection.customAnswer')}
        className="w-full resize-y rounded bg-surface px-2.5 py-2 text-xs text-text-primary outline-none focus-visible:bg-surface-panel-alt"
      />
      <div className="flex items-center justify-between">
        <QuestionDots
          questions={questions}
          index={index}
          onSelect={setIndex}
          label={t('core:chat.planDirection.questionNavigation')}
          labelFor={(itemIndex) => t('core:chat.planDirection.goToQuestion', { count: itemIndex + 1 })}
        />
        <ActionButton
          size="sm"
          disabled={disabled || !isPlanDirectionDraftComplete(draft, question)}
          onClick={() => onAnswer(question.id, createPlanDirectionAnswer(draft, question))}
        >{question.answer ? t('core:chat.planDirection.changeAnswer') : t('core:chat.planDirection.continue')}</ActionButton>
      </div>
    </> : stage === 'synthesizing' ? <>
      <p className="text-xs leading-5 text-text-secondary">
        {direction.synthesis?.status === 'failed'
          ? (direction.synthesis.error || t('core:chat.planDirection.synthesisFailed'))
          : t('core:chat.planDirection.synthesizing')}
      </p>
      <ActionButton size="sm" disabled={disabled} onClick={onRetry}>
        {t('core:chat.planDirection.retry')}
      </ActionButton>
    </> : plan?.lifecycle === 'drafting' ? <>
      <p className="text-xs leading-5 text-text-secondary">{direction.summary}</p>
      <p className="text-[11px] text-text-tertiary">{t('core:chat.planDirection.creating')}</p>
      <ActionButton size="sm" disabled={disabled} onClick={onRetryDraft}>
        {t('core:chat.planDirection.retryDraft')}
      </ActionButton>
    </> : <>
      <p className="text-xs leading-5 text-text-secondary">{direction.summary}</p>
      {questions.some((item) => item.answer) ? <details className="text-[11px] text-text-tertiary">
        <summary className="cursor-pointer select-none">{t('core:chat.planDirection.reviewChoices')}</summary>
        <div className="mt-1.5 space-y-1.5">
          {questions.filter((item) => item.answer).map((item) => <p key={item.id}>
            <span className="font-medium text-text-secondary">{item.header || item.question}</span>
            <span className="block">{answerText(item.answer)}</span>
          </p>)}
        </div>
      </details> : null}
      {direction.recommendation ? <p data-ui="plan-direction-recommendation" className="text-[11px] leading-4 text-text-tertiary">
        <span data-ui="plan-direction-recommendation-label" className="block font-medium text-text-secondary">
          {t('core:chat.planDirection.recommended')}
        </span>
        <span data-ui="plan-direction-recommendation-detail" className="mt-0.5 block">
          {t('core:chat.planDirection.recommendationDetail', {
            profile: PROFILE_LABEL_KEYS[direction.recommendation.profile]
              ? t(`core:chat.planDirection.profiles.${PROFILE_LABEL_KEYS[direction.recommendation.profile]}`)
              : direction.recommendation.profile,
            rationale: direction.recommendation.rationale,
          })}
        </span>
      </p> : null}
      {feedbackOpen ? <div className="space-y-2">
        <textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          rows={2}
          autoFocus
          aria-label={t('core:chat.planDirection.changeFeedback')}
          placeholder={t('core:chat.planDirection.changePlaceholder')}
          className="w-full resize-y rounded bg-surface px-2.5 py-2 text-xs text-text-primary outline-none focus-visible:bg-surface-panel-alt"
        />
        <div className="flex gap-2">
          <ActionButton size="sm" disabled={disabled || !feedback.trim()} onClick={() => onChangeDirection(feedback.trim())}>
            {t('core:chat.planDirection.updateDirection')}
          </ActionButton>
          <ActionButton size="sm" disabled={disabled} onClick={() => { setFeedbackOpen(false); setFeedback('') }}>
            {t('core:common.cancel')}
          </ActionButton>
        </div>
      </div> : <div className="flex items-center gap-2">
        <ActionButton size="sm" disabled={disabled} onClick={() => setFeedbackOpen(true)}>
          {t('core:chat.planDirection.change')}
        </ActionButton>
        <ProfileMenu disabled={disabled} recommendation={direction.recommendation} onCreatePlan={onCreatePlan} t={t} />
      </div>}
    </>}
    {error ? <p className="text-[11px] text-danger-soft" role="status">{error}</p> : null}
  </PromptSurface>
}
