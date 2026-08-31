export const DEFAULT_COMMAND_SAFETY = Object.freeze({
  showDeveloperOptions: false, // UI visibility preference for advanced command-safety controls
  installSandboxEnabled: false,
  installSandboxIgnoreScriptsFirstPass: false,
  preferredBackend: 'auto', // 'auto' | 'docker' | 'wsl' | 'none'
  sandboxNetworkEnforcementMode: 'strict', // 'best_effort' | 'strict' (strict may fail safe if backend cannot enforce)
  registryAllowlist: [],
  cacheDirs: [],
  allowGlobalSystemInstalls: false,
  allowOutsideWorkspaceMutation: false,
  allowPrivilegedHostOps: false,
  allowPrivateNetworkTargets: false,
})

export function normalizeCommandSafety(raw = {}, fallback = DEFAULT_COMMAND_SAFETY) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_COMMAND_SAFETY
  const normalizeBackend = (value) => {
    const v = String(value || '').trim().toLowerCase()
    return (v === 'docker' || v === 'wsl' || v === 'none') ? v : 'auto'
  }
  const normalizeNetworkEnforcementMode = (value) => {
    const v = String(value || '').trim().toLowerCase()
    return v === 'strict' ? 'strict' : 'best_effort'
  }
  const normalizeStringList = (value, maxItems = 20) => (
    Array.isArray(value)
      ? Array.from(new Set(value.map((v) => String(v || '').trim()).filter(Boolean))).slice(0, maxItems)
      : []
  )
  return {
    showDeveloperOptions: typeof source.showDeveloperOptions === 'boolean'
      ? source.showDeveloperOptions
      : typeof source.developerOptionsVisible === 'boolean'
        ? source.developerOptionsVisible
        : !!base.showDeveloperOptions,
    installSandboxEnabled: typeof source.installSandboxEnabled === 'boolean'
      ? source.installSandboxEnabled
      : !!base.installSandboxEnabled,
    installSandboxIgnoreScriptsFirstPass: typeof source.installSandboxIgnoreScriptsFirstPass === 'boolean'
      ? source.installSandboxIgnoreScriptsFirstPass
      : typeof source.ignoreScriptsFirstPass === 'boolean'
        ? source.ignoreScriptsFirstPass
      : !!base.installSandboxIgnoreScriptsFirstPass,
    preferredBackend: normalizeBackend(source.preferredBackend ?? source.installSandboxBackend ?? base.preferredBackend),
    sandboxNetworkEnforcementMode: normalizeNetworkEnforcementMode(
      source.sandboxNetworkEnforcementMode
      ?? source.networkEnforcementMode
      ?? source.installSandboxNetworkEnforcement
      ?? base.sandboxNetworkEnforcementMode,
    ),
    registryAllowlist: normalizeStringList(source.registryAllowlist ?? base.registryAllowlist, 50),
    cacheDirs: normalizeStringList(source.cacheDirs ?? base.cacheDirs, 20),
    allowGlobalSystemInstalls: typeof source.allowGlobalSystemInstalls === 'boolean'
      ? source.allowGlobalSystemInstalls
      : !!base.allowGlobalSystemInstalls,
    allowOutsideWorkspaceMutation: typeof source.allowOutsideWorkspaceMutation === 'boolean'
      ? source.allowOutsideWorkspaceMutation
      : !!base.allowOutsideWorkspaceMutation,
    allowPrivilegedHostOps: typeof source.allowPrivilegedHostOps === 'boolean'
      ? source.allowPrivilegedHostOps
      : !!base.allowPrivilegedHostOps,
    allowPrivateNetworkTargets: typeof source.allowPrivateNetworkTargets === 'boolean'
      ? source.allowPrivateNetworkTargets
      : !!base.allowPrivateNetworkTargets,
  }
}
