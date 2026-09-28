[CmdletBinding()]
param(
  [string]$StoreId = '9N3MG7BJRSRB',
  [switch]$AcceptSourceAgreements,
  [switch]$RequirePublished
)

$ErrorActionPreference = 'Stop'

function Invoke-WingetReadOnly {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $output = & $script:WingetPath @Arguments 2>&1
  $exitCode = $LASTEXITCODE

  [pscustomobject]@{
    ExitCode = $exitCode
    Output = @($output)
  }
}

$wingetCommand = Get-Command winget -ErrorAction SilentlyContinue
if (-not $wingetCommand) {
  Write-Error 'WinGet is not installed or is not available on PATH.'
  exit 2
}

$script:WingetPath = $wingetCommand.Source

Write-Host 'ADDOM Microsoft Store / WinGet readiness check'
Write-Host "Store product ID: $StoreId"
Write-Host 'This probe only lists sources and queries catalog metadata. It does not install or update anything.'
Write-Host ''

$sourceResult = Invoke-WingetReadOnly -Arguments @(
  'source',
  'list',
  '--name',
  'msstore',
  '--disable-interactivity'
)

if ($sourceResult.ExitCode -ne 0) {
  $sourceResult.Output | ForEach-Object { Write-Host $_ }
  Write-Error 'The default msstore source is not available. Repair WinGet sources before checking ADDOM.'
  exit 2
}

$queryAgreementArguments = @()
if ($AcceptSourceAgreements) {
  $queryAgreementArguments += '--accept-source-agreements'
}

$searchArguments = @(
  'search',
  '--id',
  $StoreId,
  '--exact',
  '--source',
  'msstore',
  '--disable-interactivity'
) + $queryAgreementArguments

$searchResult = Invoke-WingetReadOnly -Arguments $searchArguments
if ($searchResult.ExitCode -ne 0) {
  $searchResult.Output | ForEach-Object { Write-Host $_ }
  Write-Warning "ADDOM is not yet discoverable in the msstore catalog under $StoreId."
  Write-Host 'This is expected while Microsoft Store certification or publication is still pending.'

  if ($RequirePublished) {
    exit 1
  }

  exit 0
}

$searchResult.Output | ForEach-Object { Write-Host $_ }
Write-Host ''

$showArguments = @(
  'show',
  '--id',
  $StoreId,
  '--exact',
  '--source',
  'msstore',
  '--disable-interactivity'
) + $queryAgreementArguments

$showResult = Invoke-WingetReadOnly -Arguments $showArguments
if ($showResult.ExitCode -ne 0) {
  $showResult.Output | ForEach-Object { Write-Host $_ }
  Write-Warning 'The Store entry was found by search, but WinGet could not retrieve its package details.'

  if ($RequirePublished) {
    exit 1
  }

  exit 0
}

$showResult.Output | ForEach-Object { Write-Host $_ }
Write-Host ''
Write-Host 'ADDOM is discoverable through the Microsoft Store WinGet source.'
Write-Host "Verified install command: winget install --id $StoreId --exact --source msstore"
