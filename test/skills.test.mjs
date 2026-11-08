import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  GENERATED_BY,
  SKILL_NAMES,
  packagedSkillPath,
  parseFrontmatter,
} from '../lib/skills.js'

test('parses frontmatter name, description and metadata', () => {
  const parsed = parseFrontmatter([
    '---',
    'name: openspec-apply-change',
    'description: Apply a change.',
    'metadata:',
    '  generatedBy: dsh-openspec-flow@0.1.0',
    '  upstream: openspec@1.16.1',
    '---',
    '',
    '# Body',
  ].join('\n'))
  assert.equal(parsed.name, 'openspec-apply-change')
  assert.equal(parsed.description, 'Apply a change.')
  assert.equal(parsed.metadata.generatedBy, 'dsh-openspec-flow@0.1.0')
  assert.equal(parsed.metadata.upstream, 'openspec@1.16.1')
})

test('rejects a document without frontmatter', () => {
  assert.throws(() => parseFrontmatter('# no frontmatter'), /frontmatter/)
})

test('the removed sync skill is not packaged', () => {
  assert.equal(SKILL_NAMES.includes('openspec-sync-specs'), false)
  assert.equal(existsSync(packagedSkillPath('openspec-sync-specs')), false)
})

test('every packaged skill is valid and stamps the plugin version', () => {
  for (const name of SKILL_NAMES) {
    const raw = readFileSync(packagedSkillPath(name), 'utf8')
    const parsed = parseFrontmatter(raw)
    assert.equal(parsed.name, name)
    assert.ok(parsed.description.length > 0 && parsed.description.length <= 500, name)
    assert.doesNotMatch(parsed.description, /: /, `${name} description must stay a YAML plain scalar`)
    assert.equal(parsed.metadata.generatedBy, GENERATED_BY, name)
    assert.equal(parsed.metadata.upstream, 'openspec@1.16.1', name)
    assert.match(raw, /openspec_[a-z_]+/, name)
    assert.doesNotMatch(raw, /\bCLI\b/i, `${name} must not mention the CLI`)
    assert.doesNotMatch(raw, /\bopsx\b/i, `${name} must not name an alias command`)
    assert.doesNotMatch(raw, /`openspec`/, `${name} must not name a bare openspec command`)
    assert.doesNotMatch(raw, /^## Command map/m, `${name} must not carry a command map`)
    assert.doesNotMatch(
      raw,
      /`openspec (list|show|validate|instructions|status|archive|new|init|update|store|context|schemas)\b/,
      `${name} must not name a CLI command`,
    )
  }
})
