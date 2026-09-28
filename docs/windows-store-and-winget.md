# Microsoft Store and WinGet

ADDOM is available as a signed Windows package from
[Microsoft Store](https://apps.microsoft.com/detail/9N3MG7BJRSRB). Microsoft
Store and WinGet use the same Store product ID: `9N3MG7BJRSRB`.

## Install

Open the [Microsoft Store listing](https://apps.microsoft.com/detail/9N3MG7BJRSRB)
and select **Install**, or install the same package from a terminal:

```powershell
winget install --id 9N3MG7BJRSRB --exact --source msstore
```

WinGet may ask you to review the Microsoft Store source and package agreements
the first time you use the `msstore` source. For a non-interactive installation
after reviewing those agreements:

```powershell
winget install --id 9N3MG7BJRSRB `
  --exact `
  --source msstore `
  --silent `
  --accept-source-agreements `
  --accept-package-agreements
```

## Update or Remove

Microsoft Store normally updates Store-installed applications automatically.
You can also request an update through WinGet:

```powershell
winget upgrade --id 9N3MG7BJRSRB --exact --source msstore
```

To remove ADDOM through WinGet:

```powershell
winget uninstall --id 9N3MG7BJRSRB --exact
```

ADDOM keeps its local application profile separate from the installed program.
Uninstalling the package does not promise deletion of every local project,
thread, credential, or settings record. Use **Settings > Data** for intentional
data cleanup before uninstalling.

## Microsoft Store and GitHub Are Separate Channels

- The Microsoft Store package is signed, delivered, and updated by Microsoft.
  ADDOM identifies this as a Store-managed update channel.
- The GitHub release provides an unsigned Windows installer for users who prefer
  the independent distribution channel. That build uses ADDOM's in-app GitHub
  update flow instead of Microsoft Store updates.
- Installing both channels is not recommended. Choose one channel and keep it
  for subsequent updates to avoid duplicate installations with different update
  owners.

The Microsoft Store product ID is the stable identifier for WinGet's `msstore`
source. A separate manifest in the WinGet community repository is neither
needed nor maintained for the Store package.

## Troubleshooting WinGet

Confirm that the Microsoft Store source is available and refresh its catalog:

```powershell
winget source list --name msstore
winget source update --name msstore
winget show --id 9N3MG7BJRSRB --exact --source msstore
```

The repository also includes a read-only catalog probe. It does not install or
update ADDOM:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-winget-store.ps1 `
  -AcceptSourceAgreements `
  -RequirePublished
```

If WinGet is unavailable, update **App Installer** through Microsoft Store or
use the Store listing directly.
