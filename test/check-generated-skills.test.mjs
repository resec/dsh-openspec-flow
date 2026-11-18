import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyGeneratedSkill,
  hasGeneratedFrontmatter,
  isGeneratedSkillPath,
} from '../scripts/check-generated-skills.mjs'

const GENERATED = [
  '---',
  'name: openspec-propose',
  'description: Propose a new change.',
  'allowed-tools: Bash(openspec:*)',
  'license: MIT',
  'compatibility: Requires openspec CLI.',
  'metadata:',
  '  author: openspec',
  '  version: "1.0"',
  '  generatedBy: "2.0.0"',
  '---',
  '',
  'Body',
].join('\n')

const ROOT_SKILL = [
  '---',
  'name: openspec-propose',
  'description: Propose with the plugin tools.',
  'whenToUse: The user wants a change.',
  'metadata:',
  '  generatedBy: dsh-openspec-flow@0.9.0',
  '  upstream: openspec@2.0.0',
  '---',
  '',
  'Body',
].join('\n')

test('recognizes generated skill paths but allows the repository root skills', () => {
  assert.equal(isGeneratedSkillPath('.dsh/skills/openspec-propose/SKILL.md'), true)
  assert.equal(isGeneratedSkillPath('.agents/skills/openspec-apply-change/SKILL.md'), true)
  assert.equal(isGeneratedSkillPath('docs/skills/openspec-propose/SKILL.md'), true)
  assert.equal(isGeneratedSkillPath('skills/openspec-propose/SKILL.md'), false)
  assert.equal(isGeneratedSkillPath('skills/other/SKILL.md'), false)
})

test('recognizes generated frontmatter and not the root skill format', () => {
  assert.equal(hasGeneratedFrontmatter(GENERATED), true)
  assert.equal(hasGeneratedFrontmatter(ROOT_SKILL), false)
  assert.equal(hasGeneratedFrontmatter('name: openspec-propose\nallowed-tools: x\n'), false)
})

test('classifies a renamed generated file by content', () => {
  const result = classifyGeneratedSkill({
    path: 'docs/copied-skill.md',
    content: GENERATED,
  })
  assert.equal(result.generated, true)
  assert.match(result.reason, /frontmatter/)
})

test('accepts an ordinary document that mentions a skill name', () => {
  const result = classifyGeneratedSkill({
    path: 'docs/contributing.md',
    content: 'Run the `openspec-propose` skill.',
  })
  assert.equal(result.generated, false)
})
