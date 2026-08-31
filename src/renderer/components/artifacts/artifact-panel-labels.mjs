import { formatDateTime } from '../../i18n/formatters.mjs'

export function sourceLabel(t, source) {
  if (source === 'baseline') return t('artifacts.revisionSource.baseline', { defaultValue: 'baseline' })
  if (source === 'manual_rollback') return t('artifacts.revisionSource.rollback', { defaultValue: 'rollback' })
  if (source === 'ai_suggestion') return t('artifacts.revisionSource.suggestion', { defaultValue: 'suggestion' })
  return t('artifacts.revisionSource.aiWrite', { defaultValue: 'AI write' })
}

export function revisionProvenanceLabel(t, revision, locale) {
  const threadTitle = String(revision?.origin_thread_title || revision?.origin_thread_id || '').trim()
  if (!threadTitle) return ''
  if (revision?.origin_thread_state === 'deleted') {
    return t('artifacts.revisionOrigin.deletedThread', {
      defaultValue: 'Deleted thread {{threadTitle}} · {{date}}',
      threadTitle,
      date: formatDateTime(revision.origin_thread_deleted_at, { locale, fallback: '-', dateStyle: 'medium' }),
    })
  }
  return t('artifacts.revisionOrigin.thread', { defaultValue: 'Thread {{threadTitle}}', threadTitle })
}
