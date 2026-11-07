import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apply } from '../index.js'
import { withStore } from '../lib/openspec.js'
import {
  createSkillProvider,
  parseSkillDocument,
  SKILL_RANK,
} from '../lib/skill.js'
import { SKILL_NAMES } from '../lib/skills.js'
import { createFakeContext } from './fake-context.mjs'

test('withStore appends the flag only when a store is selected', () => {
  const args = ['list', '--json']
  assert.deepEqual(withStore(args, 'team'), ['list', '--json', '--store', 'team'])
  assert.deepEqual(withStore(args, '  '), args)
  assert.deepEqual(withStore(args, undefined), args)
})

test('parses quoted and unquoted skill frontmatter', () => {
  const double = parseSkillDocument('---\nname: demo-skill\ndescription: "quoted"\n---\nbody')
  assert.equal(double.description, 'quoted')
  const single = parseSkillDocument("---\nname: demo-skill\ndescription: 'single'\n---\nbody")
  assert.equal(single.description, 'single')
  const bare = parseSkillDocument('---\nbroken\nname: demo-skill\ndescription: bare\n---\nbody')
  assert.equal(bare.description, 'bare')
})

test('rejects a malformed skill document', () => {
  assert.throws(() => parseSkillDocument('body only'), /frontmatter block/)
  assert.throws(() => parseSkillDocument('---\nname: Bad_Name\ndescription: d\n---\nbody'), /kebab-case name/)
  assert.throws(() => parseSkillDocument('---\nname: demo-skill\n---\nbody'), /declare a description/)
  assert.throws(() => parseSkillDocument('---\nname: demo-skill\ndescription: ""\n---\nbody'), /declare a description/)
  assert.throws(() => parseSkillDocument(`---\nname: demo-skill\ndescription: ${'x'.repeat(501)}\n---\nbody`), /at most 500/)
  assert.throws(() => parseSkillDocument('---\nname: demo-skill\ndescription: d\n---\n'), /no instruction body/)
})

test('fake context registers a skill provider and disposes it', () => {
  const { ctx, providers } = createFakeContext()
  const skills = ctx.get('skills')
  const dispose = skills.registerProvider(() => ({
    name: 'demo-provider',
    list: async () => [],
    get: async () => undefined,
  }))
  assert.equal(providers.get('demo-provider')?.name, 'demo-provider')
  dispose()
  assert.equal(providers.has('demo-provider'), false)
})

test('the provider offers every packaged skill at rank 50', async () => {
  const provider = createSkillProvider()
  const candidates = await provider.list()
  assert.deepEqual(candidates.map((candidate) => candidate.name), SKILL_NAMES)
  assert.ok(candidates.every((candidate) => candidate.rank === 50))
  assert.ok(candidates.every((candidate) => candidate.source === 'bundled'))
  assert.ok(candidates.every((candidate) => candidate.provider === 'openspec-flow'))
})

test('list omits bodies and get reads one body on demand', async () => {
  const provider = createSkillProvider()
  const candidates = await provider.list()
  assert.ok(candidates.every((candidate) => !('content' in candidate)))
  const target = candidates.find((candidate) => candidate.name === 'openspec-apply-change')
  const definition = await provider.get(target)
  assert.equal(definition.name, 'openspec-apply-change')
  assert.match(definition.content, /openspec_apply_next/)
  assert.doesNotMatch(definition.content, /^---/u)
})

test('a malformed packaged document is skipped with one warning', async () => {
  const warnings = []
  const provider = createSkillProvider({
    logger: { warn: (message) => warnings.push(message) },
    read: (path) => (path.endsWith('openspec-apply-change/SKILL.md')
      ? 'no frontmatter'
      : readFileSync(path, 'utf8')),
  })
  const names = (await provider.list()).map((candidate) => candidate.name)
  assert.equal(names.length, SKILL_NAMES.length - 1)
  assert.ok(!names.includes('openspec-apply-change'))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /openspec-apply-change/)
})

test('a deployment without a skill registry keeps the tools and warns once', () => {
  const warnings = []
  const fake = createFakeContext({ cwd: process.cwd(), skills: false })
  fake.ctx.logger.warn = (message) => warnings.push(message)
  apply(fake.ctx, { timeoutMs: 30_000 })
  assert.ok(fake.tools.size >= 5)
  assert.equal(warnings.filter((message) => /skill/u.test(message)).length, 1)
})

test('provider candidates outrank every project skill root', async () => {
  const candidates = await createSkillProvider().list()
  assert.equal(SKILL_RANK, 50)
  assert.ok(candidates.every((candidate) => candidate.rank < 100))
})

test('get returns undefined for a missing or malformed body and accepts a name-only candidate', async () => {
  const missing = createSkillProvider({
    read: () => {
      throw new Error('missing')
    },
  })
  assert.equal(await missing.get({ name: 'openspec-apply-change', locator: '/missing/SKILL.md' }), undefined)

  const malformed = createSkillProvider({ read: () => 'no frontmatter' })
  assert.equal(await malformed.get({ name: 'openspec-apply-change', locator: '/broken/SKILL.md' }), undefined)

  const byName = await createSkillProvider().get({ name: 'openspec-apply-change' })
  assert.equal(byName.name, 'openspec-apply-change')
})
