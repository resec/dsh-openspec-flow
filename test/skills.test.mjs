import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  GENERATED_BY,
  SKILL_NAMES,
  packagedSkillPath,
  parseFrontmatter,
} from '../lib/skills.js'
import { PINNED_CLI_VERSION } from '../lib/openspec.js'

/** The `metadata.upstream` value the bundled CLI pin implies. */
const UPSTREAM = `openspec@${PINNED_CLI_VERSION}`

test('parses frontmatter name, description and metadata', () => {
  const parsed = parseFrontmatter([
    '---',
    'name: openspec-apply-change',
    'description: Apply a change.',
    'metadata:',
    '  generatedBy: dsh-openspec-flow@0.1.0',
    '  upstream: openspec@2.0.0',
    '---',
    '',
    '# Body',
  ].join('\n'))
  assert.equal(parsed.name, 'openspec-apply-change')
  assert.equal(parsed.description, 'Apply a change.')
  assert.equal(parsed.metadata.generatedBy, 'dsh-openspec-flow@0.1.0')
  assert.equal(parsed.metadata.upstream, 'openspec@2.0.0')
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
    assert.equal(parsed.metadata.upstream, UPSTREAM, name)
    assert.match(raw, /openspec_[a-z_]+/, name)
    assert.doesNotMatch(raw, /\bCLI\b/i, `${name} must not mention the CLI`)
    assert.doesNotMatch(raw.replaceAll('/opsx-admin', ''), /\bopsx\b/i, `${name} must not name an alias command`)
    assert.doesNotMatch(raw, /`openspec`/, `${name} must not name a bare openspec command`)
    assert.doesNotMatch(raw, /^## Command map/m, `${name} must not carry a command map`)
    assert.doesNotMatch(
      raw,
      /`openspec (list|show|validate|instructions|status|archive|new|init|update|store|context|schemas)\b/,
      `${name} must not name a CLI command`,
    )
    assert.doesNotMatch(raw, /maxRounds|round cap/i, `${name} must not mention a round cap`)
  }
})

test('review skills report through the plugin card without restating the report', () => {
  for (const name of ['openspec-propose', 'openspec-apply-change']) {
    const raw = readFileSync(packagedSkillPath(name), 'utf8')
    assert.match(raw, /reported by the plugin card/, name)
    assert.match(raw, /in the reviewer session for an independent review/, name)
    assert.match(raw, /in the changer session for a self review/, name)
    assert.match(raw, /does not show a review card in the changer session/, name)
    assert.doesNotMatch(raw, /in the main session when the changer/, name)
    assert.match(raw, /Do not restate findings/, name)
    assert.match(raw, /one short note only for information the report cannot express/, name)
  }
})

test('the propose skill reads existing specs before proposing', () => {
  const propose = readFileSync(packagedSkillPath('openspec-propose'), 'utf8')
  assert.match(propose, /specs: true/)
  assert.match(propose, /noScenarios: true/)
  assert.match(propose, /type: "spec"/)
  assert.match(propose, /surface the conflict/)
  assert.match(propose, /existing specs the change touches/)
})

test('the apply skill verifies the whole paragraph of a wrapped task', () => {
  const applySkill = readFileSync(packagedSkillPath('openspec-apply-change'), 'utf8')
  assert.match(applySkill, /checkbox's whole paragraph at `next\.sourcePath` and `next\.line`/)
  assert.match(applySkill, /a task that wraps onto following lines reads as one paragraph/)
  assert.doesNotMatch(applySkill, /Verify the checkbox at /)
})

test('the explore skill reads relevant specs in full', () => {
  const explore = readFileSync(packagedSkillPath('openspec-explore'), 'utf8')
  assert.match(explore, /only an overview/)
  assert.match(explore, /read every relevant spec in full/)
  assert.match(explore, /type: "spec"/)
  assert.match(explore, /noScenarios: true/)
})

test('skills route gated tools through the admin command', () => {
  for (const name of ['openspec-explore', 'openspec-propose', 'openspec-apply-change']) {
    const raw = readFileSync(packagedSkillPath(name), 'utf8')
    assert.match(raw, /\/opsx-admin/, name)
  }
  assert.match(readFileSync(packagedSkillPath('openspec-explore'), 'utf8'), /management tool/)
  assert.match(readFileSync(packagedSkillPath('openspec-propose'), 'utf8'), /\/opsx-admin init/)
  assert.match(readFileSync(packagedSkillPath('openspec-apply-change'), 'utf8'), /\/opsx-admin init/)
})

test('the propose skill runs the draft review before presenting', () => {
  const propose = readFileSync(packagedSkillPath('openspec-propose'), 'utf8')
  assert.match(propose, /## Draft review/)
  assert.match(propose, /openspec_review/)
  assert.match(propose, /action: "start"/)
  assert.match(propose, /self-report/)
  assert.match(propose, /reviewers: 0/)
  assert.match(propose, /requirement-length gate/)
  assert.match(propose, /execution preflight/)
  assert.match(propose, /another unarchived change/)
  assert.match(propose, /do not call `dispose`/)
  assert.match(propose, /Do not present the proposal while a blocker is open/)
})

test('the propose and apply skills dispose findings in one batch', () => {
  const propose = readFileSync(packagedSkillPath('openspec-propose'), 'utf8')
  const apply = readFileSync(packagedSkillPath('openspec-apply-change'), 'utf8')
  for (const [name, text] of [['propose', propose], ['apply', apply]]) {
    assert.match(text, /`dispositions`/, name)
    assert.match(text, /single `openspec_review` call/, name)
    assert.match(text, /single `id` form/, name)
    assert.match(text, /action: "dispose"/, name)
    assert.match(text, /finding `action: "waive"`/, name)
    assert.match(text, /`start` and `resume` reject `dispositions`/, name)
  }
  assert.match(apply, /`scope: "plan-change"`/)
  assert.match(apply, /not `dispositions`/)
})

test('the apply and archive skills run the apply review', () => {
  const apply = readFileSync(packagedSkillPath('openspec-apply-change'), 'utf8')
  assert.match(apply, /## Apply review/)
  assert.match(apply, /review: "apply"/)
  assert.match(apply, /self-report/)
  assert.match(apply, /available/)
  assert.match(apply, /policy/)
  assert.match(apply, /locks or migrates/)
  assert.match(apply, /disables apply review/)
  const archive = readFileSync(packagedSkillPath('openspec-archive-change'), 'utf8')
  assert.match(archive, /openspec_review/)
  assert.match(archive, /review: "apply"/)
  assert.match(archive, /no apply review/)
  assert.match(archive, /available/)
  assert.match(archive, /policy/)
  assert.match(archive, /enabled/)
})

/**
 * Extract one review section from a packaged skill.
 * @param text - skill text.
 * @param heading - exact section heading.
 * @returns the section body without the heading and the next heading.
 */
function reviewSection(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.trim() === heading)
  assert.ok(start >= 0, `missing ${heading}`)
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line))
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n')
}

/**
 * Report the action clauses that do not carry the expected review kind.
 *
 * A clause runs from one `action: "..."` occurrence to the next, so a clause
 * cannot borrow the kind that belongs to the clause after it.
 * @param section - review section body.
 * @param kind - expected review kind.
 * @returns the action names whose clause omits the kind.
 */
function unqualifiedActions(section, kind) {
  const occurrences = [...section.matchAll(/`action: "([a-z-]+)"`/g)]
  const missing = []
  for (const [index, match] of occurrences.entries()) {
    const next = occurrences[index + 1]
    const clause = section.slice(match.index, next === undefined ? undefined : next.index)
    if (!clause.includes(`review: "${kind}"`)) missing.push(match[1])
  }
  return missing
}

test('the shipped skills name the review kind at every review action', () => {
  const propose = readFileSync(packagedSkillPath('openspec-propose'), 'utf8')
  const apply = readFileSync(packagedSkillPath('openspec-apply-change'), 'utf8')
  assert.deepEqual(unqualifiedActions(reviewSection(propose, '## Draft review'), 'draft'), [])
  assert.deepEqual(unqualifiedActions(reviewSection(apply, '## Apply review'), 'apply'), [])

  const needle = '`action: "dispose"` and `review: "draft"`'
  assert.ok(propose.includes(needle), 'the propose skill keeps the dispose clause')
  const broken = propose.replace(needle, '`action: "dispose"`')
  assert.deepEqual(
    unqualifiedActions(reviewSection(broken, '## Draft review'), 'draft'),
    ['dispose'],
  )
})
