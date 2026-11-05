import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  GENERATED_BY,
  SKILL_NAMES,
  backupDirectory,
  classifyGeneratedBy,
  hashContent,
  inspectSkill,
  packagedSkillPath,
  parseFrontmatter,
} from '../lib/skills.js'

const created = []
function project() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-skills-'))
  created.push(root)
  return root
}
test.after(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true })
})

test('parses frontmatter name, description and metadata', () => {
  const parsed = parseFrontmatter([
    '---',
    'name: openspec-apply-change',
    'description: Apply a change.',
    'metadata:',
    '  generatedBy: dsh-openspec-flow@0.1.0',
    '  upstream: openspec@1.16.0',
    '---',
    '',
    '# Body',
  ].join('\n'))
  assert.equal(parsed.name, 'openspec-apply-change')
  assert.equal(parsed.description, 'Apply a change.')
  assert.equal(parsed.metadata.generatedBy, 'dsh-openspec-flow@0.1.0')
  assert.equal(parsed.metadata.upstream, 'openspec@1.16.0')
})

test('rejects a document without frontmatter', () => {
  assert.throws(() => parseFrontmatter('# no frontmatter'), /frontmatter/)
})

test('classifies generatedBy values', () => {
  assert.equal(classifyGeneratedBy('1.16.0'), 'official')
  assert.equal(classifyGeneratedBy('openspec'), 'official')
  assert.equal(classifyGeneratedBy(GENERATED_BY), 'current')
  assert.equal(classifyGeneratedBy('dsh-openspec-flow@9.9.9'), 'plugin-other')
  assert.equal(classifyGeneratedBy(undefined), 'unknown')
  assert.equal(classifyGeneratedBy('someone-else'), 'unknown')
})

test('inspects a missing and an official skill', () => {
  const root = project()
  assert.equal(inspectSkill(root, 'openspec-propose').exists, false)

  const dir = join(root, '.dsh', 'skills', 'openspec-propose')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: openspec-propose\ndescription: old\nmetadata:\n  generatedBy: "1.16.0"\n---\n\nold\n')
  const inspected = inspectSkill(root, 'openspec-propose')
  assert.equal(inspected.exists, true)
  assert.equal(inspected.classification, 'official')
  assert.equal(inspected.hash, hashContent(readFileSync(join(dir, 'SKILL.md'), 'utf8')))
})

test('builds a timestamped backup directory outside skills', () => {
  const root = project()
  const dir = backupDirectory(root, new Date('2026-11-05T12:00:00.000Z'))
  assert.equal(dir, join(root, '.dsh', 'openspec-flow-backup', '2026-11-05T12-00-00-000Z'))
})

test('every packaged skill is valid and stamps the plugin version', () => {
  for (const name of SKILL_NAMES) {
    const raw = readFileSync(packagedSkillPath(name), 'utf8')
    const parsed = parseFrontmatter(raw)
    assert.equal(parsed.name, name)
    assert.ok(parsed.description.length > 0 && parsed.description.length <= 500, name)
    assert.equal(parsed.metadata.generatedBy, GENERATED_BY, name)
    assert.equal(parsed.metadata.upstream, 'openspec@1.16.0', name)
    assert.match(raw, /openspec_[a-z_]+/, name)
    assert.match(raw, /Fall back to the `openspec` CLI|Fall back to the CLI/, name)
  }
})
