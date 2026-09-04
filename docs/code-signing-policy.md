# Code signing policy

## Current status

ADDOM's published `0.1.0-alpha` packages are unsigned. The project is applying
for the SignPath Foundation open-source code-signing program. This application
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
It will not transfer information to other networked systems unless specifically
requested by the user or by the person installing or operating it. Choosing a
remote model provider, a hosted tool, an MCP integration, or Project Knowledge
may send selected prompts, context, tool results, or files to that chosen
service. See [Privacy and provider boundaries](../README.md#privacy-and-provider-boundaries).

Third-party software included in release packages is recorded in the generated
third-party notices and dependency inventory shipped with the application.

## Incident response

Suspected malicious, unauthorized, or incorrectly signed artifacts must be
reported through the private process in [SECURITY.md](../SECURITY.md). The
maintainer will investigate signing-policy violations and cooperate with the
signing provider, including revocation when required.
