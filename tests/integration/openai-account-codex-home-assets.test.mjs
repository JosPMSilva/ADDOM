import { pathToFileURL } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const {
  ensureManagedOpenAIAccountCodexHomeAssets,
  resolveManagedOpenAIAccountCodexHomeAssetPaths,
} = await import('../../src/main/openai-account/openai-account-codex-home-assets.mjs')
const {
  buildGitHubContentsApiUrl,
  inferManagedCodexHomeFromModuleUrl,
  installSkillFromGitHub,
  listSkills,
  parseGitHubTreeUrl,
  resolveCodexHomePath,
} = await import('../../src/main/openai-account/codex-home-template/skills/.system/skill-installer/scripts/github-skill-installer-lib.mjs')

async function withTempDir(prefix, fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  try {
    return await fn(tempDir)
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
  }
}

function encodeBase64(text = '') {
  return Buffer.from(String(text || ''), 'utf8').toString('base64')
}

test('managed OpenAI account Codex home assets replace the Python skill installer with the JS-managed overlay', async () => {
  await withTempDir('addom-openai-codex-home-', async (codexHomePath) => {
    const assetPaths = resolveManagedOpenAIAccountCodexHomeAssetPaths(codexHomePath)
    fs.mkdirSync(path.join(assetPaths.targetSkillInstallerPath, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(assetPaths.targetSkillInstallerPath, 'scripts', 'install-skill-from-github.py'), '# legacy', 'utf8')

    ensureManagedOpenAIAccountCodexHomeAssets(codexHomePath)

    assert.equal(fs.existsSync(path.join(assetPaths.targetSkillInstallerPath, 'scripts', 'install-skill-from-github.py')), false)
    assert.equal(fs.existsSync(path.join(assetPaths.targetSkillInstallerPath, 'scripts', 'install-skill-from-github.mjs')), true)
    assert.equal(fs.existsSync(path.join(assetPaths.targetSkillInstallerPath, 'scripts', 'list-skills.mjs')), true)
    assert.match(
      fs.readFileSync(path.join(assetPaths.targetSkillInstallerPath, 'SKILL.md'), 'utf8'),
      /without Python/,
    )
    assert.match(
      fs.readFileSync(path.join(assetPaths.targetSkillInstallerPath, 'SKILL.md'), 'utf8'),
      /Restart ADDOM to pick up new skills\./,
    )
    assert.match(
      fs.readFileSync(path.join(assetPaths.targetSkillInstallerPath, 'SKILL.md'), 'utf8'),
      /`skills\/\.curated` and `skills\/\.experimental` are directories, not file manifests\./,
    )
    assert.doesNotMatch(
      fs.readFileSync(path.join(assetPaths.targetSkillInstallerPath, 'SKILL.md'), 'utf8'),
      /Restart Codex to pick up new skills\./,
    )
    assert.match(
      fs.readFileSync(path.join(assetPaths.targetSkillInstallerPath, 'scripts', 'install-skill-from-github.mjs'), 'utf8'),
      /Restart ADDOM to pick up new skills\./,
    )
    assert.doesNotMatch(
      fs.readFileSync(path.join(assetPaths.targetSkillInstallerPath, 'scripts', 'install-skill-from-github.mjs'), 'utf8'),
      /Restart Codex to pick up new skills\./,
    )
  })
})

test('parseGitHubTreeUrl extracts repo, ref, and path from a GitHub tree URL', () => {
  assert.deepEqual(
    parseGitHubTreeUrl('https://github.com/openai/skills/tree/main/skills/.curated/frontend-skill'),
    {
      repo: 'openai/skills',
      ref: 'main',
      repoPath: 'skills/.curated/frontend-skill',
    },
  )
})

test('resolveCodexHomePath infers the managed AppData codex-home from the installer module path', async () => {
  await withTempDir('addom-openai-managed-codex-home-', async (tempRootPath) => {
    const codexHomePath = path.join(tempRootPath, 'codex-home')
    const installerPath = path.join(codexHomePath, 'skills', '.system', 'skill-installer')
    const modulePath = path.join(installerPath, 'scripts', 'github-skill-installer-lib.mjs')
    fs.mkdirSync(path.dirname(modulePath), { recursive: true })
    fs.writeFileSync(path.join(installerPath, 'SKILL.md'), '# managed installer\n', 'utf8')

    const moduleUrl = pathToFileURL(modulePath).href
    assert.equal(inferManagedCodexHomeFromModuleUrl(moduleUrl), codexHomePath)
    assert.equal(resolveCodexHomePath({ moduleUrl }), codexHomePath)
  })
})

test('listSkills annotates installed curated skills from the managed Codex home', async () => {
  await withTempDir('addom-openai-skill-list-', async (codexHomePath) => {
    fs.mkdirSync(path.join(codexHomePath, 'skills', 'frontend-skill'), { recursive: true })
    const listingUrl = buildGitHubContentsApiUrl({
      repo: 'openai/skills',
      repoPath: 'skills/.curated',
      ref: 'main',
    })

    const skills = await listSkills({
      repo: 'openai/skills',
      repoPath: 'skills/.curated',
      dest: codexHomePath,
      fetchJsonImpl: async (url) => {
        assert.equal(url, listingUrl)
        return [
          { name: 'frontend-skill', path: 'skills/.curated/frontend-skill', type: 'dir' },
          { name: 'debugger-skill', path: 'skills/.curated/debugger-skill', type: 'dir' },
          { name: 'README.md', path: 'skills/.curated/README.md', type: 'file' },
        ]
      },
    })

    assert.deepEqual(skills, [
      {
        name: 'frontend-skill',
        installed: true,
        repoPath: 'skills/.curated/frontend-skill',
        repo: 'openai/skills',
        ref: 'main',
      },
      {
        name: 'debugger-skill',
        installed: false,
        repoPath: 'skills/.curated/debugger-skill',
        repo: 'openai/skills',
        ref: 'main',
      },
    ])
  })
})

test('installSkillFromGitHub writes the full skill tree from the GitHub Contents API', async () => {
  await withTempDir('addom-openai-skill-install-', async (codexHomePath) => {
    const responses = new Map([
      [
        buildGitHubContentsApiUrl({
          repo: 'openai/skills',
          repoPath: 'skills/.curated/frontend-skill',
          ref: 'main',
        }),
        [
          { name: 'SKILL.md', path: 'skills/.curated/frontend-skill/SKILL.md', type: 'file' },
          { name: 'scripts', path: 'skills/.curated/frontend-skill/scripts', type: 'dir' },
        ],
      ],
      [
        buildGitHubContentsApiUrl({
          repo: 'openai/skills',
          repoPath: 'skills/.curated/frontend-skill/SKILL.md',
          ref: 'main',
        }),
        {
          type: 'file',
          path: 'skills/.curated/frontend-skill/SKILL.md',
          encoding: 'base64',
          content: encodeBase64('# frontend skill\n'),
        },
      ],
      [
        buildGitHubContentsApiUrl({
          repo: 'openai/skills',
          repoPath: 'skills/.curated/frontend-skill/scripts',
          ref: 'main',
        }),
        [
          { name: 'render.js', path: 'skills/.curated/frontend-skill/scripts/render.js', type: 'file' },
        ],
      ],
      [
        buildGitHubContentsApiUrl({
          repo: 'openai/skills',
          repoPath: 'skills/.curated/frontend-skill/scripts/render.js',
          ref: 'main',
        }),
        {
          type: 'file',
          path: 'skills/.curated/frontend-skill/scripts/render.js',
          encoding: 'base64',
          content: encodeBase64('console.log("render")\n'),
        },
      ],
    ])

    const installed = await installSkillFromGitHub({
      repo: 'openai/skills',
      repoPath: 'skills/.curated/frontend-skill',
      dest: codexHomePath,
      fetchJsonImpl: async (url) => {
        if (!responses.has(url)) {
          throw new Error(`Unexpected GitHub API request: ${url}`)
        }
        return responses.get(url)
      },
    })

    assert.equal(installed.skillName, 'frontend-skill')
    assert.equal(
      fs.readFileSync(path.join(codexHomePath, 'skills', 'frontend-skill', 'SKILL.md'), 'utf8'),
      '# frontend skill\n',
    )
    assert.equal(
      fs.readFileSync(path.join(codexHomePath, 'skills', 'frontend-skill', 'scripts', 'render.js'), 'utf8'),
      'console.log("render")\n',
    )
  })
})

test('installSkillFromGitHub falls back to sparse git checkout when the GitHub API rate limit is exceeded', async () => {
  await withTempDir('addom-openai-skill-install-git-', async (codexHomePath) => {
    const gitCalls = []
    const installed = await installSkillFromGitHub({
      repo: 'openai/skills',
      repoPath: 'skills/.curated/frontend-skill',
      ref: 'main',
      dest: codexHomePath,
      fetchJsonImpl: async () => {
        throw new Error('GitHub API request failed (403): API rate limit exceeded for 127.0.0.1.')
      },
      gitRunnerImpl: async ({ args }) => {
        gitCalls.push(args)
        if (args[0] === 'clone') {
          const checkoutPath = args.at(-1)
          fs.mkdirSync(path.join(checkoutPath, 'skills', '.curated', 'frontend-skill', 'scripts'), { recursive: true })
          fs.writeFileSync(path.join(checkoutPath, 'skills', '.curated', 'frontend-skill', 'SKILL.md'), '# frontend skill via git\n', 'utf8')
          fs.writeFileSync(path.join(checkoutPath, 'skills', '.curated', 'frontend-skill', 'scripts', 'render.js'), 'console.log("git fallback")\n', 'utf8')
        }
        return { stdout: '', stderr: '' }
      },
    })

    assert.equal(installed.skillName, 'frontend-skill')
    assert.equal(
      fs.readFileSync(path.join(codexHomePath, 'skills', 'frontend-skill', 'SKILL.md'), 'utf8'),
      '# frontend skill via git\n',
    )
    assert.equal(
      fs.readFileSync(path.join(codexHomePath, 'skills', 'frontend-skill', 'scripts', 'render.js'), 'utf8'),
      'console.log("git fallback")\n',
    )
    assert.deepEqual(gitCalls[0]?.slice(0, 6), ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch'])
    assert.deepEqual(gitCalls[1], ['-C', gitCalls[0].at(-1), 'sparse-checkout', 'set', '--no-cone', 'skills/.curated/frontend-skill'])
  })
})

test('listSkills falls back to sparse git checkout when the GitHub API rate limit is exceeded', async () => {
  await withTempDir('addom-openai-skill-list-git-', async (codexHomePath) => {
    fs.mkdirSync(path.join(codexHomePath, 'skills', 'frontend-skill'), { recursive: true })
    const gitCalls = []
    const skills = await listSkills({
      repo: 'openai/skills',
      repoPath: 'skills/.curated',
      ref: 'main',
      dest: codexHomePath,
      fetchJsonImpl: async () => {
        throw new Error('GitHub API request failed (403): API rate limit exceeded for 127.0.0.1.')
      },
      gitRunnerImpl: async ({ args }) => {
        gitCalls.push(args)
        if (args[0] === 'clone') {
          const checkoutPath = args.at(-1)
          fs.mkdirSync(path.join(checkoutPath, 'skills', '.curated', 'frontend-skill'), { recursive: true })
          fs.mkdirSync(path.join(checkoutPath, 'skills', '.curated', 'debugger-skill'), { recursive: true })
          fs.writeFileSync(path.join(checkoutPath, 'skills', '.curated', 'README.md'), '# ignored\n', 'utf8')
        }
        return { stdout: '', stderr: '' }
      },
    })

    assert.deepEqual(skills, [
      {
        name: 'debugger-skill',
        installed: false,
        repoPath: 'skills/.curated/debugger-skill',
        repo: 'openai/skills',
        ref: 'main',
      },
      {
        name: 'frontend-skill',
        installed: true,
        repoPath: 'skills/.curated/frontend-skill',
        repo: 'openai/skills',
        ref: 'main',
      },
    ])
    assert.deepEqual(gitCalls[0]?.slice(0, 6), ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch'])
    assert.deepEqual(gitCalls[1], ['-C', gitCalls[0].at(-1), 'sparse-checkout', 'set', '--no-cone', 'skills/.curated'])
  })
})

test('installSkillFromGitHub falls back to sparse git checkout when GitHub API credentials are rejected', async () => {
  await withTempDir('addom-openai-skill-install-bad-creds-', async (codexHomePath) => {
    const installed = await installSkillFromGitHub({
      repo: 'openai/skills',
      repoPath: 'skills/.curated/sentry',
      ref: 'main',
      dest: codexHomePath,
      fetchJsonImpl: async () => {
        throw new Error('GitHub API request failed (401): Bad credentials')
      },
      gitRunnerImpl: async ({ args }) => {
        if (args[0] === 'clone') {
          const checkoutPath = args.at(-1)
          fs.mkdirSync(path.join(checkoutPath, 'skills', '.curated', 'sentry'), { recursive: true })
          fs.writeFileSync(path.join(checkoutPath, 'skills', '.curated', 'sentry', 'SKILL.md'), '# sentry skill via git\n', 'utf8')
        }
        return { stdout: '', stderr: '' }
      },
    })

    assert.equal(installed.skillName, 'sentry')
    assert.equal(
      fs.readFileSync(path.join(codexHomePath, 'skills', 'sentry', 'SKILL.md'), 'utf8'),
      '# sentry skill via git\n',
    )
  })
})
