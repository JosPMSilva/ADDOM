$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$mirror = Join-Path $repoRoot '.cache\models.dev.git'
$portableExport = Join-Path $repoRoot '.cache\models.dev-portable'
$portableProviders = Join-Path $portableExport 'providers'
$exportScript = Join-Path $PSScriptRoot 'export-models-dev-portable.ps1'
$refreshScript = Join-Path $PSScriptRoot 'refresh-model-catalog-source.mjs'
$upstream = 'https://github.com/anomalyco/models.dev.git'

if (!(Test-Path $mirror)) {
  $mirrorParent = Split-Path -Parent $mirror
  if (!(Test-Path $mirrorParent)) {
    New-Item -ItemType Directory -Path $mirrorParent -Force | Out-Null
  }

  Write-Output "Bootstrapping models.dev bare mirror at $mirror..."
  git clone --bare $upstream $mirror
}

if (!(Test-Path $exportScript)) {
  throw "Missing export script at $exportScript"
}

if (!(Test-Path $refreshScript)) {
  throw "Missing refresh script at $refreshScript"
}

Write-Output "Fetching latest models.dev mirror..."
git --git-dir=$mirror fetch --prune origin

$originHead = (git --git-dir=$mirror symbolic-ref refs/remotes/origin/HEAD).Trim()
if ([string]::IsNullOrWhiteSpace($originHead)) {
  throw "Unable to resolve origin HEAD for $mirror"
}

$defaultBranch = $originHead -replace '^refs/remotes/origin/', ''
$remoteCommit = (git --git-dir=$mirror rev-parse $originHead).Trim()
if ([string]::IsNullOrWhiteSpace($remoteCommit)) {
  throw "Unable to resolve remote commit for $originHead"
}

Write-Output ("Updating bare mirror branch {0} -> {1}" -f $defaultBranch, $remoteCommit)
git --git-dir=$mirror update-ref ("refs/heads/{0}" -f $defaultBranch) $remoteCommit
git --git-dir=$mirror symbolic-ref HEAD ("refs/heads/{0}" -f $defaultBranch)

Write-Output "Exporting Windows-portable models.dev copy..."
powershell -ExecutionPolicy Bypass -File $exportScript -MirrorPath $mirror -OutputPath $portableExport

Write-Output "Creating a reviewable ADDOM model catalog candidate..."
node $refreshScript --input $portableProviders --mirror $mirror

Write-Output "models.dev sync complete. Review .cache\model-catalog-review\refresh-report.md before running npm run catalog:accept:refresh."
