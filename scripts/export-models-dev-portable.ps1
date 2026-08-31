[CmdletBinding()]
param(
  [string]$MirrorPath = '',
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$repo = if ([string]::IsNullOrWhiteSpace($MirrorPath)) {
  Join-Path $repoRoot '.cache\models.dev.git'
} else {
  $MirrorPath
}
$out = if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  Join-Path $repoRoot '.cache\models.dev-portable'
} else {
  $OutputPath
}

$repo = [System.IO.Path]::GetFullPath($repo)
$out = [System.IO.Path]::GetFullPath($out)

if (!(Test-Path $repo)) {
  throw "Missing models.dev bare mirror at $repo"
}

if (Test-Path $out) {
  Remove-Item -Recurse -Force $out
}

New-Item -ItemType Directory -Path $out -Force | Out-Null

$invalidPattern = '[<>:"\\|?*]'

function Sanitize-Segment([string]$segment) {
  return [regex]::Replace($segment, $invalidPattern, {
    param($m)
    '__' + [int][char]$m.Value + '__'
  })
}

$gitDirArg = "--git-dir=$repo"
$paths = git $gitDirArg ls-tree -r --name-only HEAD
$map = @()

foreach ($path in $paths) {
  if ([string]::IsNullOrWhiteSpace($path)) {
    continue
  }

  $segments = $path -split '/'
  $sanitizedSegments = @($segments | ForEach-Object { Sanitize-Segment $_ })
  $sanitizedRelative = [string]::Join('\', $sanitizedSegments)
  $target = Join-Path $out $sanitizedRelative
  $targetDir = Split-Path -Parent $target

  if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }

  $content = git $gitDirArg show HEAD:`"$path`"
  [System.IO.File]::WriteAllText($target, $content, [System.Text.UTF8Encoding]::new($false))

  if ($path -ne ($sanitizedRelative -replace '\\', '/')) {
    $map += [pscustomobject]@{
      original = $path
      portable = ($sanitizedRelative -replace '\\', '/')
    }
  }
}

$map | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $out '.path-map.json') -Encoding utf8

$tomlCount = (Get-ChildItem -Path $out -Recurse -Filter *.toml | Measure-Object).Count
$svgCount = (Get-ChildItem -Path $out -Recurse -Filter *.svg | Measure-Object).Count

Write-Output ("toml={0}; svg={1}; remapped={2}" -f $tomlCount, $svgCount, $map.Count)
