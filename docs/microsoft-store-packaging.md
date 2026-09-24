# Microsoft Store Packaging

This guide covers the Windows Store package flavor. It does not authorize a
Partner Center upload, certification submission, or public release.

## Distribution Boundaries

ADDOM has two independent Windows distribution paths:

- GitHub releases use the NSIS installer and ADDOM's GitHub update controller.
- Microsoft Store uses an AppX package and Microsoft Store-managed updates.

Never enable `ADDOM_UPDATE_PROVIDER=github` in a Microsoft Store build. The
builder rejects that combination, and the Store runtime presents an actionless
managed-update status instead of GitHub update controls.

## Reserved Store Identity

The manifest values must exactly match Partner Center because they are
case-sensitive:

- Identity name: `JosPMSilva.Addom`
- Publisher: `CN=931991DE-381E-4CC4-92BD-C38FE9044DA5`
- Publisher display name: `JosPMSilva`
- Application ID: `ADDOM`
- Package family name: `JosPMSilva.Addom_way283e9eyj2j`
- Store ID: `9N3MG7BJRSRB`

Do not replace the identity with the visible product name.

## Version Mapping

Store package versions use four numeric fields and must increase between
submissions. ADDOM maps the application SemVer to a Store version by adding one
to the SemVer major field and using zero for the revision:

| Application version | Store package version |
| --- | --- |
| `0.1.2-alpha` | `1.1.2.0` |
| `1.0.0` | `2.0.0.0` |

This keeps prerelease SemVer values separate from the Store's numeric version
rules. Set `ADDOM_STORE_PACKAGE_VERSION` only when a submission needs an
explicit, higher Store version. The build rejects invalid values, a zero first
field, and a nonzero revision field.

## Build

On Windows with Node.js 24 and the repository dependencies installed:

```powershell
npm ci
npm run build:store:win
```

The package is written to:

```text
dist-electron/store/ADDOM-Store-<application-version>-x64.appx
```

The Store artifact is intentionally unsigned. Microsoft accepts unsigned
MSIX/AppX submissions and signs the package after certification. A package
distributed outside Microsoft Store must be signed separately with a
certificate whose subject matches the manifest Publisher.

The build also creates `dist-electron/store/win-unpacked` for inspection. Do
not distribute that directory as the Store package.

## Pre-Upload Inspection

Unpack the AppX with the Windows SDK and inspect `AppxManifest.xml`:

```powershell
$package = Resolve-Path 'dist-electron/store/ADDOM-Store-0.1.2-alpha-x64.appx'
$inspection = Join-Path $env:TEMP 'addom-store-package'
makeappx unpack /o /p $package /d $inspection
Get-Content (Join-Path $inspection 'AppxManifest.xml')
```

Confirm all of the following:

- the identity and publisher exactly match Partner Center;
- the version is the intended monotonically increasing Store version;
- the architecture is `x64`;
- the entry point is `Windows.FullTrustApplication`;
- the package requests `runFullTrust` and no unexplained capabilities;
- all four package logos are ADDOM-branded;
- the packaged `package.json` has `addomDistributionChannel` set to
  `microsoft-store`;
- no GitHub publish or updater metadata is embedded for this flavor.

## Windows App Certification Kit

Run the current Windows App Certification Kit from an elevated terminal in an
active user session:

```powershell
$appcert = 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe'
$package = (Resolve-Path 'dist-electron/store/ADDOM-Store-0.1.2-alpha-x64.appx').Path
$report = (Join-Path (Resolve-Path 'dist-electron/store').Path 'wack-report.xml')
& $appcert reset
& $appcert test -appxpackagepath $package -reportoutputpath $report
```

Review every failure and warning. The Kit must produce a report; an invocation
that returns without a report is not a passing result.

For a packaged desktop app, WACK labels some tests as optional. Microsoft says
optional Desktop Bridge tests are informational and are not used to determine
Store onboarding. ADDOM intentionally launches project tools and terminal
processes, so the optional **Blocked executables** test can report expected
references. Review every entry and confirm that it belongs to ADDOM or a shipped
runtime dependency; do not dismiss an unexplained launch target.

Treat required-test failures as blockers. Investigate DPI warnings against both
the executable manifest and the installed process rather than assuming that a
static-analysis warning is harmless.

## Sideload Qualification

A local AppX must be signed before Windows can install it outside Microsoft
Store. Use a disposable test certificate with a subject that exactly matches
the manifest Publisher, trust that certificate only on the test machine, and
never upload the locally test-signed artifact to Partner Center.

Test at least this matrix before Store submission:

- clean install and first launch;
- open an arbitrary project folder outside the package location;
- read and edit project files under each relevant permission mode;
- spawn cmd and PowerShell PTY sessions, resize the terminal, and hand control
  between the user and AI;
- run a tool-calling and streaming turn with a remote provider;
- configure and use a local provider such as Ollama when available;
- save provider credentials, restart, and verify they remain usable;
- create history, memory, attachments, and settings, then restart;
- confirm **Settings > General** says updates are managed by Microsoft Store and
  exposes no GitHub update action;
- install a higher Store package version over the previous test package and
  verify local data survives;
- exercise export, scoped deletion, and full profile reset;
- uninstall and reinstall, recording which profile data Windows retains.

Where paid provider credits are unavailable, record the untested provider path
explicitly rather than treating automated adapter tests as a live pass.

## Partner Center Submission Hold

Before uploading, confirm:

- developer-account verification is complete;
- the public privacy URL resolves to
  [github.com/JosPMSilva/ADDOM/blob/main/PRIVACY.md](https://github.com/JosPMSilva/ADDOM/blob/main/PRIVACY.md);
- website and support URLs resolve without authentication;
- pricing, markets, discoverability, category, age rating, and generative-AI
  disclosures are reviewed;
- listing copy and screenshots match the package being submitted;
- the WACK report and sideload matrix have no unresolved blockers;
- publication remains manual if certification should not immediately publish.

The Store accepts `.appx`, but Microsoft recommends `.appxupload` or
`.msixupload` when available because the upload format can include symbols. The
current electron-builder path produces `.appx`, so Partner Center crash-symbol
analytics will be limited unless a separate upload bundle is introduced.
