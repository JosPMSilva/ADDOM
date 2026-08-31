export function isLikelyLongRunningCommand(commandText) {
  const cmd = String(commandText ?? '').trim().toLowerCase()
  if (!cmd) return false
  if (
    /^(npm|pnpm|yarn|bun)\s+(install|i|add|remove|rm|uninstall|ci|update|up|upgrade|rebuild|dedupe|audit|doctor|cache|config|list|ls|outdated|fund|view|info|why|search)\b/.test(cmd)
    || /^(pip|pip3|uv\s+pip|poetry)\s+install\b/.test(cmd)
    || /^(python|python3|py)\s+-m\s+pip\s+install\b/.test(cmd)
    || /^(apt|apt-get|dnf|yum|brew|winget|choco)\s+install\b/.test(cmd)
  ) {
    return false
  }
  const patterns = [
    /^(python|python3|py)\s+-m\s+http\.server(\s|$)/,
    /^(npx\s+(--yes\s+)?|pnpm\s+dlx\s+|yarn\s+dlx\s+|bunx\s+)?http-server(\s|$)/,
    /^(npx\s+(--yes\s+)?|pnpm\s+dlx\s+|yarn\s+dlx\s+|bunx\s+)?live-server(\s|$)/,
    /^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|watch)(\s|$)/,
    /^(next|nuxt|astro)\s+dev(\s|$)/,
    /^(npx\s+(--yes\s+)?|pnpm\s+dlx\s+|yarn\s+dlx\s+|bunx\s+)?vite(\s|$)/,
    /^webpack(-dev-server)?(\s|$)/,
    /^parcel(\s+serve)?(\s|$)/,
    /^tsx?\s+watch(\s|$)/,
    /^nodemon(\s|$)/,
    /\b--watch\b/,
  ]
  return patterns.some((re) => re.test(cmd))
}

export function isWindowsPythonHttpServerCommand(commandText) {
  const cmd = String(commandText ?? '').trim().toLowerCase()
  if (!cmd || process.platform !== 'win32') return false
  return /^(python|python3|py)\s+-m\s+http\.server(\s|$)/.test(cmd)
}


