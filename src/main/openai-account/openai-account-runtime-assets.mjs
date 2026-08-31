function normalizeString(value = '') {
  return String(value || '').trim()
}

const TARGETS = Object.freeze({
  'win32/x64': ['x86_64-pc-windows-msvc', 'codex.exe', 'codex-code-mode-host.exe'],
  'win32/arm64': ['aarch64-pc-windows-msvc', 'codex.exe', 'codex-code-mode-host.exe'],
  'darwin/x64': ['x86_64-apple-darwin', 'codex', 'codex-code-mode-host'],
  'darwin/arm64': ['aarch64-apple-darwin', 'codex', 'codex-code-mode-host'],
  'linux/x64': ['x86_64-unknown-linux-gnu', 'codex', 'codex-code-mode-host'],
  'linux/arm64': ['aarch64-unknown-linux-gnu', 'codex', 'codex-code-mode-host'],
})

export function resolvePinnedAssetSpec({ platform = process.platform, arch = process.arch } = {}) {
  const safePlatform = normalizeString(platform)
  const safeArch = normalizeString(arch)
  const target = TARGETS[`${safePlatform}/${safeArch}`]
  if (!target) return null
  const [targetTriple, executableName, hostName] = target
  return {
    platform: safePlatform,
    arch: safeArch,
    packageAssetName: `codex-package-${targetTriple}.tar.gz`,
    legacyAssetName: `codex-${targetTriple}${safePlatform === 'win32' ? '.exe' : '.tar.gz'}`,
    packageExecutablePath: ['bin', executableName],
    legacyExecutablePath: [executableName],
    codeModeHostPath: ['bin', hostName],
  }
}

function codexVersionTuple(version = '') {
  const match = normalizeString(version).match(/(?:rust-v)?(\d+)\.(\d+)\.(\d+)/i)
  return match ? match.slice(1).map((entry) => Number(entry) || 0) : [0, 0, 0]
}

export function requiresCodeModeHost(version = '') {
  const [major, minor] = codexVersionTuple(version)
  return major > 0 || minor >= 144
}

export function resolveAssetLayout(spec = null, assetName = '') {
  if (!spec) return null
  const isPackage = normalizeString(assetName) === spec.packageAssetName
  return {
    isPackage,
    isArchive: isPackage || normalizeString(assetName).endsWith('.tar.gz'),
    executablePath: isPackage ? spec.packageExecutablePath : spec.legacyExecutablePath,
    codeModeHostPath: isPackage ? spec.codeModeHostPath : [],
  }
}
