export const CANONICAL_TECHNICAL_GLOSSARY = Object.freeze({
  product: Object.freeze([
    'ADDOM',
  ]),
  providers: Object.freeze([
    'OpenAI',
    'Anthropic',
    'OpenRouter',
    'Ollama',
    'LM Studio',
  ]),
  protocols: Object.freeze([
    'MCP',
    'API',
  ]),
  technicalNouns: Object.freeze([
    'vector store',
    'file_search',
  ]),
  preserveAsEntered: Object.freeze([
    'model IDs',
    'provider IDs',
    'file paths',
    'shell commands',
    'error codes',
    'file formats',
  ]),
})

const CANONICAL_TECHNICAL_TERMS = Object.freeze(
  Object.values(CANONICAL_TECHNICAL_GLOSSARY).flatMap((terms) => [...terms]),
)

const CANONICAL_TECHNICAL_TERM_SET = new Set(
  CANONICAL_TECHNICAL_TERMS.map((term) => String(term).trim()),
)

export { CANONICAL_TECHNICAL_TERMS }

export function isCanonicalTechnicalTerm(value) {
  return CANONICAL_TECHNICAL_TERM_SET.has(String(value ?? '').trim())
}
