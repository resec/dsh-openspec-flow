import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SKILLS = fileURLToPath(new URL('../skills/', import.meta.url))
const NAMES = readdirSync(SKILLS).filter((name) => name.startsWith('openspec-'))

test('packaged skills contain no command map', () => {
  assert.ok(NAMES.length >= 6)
  for (const name of NAMES) {
    const raw = readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8')
    assert.doesNotMatch(raw, /^## Command map/mu, `${name} must not carry a command map`)
  }
})

test('packaged skills name no CLI command', () => {
  for (const name of NAMES) {
    const raw = readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8')
    assert.doesNotMatch(
      raw,
      /`openspec (list|show|validate|instructions|status|archive|new|init|update|store|context|schemas)\b/u,
      `${name} must not name a CLI command`,
    )
  }
})

test('frontmatter metadata survives', () => {
  for (const name of NAMES) {
    const raw = readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8')
    assert.match(raw, /generatedBy: dsh-openspec-flow@/u, `${name} must keep generatedBy`)
  }
})
