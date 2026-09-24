# Code signing policy

## Current status

ADDOM's GitHub-hosted `0.1.0-alpha`, `0.1.1-alpha`, and `0.1.2-alpha` packages
are unsigned. Packages acquired through Microsoft Store are signed by Microsoft
during Store certification; that signature does not apply to GitHub release
assets. The project is separately applying for the
SignPath Foundation open-source code-signing program. This application
does not mean that SignPath Foundation has accepted or endorsed ADDOM, and no
release should be described as signed until its downloadable artifacts carry a
verifiable signature.

If the application is accepted, this page and each signed release will state:

> Free code signing provided by [SignPath.io](https://about.signpath.io/),
> certificate by [SignPath Foundation](https://signpath.org/).

## Release provenance

- Release packages are built from the public
  [ADDOM repository](https://github.com/JosPMSilva/ADDOM) using GitHub-hosted
  runners and workflows stored in that repository.
- Signing will apply only to artifacts produced by the approved GitHub Actions
  workflow from the approved source branch or release tag.
- A signing request requires manual approval. A signature will never be applied
  to an independently supplied local binary.
- Published release notes identify the source commit and disclose platform
  support, release maturity, and known limitations.

## Project roles

ADDOM is currently maintained by one person:

- Committer and reviewer: [JosPMSilva](https://github.com/JosPMSilva)
- Signing approver: [JosPMSilva](https://github.com/JosPMSilva)

Changes from external contributors must be submitted through a pull request and
reviewed before merge. Repository access and any future SignPath account used
for signing must be protected by multi-factor authentication.

## Privacy and included software

ADDOM does not collect application analytics or telemetry for its developer.
Network requests can occur through features you configure or use, including
remote model providers, hosted tools, MCP integrations, Project Knowledge, and
the update channel for the installed build. Those features may send selected
prompts, context, tool results, files, or update metadata to the chosen service.
See the [ADDOM Privacy Policy](../PRIVACY.md).

Microsoft signs packages distributed through Microsoft Store as part of Store
ingestion. That signature applies only to the Store-delivered package and does
not sign or endorse installers hosted on GitHub or elsewhere.

Third-party software included in release packages is recorded in the generated
third-party notices and dependency inventory shipped with the application.

## Incident response

Suspected malicious, unauthorized, or incorrectly signed artifacts must be
reported through the private process in [SECURITY.md](../SECURITY.md). The
maintainer will investigate signing-policy violations and cooperate with the
signing provider, including revocation when required.
