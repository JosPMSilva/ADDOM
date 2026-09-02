const SENSITIVE_ENV_PATTERNS = [
  /^(ANTHROPIC|OPENAI|GOOGLE|GEMINI|GROQ|MISTRAL|XAI|PERPLEXITY|OPENROUTER|COHERE|DEEPSEEK)_API_KEY$/i,
  /^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)$/i,
  /^(AZURE_(CLIENT_SECRET|OPENAI_API_KEY|OPENAI_KEY|SUBSCRIPTION_ID|TENANT_ID))$/i,
  /^(GH_TOKEN|GITHUB_TOKEN|GITLAB_TOKEN|NPM_TOKEN)$/i,
  /^(DATABASE_URL|REDIS_URL|MONGO_URI|MONGODB_URI)$/i,
  /^(JWT_SECRET|SESSION_SECRET|ENCRYPTION_KEY|SECRET_KEY|PRIVATE_KEY)$/i,
  /(_API_KEY|ACCESS_TOKEN|AUTH_TOKEN|BEARER_TOKEN|PRIVATE_KEY|SECRET(_KEY)?|PASSWORD)$/i,
]

export function createSanitizedChildProcessEnv(sourceEnv = process.env) {
  const filtered = {}
  for (const [key, value] of Object.entries(sourceEnv || {})) {
    if (SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(key))) continue
    filtered[key] = value
  }

  const inheritedPath = filtered.PATH || filtered.Path || filtered.path || ''
  delete filtered.Path
  delete filtered.path
  return {
    ...filtered,
    PATH: inheritedPath,
  }
}
