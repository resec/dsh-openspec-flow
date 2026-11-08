import assert from 'node:assert/strict'
import test from 'node:test'
import {
  projectContext,
  projectInstructions,
  projectSchemas,
  projectShow,
  projectSpecList,
  projectStoreList,
  projectValidationReport,
} from '../lib/state.js'

const ROOT = { path: '/project', source: 'nearest' }

test('projectSpecList keeps setup, root and requirement counts', () => {
  const result = projectSpecList({
    specs: [{ id: 'theme', requirementCount: 2 }],
    root: ROOT,
  })
  assert.equal(result.setup, true)
  assert.deepEqual(result.root, ROOT)
  assert.deepEqual(result.specs, [{ id: 'theme', requirementCount: 2 }])
})

test('projectInstructions keeps the instruction and drops path internals', () => {
  const result = projectInstructions({
    changeName: 'add-dark-mode',
    artifactId: 'proposal',
    schemaName: 'spec-driven',
    changeDir: '/project/openspec/changes/add-dark-mode',
    planningHome: { kind: 'repo', root: '/project', changesDir: '/project/openspec/changes' },
    outputPath: 'proposal.md',
    resolvedOutputPath: '/project/openspec/changes/add-dark-mode/proposal.md',
    existingOutputPaths: ['/project/openspec/changes/add-dark-mode/proposal.md'],
    description: 'Initial proposal',
    instruction: 'Write the proposal.',
    template: 'template',
    dependencies: [],
    unlocks: ['specs'],
    root: ROOT,
  }, 'proposal')
  assert.equal(result.change, 'add-dark-mode')
  assert.equal(result.artifact, 'proposal')
  assert.equal(result.instruction, 'Write the proposal.')
  assert.equal(result.outputPath, 'proposal.md')
  assert.equal(result.resolvedOutputPath, 'openspec/changes/add-dark-mode/proposal.md')
  assert.deepEqual(result.existingOutputPaths, ['openspec/changes/add-dark-mode/proposal.md'])
  assert.deepEqual(result.dependencies, [])
  assert.deepEqual(result.unlocks, ['specs'])
  assert.equal(result.changeDir, undefined)
  assert.equal(result.planningHome, undefined)
  assert.equal(result.template, undefined)
})

test('maps CLI fragments in instruction text without touching paths', () => {
  const result = projectInstructions({
    changeName: 'x',
    artifactId: 'proposal',
    schemaName: 'spec-driven',
    outputPath: 'proposal.md',
    instruction: 'Run `openspec list --specs` then `openspec show "<spec-id>" --type spec --json --no-scenarios` and `openspec validate --strict`. Read openspec/specs/<id>/spec.md.',
    dependencies: [],
    unlocks: [],
    root: ROOT,
  }, 'proposal')
  assert.match(result.instruction, /openspec_list/)
  assert.match(result.instruction, /openspec_show/)
  assert.match(result.instruction, /openspec_validate/)
  assert.match(result.instruction, /openspec\/specs/)
  assert.doesNotMatch(result.instruction, /`openspec (list|show|validate|instructions)/)
})

test('projectInstructions carries configured context and rules', () => {
  const result = projectInstructions({
    changeName: 'c',
    artifactId: 'proposal',
    schemaName: 'spec-driven',
    outputPath: 'proposal.md',
    instruction: 'Write it.',
    context: 'Follow the project glossary.',
    rules: ['Keep it under one page.', 'State what is out of scope.'],
    dependencies: [],
    unlocks: [],
    root: ROOT,
  }, 'proposal')
  assert.equal(result.context, 'Follow the project glossary.')
  assert.deepEqual(result.rules, ['Keep it under one page.', 'State what is out of scope.'])
  assert.equal(result.instruction, 'Write it.')
})

test('projectInstructions omits blank context and rules', () => {
  const result = projectInstructions({
    changeName: 'c',
    artifactId: 'proposal',
    schemaName: 'spec-driven',
    outputPath: 'proposal.md',
    instruction: 'Write it.',
    context: '   ',
    rules: ['', '  '],
    dependencies: [],
    unlocks: [],
    root: ROOT,
  }, 'proposal')
  assert.equal(result.context, undefined)
  assert.equal(result.rules, undefined)
})

test('projectInstructions returns archive operation inputs', () => {
  const result = projectInstructions({
    changeName: 'c',
    context: 'Follow the project glossary.',
    operationGuidance: ['Summarize the archive outcome.', '  '],
    root: ROOT,
  }, 'archive')
  assert.deepEqual(result, {
    change: 'c',
    artifact: 'archive',
    context: 'Follow the project glossary.',
    guidance: ['Summarize the archive outcome.'],
    root: ROOT,
  })
  assert.equal(result.instruction, undefined)
  assert.equal(result.outputPath, undefined)
  assert.equal(result.dependencies, undefined)
})

test('projectInstructions returns only archive identity without configuration', () => {
  const result = projectInstructions({ changeName: 'c', root: ROOT }, 'archive')
  assert.deepEqual(result, { change: 'c', artifact: 'archive', root: ROOT })
  assert.equal(result.context, undefined)
  assert.equal(result.guidance, undefined)
})

test('projectInstructions omits the archive root when the payload has none', () => {
  const result = projectInstructions({ changeName: 'c' }, 'archive')
  assert.deepEqual(result, { change: 'c', artifact: 'archive' })
})

test('projectShow distinguishes a spec from a change', () => {
  const spec = projectShow({
    id: 'theme',
    title: 'Theme',
    overview: 'Theme capability.',
    requirementCount: 1,
    requirements: [{
      name: 'Theme selection',
      text: 'The app SHALL let users choose a theme.',
      scenarios: [{ name: 'Toggle', rawText: '- WHEN toggled\n- THEN dark' }],
    }],
    metadata: { version: '1.0.0' },
    root: ROOT,
  })
  assert.equal(spec.kind, 'spec')
  assert.equal(spec.name, 'theme')
  assert.equal(spec.requirements[0].scenarios[0].name, 'Toggle')
  assert.equal(spec.metadata, undefined)

  const change = projectShow({
    id: 'add-dark-mode',
    title: 'Add dark mode',
    deltaCount: 1,
    deltas: [{
      spec: 'theme',
      operation: 'ADDED',
      requirement: { name: 'Theme selection', text: '...', scenarios: [] },
      requirements: [{ name: 'Theme selection', text: '...', scenarios: [] }],
    }],
    root: ROOT,
  })
  assert.equal(change.kind, 'change')
  assert.equal(change.deltaCount, 1)
  assert.equal(change.deltas[0].operation, 'ADDED')
  assert.equal(change.deltas[0].requirement, undefined)
})

test('projectContext keeps setup and projects diagnostics', () => {
  const present = projectContext({ root: { path: '/project', source: 'nearest', role: 'root' }, members: [], status: [] })
  assert.equal(present.setup, true)
  assert.equal(present.root.role, undefined)
  assert.equal(present.root.store_id, undefined)

  const missing = projectContext({
    root: null,
    members: [],
    status: [{ code: 'no_openspec_root', message: 'no root', fix: 'Create a root first.' }],
  })
  assert.equal(missing.setup, false)
  assert.equal(missing.root, undefined)
  assert.deepEqual(missing.status, [{
    code: 'no_openspec_root',
    message: 'no root',
    fix: 'Create a root first.',
  }])
})

test('projectContext keeps store identity and turns member fetch into a tool action', () => {
  const result = projectContext({
    root: { path: '/stores/team', source: 'store', store_id: 'team', role: 'openspec_root' },
    members: [
      {
        role: 'referenced_store',
        id: 'docs',
        path: '/stores/docs',
        status: [],
      },
      {
        role: 'referenced_store',
        id: 'gone',
        status: [{
          severity: 'warning',
          code: 'reference_unresolved',
          message: 'Referenced store is not registered.',
          target: 'references',
          fix: 'Register the store first.',
        }],
      },
    ],
    status: [{
      severity: 'error',
      code: 'no_openspec_root',
      message: 'No root.',
      target: 'openspec.root',
      fix: 'Create a root first.',
    }],
  })

  assert.deepEqual(result.root, { path: '/stores/team', source: 'store', store_id: 'team' })
  assert.deepEqual(result.members[0].fetch, {
    tool: 'openspec_show',
    arguments: { type: 'spec', store: 'docs' },
    note: 'Set name to a spec id from this store; openspec_list with specs: true and the same store lists them.',
  })
  assert.deepEqual(result.members[0].status, [])
  assert.equal(result.members[1].path, undefined)
  assert.equal(result.members[1].fetch, undefined)
  assert.deepEqual(result.members[1].status, [{
    severity: 'warning',
    code: 'reference_unresolved',
    message: 'Referenced store is not registered.',
    fix: 'Register the store first.',
  }])
  assert.deepEqual(result.status, [{
    severity: 'error',
    code: 'no_openspec_root',
    message: 'No root.',
    fix: 'Create a root first.',
  }])
  assert.doesNotMatch(JSON.stringify(result), /openspec show/)
})

test('projectSchemas projects the schema list', () => {
  const result = projectSchemas([{
    name: 'spec-driven',
    description: 'Default',
    artifacts: ['proposal', 'specs'],
    source: 'package',
    version: 1,
  }])
  assert.deepEqual(result.schemas, [{
    name: 'spec-driven',
    description: 'Default',
    artifacts: ['proposal', 'specs'],
    source: 'package',
  }])
})

test('projectStoreList maps snake_case metadata', () => {
  const result = projectStoreList({
    stores: [{ id: 'team', root: '/stores/team', metadata_path: '/stores/team/.openspec-store.yaml' }],
    status: [],
  })
  assert.deepEqual(result.stores, [{
    id: 'team',
    root: '/stores/team',
    metadataPath: '/stores/team/.openspec-store.yaml',
  }])
})

test('projectValidationReport marks a mixed report invalid', () => {
  const result = projectValidationReport({
    items: [
      { id: 'theme', type: 'spec', valid: true, issues: [] },
      { id: 'broken', type: 'change', valid: false, issues: [{ level: 'ERROR', path: 'x', message: 'bad' }] },
    ],
    root: ROOT,
  }, 'all')
  assert.equal(result.scope, 'all')
  assert.equal(result.valid, false)
  assert.equal(result.items[1].issues[0].level, 'ERROR')
})
