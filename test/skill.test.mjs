import assert from 'node:assert/strict'
import test from 'node:test'
import { withStore } from '../lib/openspec.js'
import { loadSkillDocument, parseSkillDocument } from '../lib/skill.js'

test('withStore appends the flag only when a store is selected', () => {
  const args = ['list', '--json']
  assert.deepEqual(withStore(args, 'team'), ['list', '--json', '--store', 'team'])
  assert.deepEqual(withStore(args, '  '), args)
  assert.deepEqual(withStore(args, undefined), args)
})

test('the shipped skill document is valid and describes the tool loop', () => {
  const document = loadSkillDocument()
  assert.equal(document.name, 'openspec-flow')
  assert.ok(document.description.length <= 500)
  assert.match(document.description, /OpenSpec/)
  assert.match(document.content, /openspec_apply_next/)
  assert.match(document.content, /openspec_mark_task_done/)
  assert.match(document.content, /openspec_validate/)
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
