const MAX_QUESTION_LENGTH = 400
const MAX_OPTION_COUNT = 4
const MAX_OPTION_LABEL_LENGTH = 80
const MAX_OPTION_DESCRIPTION_LENGTH = 160

function clampText(value = '', maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeOptions(options = []) {
  const source = Array.isArray(options) ? options : []
  const out = []
  for (const rawOption of source) {
    if (out.length >= MAX_OPTION_COUNT) break
    const option = rawOption && typeof rawOption === 'object' ? rawOption : {}
    const label = clampText(option.label, MAX_OPTION_LABEL_LENGTH)
    if (!label) continue
    out.push({
      label,
      description: clampText(option.description, MAX_OPTION_DESCRIPTION_LENGTH),
    })
  }
  return out
}

export async function questionUser(_projectRoot, toolInput = {}) {
  const question = clampText(toolInput?.question, MAX_QUESTION_LENGTH)
  if (!question) {
    throw new Error('question is required.')
  }

  const header = clampText(toolInput?.header, 40)
  const options = normalizeOptions(toolInput?.options)

  return {
    status: 'awaiting_user_response',
    question,
    header,
    options,
    guidance: 'Ask the user this question and wait for their next response before continuing implementation.',
  }
}
