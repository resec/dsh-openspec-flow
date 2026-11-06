import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  POLICY_SECTION,
  POLICY_TEXT,
  isOpenSpecProject,
  registerPolicy,
} from '../lib/policy.js'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'policy-acceptance-'))
  const project = join(root, 'project')
  const plain = join(root, 'plain')
  mkdirSync(project)
  mkdirSync(join(project, 'openspec'))
  mkdirSync(plain)
  return {
    project,
    plain,
    dispose() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}

function makeAgent(directory) {
  const sections = []
  const agent = {
    session: directory,
    ctx: {
      systemPrompt: {
        section(registration) {
          sections.push(registration)
          return () => {}
        },
        getSectionOrder() {
          return 10
        },
      },
      effect(fn) {
        return fn()
      },
    },
  }
  return { agent, sections }
}

function makeContext(initialAgents = []) {
  const handlers = new Map()
  const ctx = {
    systemPrompt: {
      section() {
        return () => {}
      },
      getSectionOrder() {
        return 10
      },
    },
    workingDirectory: {
      get(session) {
        return session
      },
    },
    agents: {
      list() {
        return initialAgents.map((entry) => entry.agent)
      },
    },
    on(event, handler) {
      handlers.set(event, handler)
      return () => {}
    },
    effect(fn) {
      return fn()
    },
    logger: { warn() {} },
  }
  return { ctx, handlers }
}

test('detects an OpenSpec root', () => {
  const f = fixture()
  try {
    assert.equal(isOpenSpecProject(f.project), true)
    assert.equal(isOpenSpecProject(f.plain), false)
    assert.equal(isOpenSpecProject(undefined), false)
    assert.equal(isOpenSpecProject(''), false)
  } finally {
    f.dispose()
  }
})

test('states the workflow gates', () => {
  assert.match(POLICY_TEXT, /openspec_apply_next/u)
  assert.match(POLICY_TEXT, /openspec_mark_task_done/u)
  assert.match(POLICY_TEXT, /openspec_validate/u)
  assert.match(POLICY_TEXT, /explicit confirmation/u)
  assert.match(POLICY_TEXT, /Archive only when the user explicitly asks/u)
})

test('attaches one scoped section and follows the working directory', () => {
  const f = fixture()
  try {
    const { agent, sections } = makeAgent(f.project)
    const { ctx } = makeContext([{ agent }])
    registerPolicy(ctx)

    assert.equal(sections.length, 1)
    assert.equal(sections[0].name, POLICY_SECTION)
    assert.equal(sections[0].text(), POLICY_TEXT)

    agent.session = f.plain
    assert.equal(sections[0].text(), '')

    agent.session = f.project
    assert.equal(sections[0].text(), POLICY_TEXT)
  } finally {
    f.dispose()
  }
})

test('creates a section for a new agent and stays idempotent', () => {
  const f = fixture()
  try {
    const { ctx, handlers } = makeContext()
    registerPolicy(ctx)
    const { agent, sections } = makeAgent(f.project)
    handlers.get('agent/created')({ agent })
    handlers.get('agent/created')({ agent })

    assert.equal(sections.length, 1)
    assert.equal(sections[0].text(), POLICY_TEXT)
  } finally {
    f.dispose()
  }
})
