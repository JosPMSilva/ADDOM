export const CHAT_TYPOGRAPHY_TOKEN_KEYS = Object.freeze([
  'proseBodySize',
  'proseBodyLine',
  'proseParagraphGap',
  'proseH1Size',
  'proseH2Size',
  'proseH3Size',
  'proseInlineCodeSize',
  'proseListGap',
  'proseBlockquoteGap',
  'userBodySize',
  'userBodyLine',
  'userAttachmentBadgeSize',
  'userAttachmentTitleSize',
  'userAttachmentMetaSize',
  'errorBodySize',
  'errorBodyLine',
  'planToggleSize',
  'planToggleLine',
  'imagePreviewCloseSize',
  'attachmentModalTitleSize',
  'attachmentModalTitleLine',
  'attachmentModalFileSize',
  'attachmentModalFileLine',
  'attachmentModalBodySize',
  'attachmentModalBodyLine',
  'attachmentModalCloseSize',
  'attachmentModalCancelSize',
  'attachmentModalConfirmSize',
  'execHeaderTitleSize',
  'execHeaderStatusSize',
  'execHeaderMetaSize',
  'execRowLabelSize',
  'execRowLabelLine',
  'execRowDetailSize',
  'execRowDetailLine',
  'execRowToggleSize',
  'execRowToggleLine',
  'execRowPreviewSize',
  'execRowPreviewLine',
  'execOutputBadgeSize',
  'execOutputLabelSize',
  'execOutputMetaSize',
  'execOutputBodySize',
  'execOutputBodyLine',
  'execReasoningToggleSize',
  'execReasoningMilestoneSize',
  'execReasoningMilestoneLine',
  'agentLabelSize',
  'agentLabelLine',
  'agentTaskSize',
  'agentTaskLine',
  'agentResultSize',
  'agentResultLine',
  'agentResultH1Size',
  'agentResultH2Size',
  'agentResultH3Size',
  'agentInlineCodeSize',
  'webPreviewTitleSize',
  'webPreviewMetaSize',
  'webPreviewMetaLine',
  'webPreviewExcerptSize',
  'webPreviewExcerptLine',
  'webPreviewActionSize',
  'toolActivityMilestoneBadgeSize',
  'toolActivityMilestoneDetailSize',
  'toolActivityMilestoneDetailLine',
  'toolActivityBodySize',
  'toolActivityBodyLine',
  'toolActivityBadgeSize',
  'toolActivityDetailSize',
  'toolActivityDetailLine',
  'toolActivityToggleSize',
  'runbookSectionLabelSize',
  'runbookHeaderMetaSize',
  'runbookHeaderDetailSize',
  'runbookSummarySize',
  'runbookSummaryLine',
  'runbookFilterSize',
  'planCardSecondaryActionSize',
  'planCardTitleSize',
  'planCardStatusSize',
  'planCardSummarySize',
  'planCardSummaryLine',
  'planCardTrackedSize',
  'planCardSectionLabelSize',
  'planCardOptionSize',
  'planCardOptionBadgeSize',
  'planCardOptionDescSize',
  'planCardOptionDescLine',
  'planCardInputSize',
  'planCardQuestionSize',
  'planCardQuestionLine',
  'planCardChoiceSize',
  'planCardAlertSize',
  'planCardPrimaryActionSize',
  'planCardRequestTitleSize',
  'planCardRequestBodySize',
  'planCardRequestBodyLine',
  'planCardRequestMetaSize',
  'planCardRequestStatusSize',
  'fileChangesMenuItemSize',
  'fileChangesPreviewMessageSize',
  'fileChangesPreviewBodySize',
  'fileChangesPreviewBodyLine',
  'fileChangesHeaderSize',
  'fileChangesRowSize',
  'fileChangesRowLine',
  'fileChangesFileTitleSize',
  'fileChangesFileMetaSize',
  'fileChangesFeedbackSize',
  'conflictDiffLabelSize',
  'conflictDiffBodySize',
  'conflictDiffBodyLine',
  'conflictResolvedSize',
  'conflictHeaderPathSize',
  'conflictHeaderMetaSize',
  'conflictDebugSize',
  'conflictToggleSize',
  'conflictStatusSize',
  'conflictStatusLine',
  'conflictActionSize',
  'conflictHintSize',
  'conflictExplanationSize',
  'conflictExplanationLine',
])

export const CHAT_TYPOGRAPHY_SCALE_MIN = 0.85
export const CHAT_TYPOGRAPHY_SCALE_MAX = 1.25
export const CHAT_TYPOGRAPHY_SCALE_STEP = 0.05

export const DEFAULT_CHAT_TYPOGRAPHY_SETTINGS = Object.freeze({
  scale: 1,
})

export function chatTypographyKeyToCssVar(key) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return ''
  return `--chat-${normalizedKey.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`
}

export function normalizeChatTypographyScale(rawScale, fallback = DEFAULT_CHAT_TYPOGRAPHY_SETTINGS.scale) {
  const numericScale = Number(rawScale)
  if (!Number.isFinite(numericScale)) return fallback
  const clampedScale = Math.min(CHAT_TYPOGRAPHY_SCALE_MAX, Math.max(CHAT_TYPOGRAPHY_SCALE_MIN, numericScale))
  return Math.round(clampedScale * 100) / 100
}

export function normalizeChatTypographySettings(raw, defaults = DEFAULT_CHAT_TYPOGRAPHY_SETTINGS) {
  const fallback = defaults && typeof defaults === 'object'
    ? defaults
    : DEFAULT_CHAT_TYPOGRAPHY_SETTINGS
  const source = raw && typeof raw === 'object' ? raw : {}

  return {
    scale: normalizeChatTypographyScale(source.scale, fallback.scale),
  }
}
