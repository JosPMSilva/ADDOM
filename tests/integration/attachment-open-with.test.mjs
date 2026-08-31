import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createAttachmentApplicationRegistry,
  discoverAttachmentApplications,
  listAttachmentApplications,
  normalizeAttachmentApplications,
  openAttachmentWith,
} from '../../src/main/attachments/attachment-open-with.mjs'

test('Windows discovery reports only installed known applications', async () => {
  const checked = []
  const applications = await discoverAttachmentApplications({}, {
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
    access: async (target) => {
      checked.push(target)
      if (!target.endsWith('Cursor.exe')) throw new Error('missing')
    },
  })

  assert.deepEqual(applications.map((application) => application.label), ['Cursor'])
  assert.equal(checked.some((target) => target.endsWith('Code.exe')), true)
  assert.equal(checked.some((target) => target.endsWith('GitHubDesktop.exe')), true)
})

test('application normalization is default-first and removes duplicate private targets', () => {
  const applications = normalizeAttachmentApplications([
    { label: 'Cursor', target: 'C:/Cursor.exe' },
    { id: 'default', label: 'Default app', isDefault: true },
    { label: 'Cursor duplicate', target: 'c:/cursor.exe' },
  ])

  assert.deepEqual(applications.map((application) => application.label), ['Default app', 'Cursor'])
  assert.equal(applications[0].id, 'default')
  assert.equal(Object.hasOwn(applications[1], 'target'), false)
})

test('application listing publishes opaque IDs while retaining targets only inside the registry', async () => {
  const registry = createAttachmentApplicationRegistry()
  const applications = await listAttachmentApplications({
    path: 'C:/Temp/notes.txt',
    fileName: 'notes.txt',
    mediaType: 'text/plain',
  }, {
    registry,
    discoverApplications: async () => ([
      { label: 'VS Code', target: 'C:/Apps/Code.exe', argsPrefix: ['--reuse-window'] },
    ]),
  })

  assert.deepEqual(applications.map((application) => application.label), [
    'Default app',
    'VS Code',
    'Choose another app...',
  ])
  assert.equal(applications.some((application) => Object.hasOwn(application, 'target')), false)
  const detected = applications.find((application) => application.label === 'VS Code')
  assert.deepEqual(registry.resolve(detected.id), {
    target: 'C:/Apps/Code.exe',
    argsPrefix: ['--reuse-window'],
  })
})

test('open with default app delegates to the safe shell opener', async () => {
  const paths = []
  const result = await openAttachmentWith({ path: 'C:/Temp/notes.txt' }, 'default', {
    shellOpenPath: async (filePath) => {
      paths.push(filePath)
      return ''
    },
  })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(paths, ['C:/Temp/notes.txt'])
})

test('open with detected app resolves an opaque capability and passes the file as a discrete argument', async () => {
  const registry = createAttachmentApplicationRegistry()
  const [application] = registry.publish([
    { label: 'Cursor', target: 'C:/Apps/Cursor.exe', argsPrefix: ['--reuse-window'] },
  ])
  const calls = []
  const result = await openAttachmentWith({ path: 'C:/Temp/notes [1].txt' }, application.id, {
    registry,
    spawnProcess: async (command, args) => {
      calls.push({ command, args })
      return { code: 0, stdout: '', stderr: '' }
    },
  })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls, [{
    command: 'C:/Apps/Cursor.exe',
    args: ['--reuse-window', 'C:/Temp/notes [1].txt'],
  }])
})

test('open with rejects unknown application IDs without launching', async () => {
  const result = await openAttachmentWith({ path: 'C:/Temp/notes.txt' }, 'app_unknown', {
    registry: createAttachmentApplicationRegistry(),
    spawnProcess: async () => {
      throw new Error('must not launch')
    },
  })
  assert.deepEqual(result, { ok: false, error: 'open_with_application_unavailable' })
})

test('Windows choose another app uses the native chooser with the file as one argument', async () => {
  const calls = []
  const result = await openAttachmentWith({ path: 'C:/Temp/notes [1].txt' }, 'choose', {
    platform: 'win32',
    spawnProcess: async (command, args) => {
      calls.push({ command, args })
      return { code: 0, stdout: '', stderr: '' }
    },
  })

  assert.deepEqual(result, { ok: true })
  assert.equal(calls[0].command.toLowerCase(), 'rundll32.exe')
  assert.deepEqual(calls[0].args, ['shell32.dll,OpenAs_RunDLL', 'C:/Temp/notes [1].txt'])
})
