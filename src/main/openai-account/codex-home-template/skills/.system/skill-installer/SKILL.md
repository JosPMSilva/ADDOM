---
name: skill-installer
description: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos with a token).
metadata:
  short-description: Install curated skills from openai/skills or other GitHub repos without Python
---

# Skill Installer

Helps install skills. By default these are from https://github.com/openai/skills/tree/main/skills/.curated, but users can also provide other locations. Experimental skills live in https://github.com/openai/skills/tree/main/skills/.experimental and can be installed the same way.

Use the helper scripts based on the task:
- List skills when the user asks what is available, or if the user uses this skill without specifying what to do. Default listing is `.curated`, but you can pass `--path skills/.experimental` when they ask about experimental skills.
- Install from the curated list when the user provides a skill name.
- Install from another repo when the user provides a GitHub repo/path (including private repos when `GITHUB_TOKEN` or `GH_TOKEN` is available).

Install skills with the helper scripts.

## Communication

When listing skills, output approximately as follows, depending on the context of the user's request. If they ask about experimental skills, list from `.experimental` instead of `.curated` and label the source accordingly:
"""
Skills from {repo}:
1. skill-1
2. skill-2 (already installed)
3. ...
Which ones would you like installed?
"""

After installing a skill, tell the user: "Restart ADDOM to pick up new skills."

## Scripts

All of these scripts use network.

- `node scripts/list-skills.mjs`
- `node scripts/list-skills.mjs --format json`
- Example (experimental list): `node scripts/list-skills.mjs --path skills/.experimental`
- `node scripts/install-skill-from-github.mjs --repo <owner>/<repo> --path <path/to/skill> [--path <path/to/skill> ...]`
- `node scripts/install-skill-from-github.mjs --url https://github.com/<owner>/<repo>/tree/<ref>/<path>`
- Example (experimental skill): `node scripts/install-skill-from-github.mjs --repo openai/skills --path skills/.experimental/<skill-name>`

## Behavior and Options

- Defaults to GitHub Contents API downloads.
- Supports private GitHub repos when `GITHUB_TOKEN` or `GH_TOKEN` is available.
- Aborts if the destination skill directory already exists.
- Installs into `$CODEX_HOME/skills/<skill-name>` (defaults to `~/.codex/skills`).
- Multiple `--path` values install multiple skills in one run, each named from the path basename unless `--name` is supplied.
- Options: `--ref <ref>` (default `main`), `--dest <path>`, `--format text|json`.

## Notes

- Curated listing is fetched from `https://github.com/openai/skills/tree/main/skills/.curated` via the GitHub API. If it is unavailable, explain the error and exit.
- `skills/.curated` and `skills/.experimental` are directories, not file manifests. Do not use `Get-Content`, `cat`, zip extraction shortcuts, or other file-oriented reads against those paths.
- To discover curated skills, run `node scripts/list-skills.mjs`. To install curated skills, pass one or more explicit skill directories such as `--path skills/.curated/frontend-skill`.
- If you need several curated skills, keep using one `node scripts/install-skill-from-github.mjs` call and repeat `--path skills/.curated/<skill-name>` for each skill.
- The skills at https://github.com/openai/skills/tree/main/skills/.system are preinstalled, so no need to help users install those. If they ask, just explain this. If they insist, you can download and overwrite.
- Installed annotations come from `$CODEX_HOME/skills`.
