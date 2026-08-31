import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  executeTool,
} from '../../src/main/tools/fs-tools.mjs'
import {
  installCuratedSkill,
  listCuratedSkills,
  resolveOpenAILocalSkillCodexHomePath,
} from '../../src/main/tools/local-skill-tools.mjs'

function withTempUserDataPath(fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-local-skills-'))
  const previous = process.env.ADDOM_USER_DATA_PATH
  process.env.ADDOM_USER_DATA_PATH = tempDir
  return Promise.resolve()
    .then(() => fn(tempDir))
    .finally(() => {
      if (previous === undefined) {
        delete process.env.ADDOM_USER_DATA_PATH
      } else {
        process.env.ADDOM_USER_DATA_PATH = previous
      }
      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
    })
}

function encodeBase64(text = '') {
  return Buffer.from(String(text || ''), 'utf8').toString('base64')
}

test('listCuratedSkills uses the local installer-backed catalog instead of repo exploration', async () => {
  await withTempUserDataPath(async (userDataPath) => {
    const result = await listCuratedSkills({ query: 'front' }, {
      userDataPath,
      skillFetchJsonImpl: async () => ([
        { name: 'frontend-skill', path: 'skills/.curated/frontend-skill', type: 'dir' },
        { name: 'debugger-skill', path: 'skills/.curated/debugger-skill', type: 'dir' },
      ]),
    })

    assert.equal(result.ok, true)
    assert.equal(result.total, 1)
    assert.equal(result.skills[0]?.name, 'frontend-skill')
    assert.match(result.message, /Use install_curated_skill/i)
    const codexHomePath = resolveOpenAILocalSkillCodexHomePath({ userDataPath })
    assert.equal(result.localSkillHomePath, codexHomePath)
    assert.equal(
      fs.existsSync(path.join(codexHomePath, 'skills', '.system', 'skill-installer', 'SKILL.md')),
      true,
    )
  })
})

test('local curated-skill discovery remains executable without a selected project root', async () => {
  await withTempUserDataPath(async (userDataPath) => {
    const result = await executeTool('', 'list_curated_skills', { query: 'front' }, {
      userDataPath,
      skillFetchJsonImpl: async () => ([
        { name: 'frontend-skill', path: 'skills/.curated/frontend-skill', type: 'dir' },
      ]),
    })

    assert.match(String(result.result?.message || ''), /Found 1 curated skill matching "front"/i)
  })
})

test('installCuratedSkill installs the selected OpenAI curated skill into the local skill home', async () => {
  await withTempUserDataPath(async (userDataPath) => {
    const responses = new Map([
      [
        'https://api.github.com/repos/openai/skills/contents/skills/.curated/frontend-skill?ref=main',
        [
          { name: 'SKILL.md', path: 'skills/.curated/frontend-skill/SKILL.md', type: 'file' },
          { name: 'scripts', path: 'skills/.curated/frontend-skill/scripts', type: 'dir' },
        ],
      ],
      [
        'https://api.github.com/repos/openai/skills/contents/skills/.curated/frontend-skill/SKILL.md?ref=main',
        {
          type: 'file',
          path: 'skills/.curated/frontend-skill/SKILL.md',
          encoding: 'base64',
          content: encodeBase64('# frontend skill\n'),
        },
      ],
      [
        'https://api.github.com/repos/openai/skills/contents/skills/.curated/frontend-skill/scripts?ref=main',
        [
          { name: 'render.js', path: 'skills/.curated/frontend-skill/scripts/render.js', type: 'file' },
        ],
      ],
      [
        'https://api.github.com/repos/openai/skills/contents/skills/.curated/frontend-skill/scripts/render.js?ref=main',
        {
          type: 'file',
          path: 'skills/.curated/frontend-skill/scripts/render.js',
          encoding: 'base64',
          content: encodeBase64('console.log("frontend")\n'),
        },
      ],
    ])

    const result = await installCuratedSkill({ skill_name: 'frontend-skill' }, {
      userDataPath,
      skillFetchJsonImpl: async (url) => {
        if (!responses.has(url)) throw new Error(`Unexpected URL: ${url}`)
        return responses.get(url)
      },
    })

    assert.equal(result.ok, true)
    assert.equal(result.skillName, 'frontend-skill')
    assert.equal(result.restartRequired, true)
    assert.match(result.message, /Restart ADDOM to pick up new skills/i)
    const codexHomePath = resolveOpenAILocalSkillCodexHomePath({ userDataPath })
    assert.equal(
      fs.readFileSync(path.join(codexHomePath, 'skills', 'frontend-skill', 'SKILL.md'), 'utf8'),
      '# frontend skill\n',
    )
    assert.equal(
      fs.readFileSync(path.join(codexHomePath, 'skills', 'frontend-skill', 'scripts', 'render.js'), 'utf8'),
      'console.log("frontend")\n',
    )
  })
})

test('local curated-skill install remains executable without a selected project root', async () => {
  await withTempUserDataPath(async (userDataPath) => {
    const responses = new Map([
      [
        'https://api.github.com/repos/openai/skills/contents/skills/.curated/frontend-skill?ref=main',
        [
          { name: 'SKILL.md', path: 'skills/.curated/frontend-skill/SKILL.md', type: 'file' },
        ],
      ],
      [
        'https://api.github.com/repos/openai/skills/contents/skills/.curated/frontend-skill/SKILL.md?ref=main',
        {
          type: 'file',
          path: 'skills/.curated/frontend-skill/SKILL.md',
          encoding: 'base64',
          content: encodeBase64('# frontend skill\n'),
        },
      ],
    ])

    const result = await executeTool('', 'install_curated_skill', { skill_name: 'frontend-skill' }, {
      userDataPath,
      skillFetchJsonImpl: async (url) => {
        if (!responses.has(url)) throw new Error(`Unexpected URL: ${url}`)
        return responses.get(url)
      },
    })

    assert.match(String(result.result?.message || ''), /Installed curated skill "frontend-skill"/i)
    const codexHomePath = resolveOpenAILocalSkillCodexHomePath({ userDataPath })
    assert.equal(
      fs.readFileSync(path.join(codexHomePath, 'skills', 'frontend-skill', 'SKILL.md'), 'utf8'),
      '# frontend skill\n',
    )
  })
})
