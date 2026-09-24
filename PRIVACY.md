# ADDOM Privacy Policy

Last updated: September 24, 2026

ADDOM is a local-first desktop coding workspace. This policy explains what
information ADDOM stores, when information may leave the device, and which
services operate independently of the ADDOM developer.

## Information Stored On The Device

ADDOM stores application data in the local operating-system profile. Depending
on the features you use, that data can include:

- selected project locations and project metadata;
- conversation and tool-execution history;
- application settings and provider configuration;
- API keys, account tokens, and other saved credentials;
- attachments, Project Knowledge, memory, artifacts, and terminal archives;
- cached provider or model metadata, logs, and temporary tool output.

ADDOM may read or modify files in folders you select and may run local commands
when permitted by the active permission mode or an approval you provide.

The ADDOM developer does not operate application analytics or telemetry and
does not receive this local application data merely because you install or use
ADDOM.

## Credentials

Saved credentials remain in the local application profile. ADDOM uses
operating-system protection where the platform and runtime make it available.
You are responsible for protecting your device, operating-system account, and
provider credentials.

## When Information Leaves The Device

ADDOM connects to network services only through features you configure or use.
For example:

- A remote AI provider may receive prompts, selected project context,
  attachments, tool results, and conversation history needed to answer a
  request.
- Hosted provider tools, MCP servers, account-authentication services, and
  other configured integrations may receive the information required for the
  requested operation.
- Local providers such as Ollama may receive information over the local
  network interface or another address you configure.
- Update checks in a GitHub-distributed build contact ADDOM's official GitHub
  release source. Microsoft Store builds rely on Microsoft Store for delivery
  and updates.

These providers and services process information under their own terms and
privacy policies. The ADDOM developer does not control their retention,
training, logging, security, or disclosure practices. Review the selected
provider and the material included in a request before using sensitive data.

## Microsoft Store Distribution

If you acquire ADDOM through Microsoft Store, Microsoft may process Store
account, transaction, installation, update, diagnostic, and usage information
under Microsoft's own terms and privacy statement. That information is
processed by Microsoft as the Store operator; it is not ADDOM application
telemetry operated by the ADDOM developer.

Microsoft Store signing applies only to the package delivered through
Microsoft Store. It does not sign or endorse separately distributed installers
or release assets.

## Data Sharing And Sale

The ADDOM developer does not sell personal information and does not share local
application data with advertisers or data brokers. Information may be sent to
the providers or integrations you choose as described above.

## Retention, Export, And Deletion

Local application data remains on the device until you remove it. ADDOM
provides scoped deletion and export controls in **Settings > Data**, including
thread export, API-key deletion, project-history deletion, and a full local
profile reset. A full reset removes ADDOM data from the active local profile;
it does not delete your project files or data retained by an external provider.

Uninstalling ADDOM may not remove every file in the local application profile.
Use the in-app reset before uninstalling if you want ADDOM to remove the active
profile data it manages.

## Changes To This Policy

This policy may change when ADDOM's features, distribution methods, or legal
requirements change. Material changes will be recorded in the public
repository, and the date at the top of this file will be updated.

## Contact And Security Reports

For privacy questions, open an issue in the
[ADDOM repository](https://github.com/JosPMSilva/ADDOM/issues) without including
secrets or private project content. Report security vulnerabilities through the
private process described in [SECURITY.md](./SECURITY.md).
