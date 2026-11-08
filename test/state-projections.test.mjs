import assert from 'node:assert/strict'
import test from 'node:test'
import {
  projectApply,
  projectArchive,
  projectContext,
  projectInstructions,
  projectList,
  projectMark,
  projectNewChange,
  projectPath,
  projectSchemas,
  projectShow,
  projectSpecList,
  projectStatus,
  projectStoreList,
  projectSupportedSchemas,
  projectValidate,
  projectValidationReport,
} from '../lib/state.js'

test('projectPath makes project paths relative and keeps outside paths', () => {
  assert.equal(projectPath('/project', '/project'), '.')
  assert.equal(
    projectPath('/project', '/project/openspec/changes/c/tasks.md'),
    'openspec/changes/c/tasks.md',
  )
  assert.equal(projectPath('/project', '/project2/file.md'), '/project2/file.md')
  assert.equal(projectPath('/project', '/elsewhere/file.md'), '/elsewhere/file.md')
  assert.equal(projectPath('/project', 'openspec/changes/c/tasks.md'), 'openspec/changes/c/tasks.md')
  assert.equal(projectPath('/project', ''), '')
  assert.equal(projectPath('', '/project/file.md'), '/project/file.md')
  assert.equal(projectPath('/project', undefined), undefined)
})

test('projectApply projects context files and the next source relative to the root', () => {
  const result = projectApply({
    projectRoot: '/project',
    tasks: [{
      id: '1.1',
      description: 'one',
      done: false,
      sourcePath: '/project/openspec/changes/c/tasks.md',
      line: 3,
      numericId: '1.1',
    }],
    payload: {
      changeName: 'c',
      schemaName: 'spec-driven',
      state: 'ready',
      progress: { total: 1, complete: 0, remaining: 1 },
      contextFiles: { tasks: ['/project/openspec/changes/c/tasks.md'] },
      root: { path: '/project', source: 'nearest' },
    },
  })
  assert.equal(result.next.sourcePath, 'openspec/changes/c/tasks.md')
  assert.deepEqual(result.contextFiles, { tasks: ['openspec/changes/c/tasks.md'] })
  assert.deepEqual(result.root, { path: '/project', source: 'nearest' })
})

test('projectMark projects the next source relative to the root', () => {
  const result = projectMark({
    projectRoot: '/project',
    tasks: [{
      id: '1.2',
      description: 'two',
      done: false,
      sourcePath: '/project/openspec/changes/c/tasks.md',
      line: 4,
      numericId: '1.2',
    }],
    payload: {
      changeName: 'c',
      state: 'ready',
      progress: { total: 2, complete: 1, remaining: 1 },
      root: { path: '/project', source: 'nearest' },
    },
  }, { status: 'flipped' }, '1.1')
  assert.equal(result.next.sourcePath, 'openspec/changes/c/tasks.md')
  assert.equal(result.root, undefined)
})

test('projectApply reports an empty root source when the payload has none', () => {
  const result = projectApply({
    projectRoot: '/project',
    tasks: [],
    payload: { changeName: 'c', schemaName: 's', state: 'ready', progress: {} },
  })
  assert.deepEqual(result.root, { path: '/project', source: '' })
})

test('projectNewChange and projectArchive project paths relative to the root', () => {
  const created = projectNewChange({
    change: {
      id: 'c',
      path: '/project/openspec/changes/c',
      metadataPath: '/project/openspec/changes/c/.openspec.yaml',
      schema: 'spec-driven',
    },
    root: { path: '/project', source: 'nearest' },
  }, '/project', 'c')
  assert.equal(created.change.path, 'openspec/changes/c')
  assert.equal(created.change.metadataPath, 'openspec/changes/c/.openspec.yaml')
  assert.deepEqual(created.root, { path: '/project', source: 'nearest' })

  const minimal = projectNewChange({ change: {} }, '', 'fallback')
  assert.equal(minimal.change.id, 'fallback')
  assert.equal(minimal.change.path, '')
  assert.equal(minimal.change.metadataPath, '')
  assert.equal(minimal.root, undefined)

  const archived = projectArchive({
    archive: {
      archivedAs: 'archive/c',
      path: '/project/openspec/changes/archive/c',
      specsUpdated: true,
      totals: { added: 1 },
      warnings: ['w'],
    },
  }, 'c', '/project', 'nearest')
  assert.equal(archived.path, 'openspec/changes/archive/c')
  assert.equal(archived.specsUpdated, true)
  assert.deepEqual(archived.totals, { added: 1 })
  assert.deepEqual(archived.warnings, ['w'])
  assert.deepEqual(archived.root, { path: '/project', source: 'nearest' })

  const empty = projectArchive({ archive: {} }, 'c', '', '')
  assert.equal(empty.path, '')
  assert.equal(empty.specsUpdated, false)
  assert.equal(empty.totals, undefined)
  assert.equal(empty.warnings, undefined)
  assert.equal(empty.root, undefined)
})

test('projectApply handles an empty next task and absent optional fields', () => {
  const minimal = projectApply({
    tasks: [],
    payload: { changeName: 'c', schemaName: 's', state: 'ready', progress: {} },
  })
  assert.equal(minimal.next, undefined)
  assert.deepEqual(minimal.contextFiles, {})
  assert.equal(minimal.instruction, undefined)
  assert.equal(minimal.missingArtifacts, undefined)
  assert.equal(minimal.warnings, undefined)

  const full = projectApply({
    tasks: [{ id: '1.1', description: 'one', done: false, sourcePath: 'x', line: 1, numericId: '1.1' }],
    payload: {
      changeName: 'c',
      schemaName: 's',
      state: 'ready',
      progress: { total: 1, complete: 0, remaining: 1 },
      contextFiles: { tasks: ['a', 2], docs: 'not-an-array' },
      instruction: '',
      missingArtifacts: [],
      warnings: ['w'],
    },
  })
  assert.deepEqual(full.contextFiles, { tasks: ['a'] })
  assert.equal(full.instruction, undefined)
  assert.deepEqual(full.warnings, ['w'])
})

test('projectApply normalizes malformed contextFiles', () => {
  for (const contextFiles of [null, [], 'text', { tasks: null }]) {
    const result = projectApply({ tasks: [], payload: { contextFiles } })
    assert.deepEqual(result.contextFiles, {})
  }
})

test('projectMark projects a missing next task', () => {
  const result = projectMark(
    { tasks: [], payload: { changeName: 'c', state: 'ready', progress: {} } },
    { results: [{ id: '1.1', status: 'flipped' }] },
  )
  assert.deepEqual(result.results, [{ id: '1.1', status: 'flipped' }])
  assert.equal(result.next, undefined)
})

test('projectStatus handles missing optional sections', () => {
  const result = projectStatus({ changeName: 'c', schemaName: 's' })
  assert.deepEqual(result, {
    change: 'c',
    schema: 's',
    changeRoot: '',
    isPlanningComplete: false,
    isComplete: false,
    applyRequires: [],
    artifacts: [],
  })
})

test('projectStatus projects every optional section', () => {
  const result = projectStatus({
    changeName: 'c',
    schemaName: 's',
    changeRoot: '/changes/c',
    planningHome: { root: '/home' },
    isPlanningComplete: true,
    isComplete: true,
    applyRequires: ['tasks'],
    artifacts: [{ id: 'a', status: 'done' }, { id: 'b', status: 'ready', requires: ['a'] }],
    actionContext: {
      mode: 'repo-local',
      sourceOfTruth: 'repo',
      allowedEditRoots: ['/root'],
      requiresAffectedAreaSelection: false,
      constraints: ['c1'],
    },
    nextSteps: ['Run openspec instructions apply --change "c" --json'],
    root: { path: '/root', source: 'nearest' },
  })
  assert.equal(result.planningHome, '/home')
  assert.equal(result.changeRoot, '/changes/c')
  assert.deepEqual(result.actionContext.allowedEditRoots, ['.'])
  assert.deepEqual(result.artifacts[0].requires, [])
  assert.deepEqual(result.artifacts[1].requires, ['a'])
  assert.equal(result.actionContext.mode, 'repo-local')
  assert.equal(result.blockedBy, undefined)
  assert.deepEqual(result.nextSteps, [
    { tool: 'openspec_apply_next', arguments: { change: 'c' } },
  ])
  assert.deepEqual(result.root, { path: '/root', source: 'nearest' })
})

test('projectStatus names ready artifacts and their instruction action', () => {
  const result = projectStatus({
    changeName: 'c',
    schemaName: 's',
    isPlanningComplete: false,
    artifacts: [
      { id: 'proposal', status: 'done' },
      { id: 'specs', status: 'ready', requires: ['proposal'] },
      { id: 'design', status: 'ready', requires: ['proposal'] },
      { id: 'tasks', status: 'blocked', requires: ['specs', 'design'] },
    ],
    nextSteps: ['Run openspec instructions specs --change "c" --json'],
  })
  assert.deepEqual(result.blockedBy, ['specs', 'design'])
  assert.deepEqual(result.nextSteps, [
    { tool: 'openspec_instructions', arguments: { change: 'c', artifact: 'specs' } },
  ])
})

test('projectStatus carries an explicit store into every next step', () => {
  const incomplete = projectStatus({
    changeName: 'c',
    schemaName: 's',
    isPlanningComplete: false,
    artifacts: [{ id: 'design', status: 'ready' }],
  }, { store: 's1' })
  assert.deepEqual(incomplete.blockedBy, ['design'])
  assert.deepEqual(incomplete.nextSteps, [
    { tool: 'openspec_instructions', arguments: { change: 'c', artifact: 'design', store: 's1' } },
  ])

  const complete = projectStatus({
    changeName: 'c',
    schemaName: 's',
    isPlanningComplete: true,
    artifacts: [{ id: 'tasks', status: 'done' }],
  }, { store: 's1' })
  assert.deepEqual(complete.nextSteps, [
    { tool: 'openspec_apply_next', arguments: { change: 'c', store: 's1' } },
  ])
})

test('projectStatus omits next steps when planning is incomplete without a ready artifact', () => {
  const result = projectStatus({
    changeName: 'c',
    schemaName: 's',
    isPlanningComplete: false,
    artifacts: [{ id: 'tasks', status: 'blocked', requires: ['design'] }],
    nextSteps: ['Run openspec instructions design --change "c" --json'],
  })
  assert.equal(result.blockedBy, undefined)
  assert.equal(result.nextSteps, undefined)
})

test('projectStatus projects root-internal paths relative to the root', () => {
  const result = projectStatus({
    changeName: 'c',
    schemaName: 'spec-driven',
    changeRoot: '/project/openspec/changes/c',
    planningHome: { root: '/project' },
    actionContext: { allowedEditRoots: ['/project', '/project/openspec'] },
    root: { path: '/project', source: 'nearest' },
  })
  assert.equal(result.changeRoot, 'openspec/changes/c')
  assert.equal(result.planningHome, '.')
  assert.deepEqual(result.actionContext.allowedEditRoots, ['.', 'openspec'])
})

test('projectStatus skips absent optional sections', () => {
  const result = projectStatus({
    changeName: 'c',
    schemaName: 's',
    artifacts: [{}],
    actionContext: {},
    planningHome: {},
    root: null,
  })
  assert.deepEqual(result.artifacts, [{ id: 'undefined', status: 'undefined', requires: [] }])
  assert.equal(result.actionContext, undefined)
  assert.equal(result.planningHome, undefined)
  assert.equal(result.root, undefined)
})

test('projectStatus rejects an unexpected payload', () => {
  assert.throws(() => projectStatus({}), /unexpected payload/)
})

test('projectList handles an absent root and status messages', () => {
  const result = projectList({
    root: null,
    status: [{ message: 'no root' }, {}, { message: 3 }],
  })
  assert.equal(result.setup, false)
  assert.equal(result.issue, 'no root')
  assert.deepEqual(result.changes, [])
})

test('projectList tolerates malformed changes', () => {
  const result = projectList({
    root: { path: '/root', source: 'nearest' },
    changes: [{}, { name: 'n', completedTasks: '2', totalTasks: 3, status: 'ready' }],
  })
  assert.equal(result.setup, true)
  assert.deepEqual(result.changes, [
    { name: 'undefined', completedTasks: 0, totalTasks: 0, status: 'undefined' },
    { name: 'n', completedTasks: 2, totalTasks: 3, status: 'ready' },
  ])
  assert.equal(result.issue, undefined)
})

test('projectSpecList handles an absent root and malformed specs', () => {
  const result = projectSpecList({
    root: null,
    status: [{ message: 'no root' }],
    specs: [{}],
  })
  assert.equal(result.setup, false)
  assert.equal(result.issue, 'no root')
  assert.deepEqual(result.specs, [{ id: 'undefined', requirementCount: 0 }])
})

test('projectContext handles missing arrays and mixed status items', () => {
  const result = projectContext({ status: [{ message: 'm' }, 'plain', null, { message: '' }] })
  assert.equal(result.setup, false)
  assert.deepEqual(result.members, [])
  assert.deepEqual(result.status, ['m', 'plain', 'null'])
})

test('projectSchemas handles a non-array payload and missing fields', () => {
  assert.deepEqual(projectSchemas(null), { schemas: [] })
  assert.deepEqual(projectSchemas([{}]), { schemas: [{ name: '', description: '', artifacts: [], source: '' }] })
  assert.deepEqual(projectSchemas([{ name: 'x', artifacts: 'no' }]), {
    schemas: [{ name: 'x', description: '', artifacts: [], source: '' }],
  })
})

test('projectSupportedSchemas keeps only the package spec-driven entry', () => {
  const result = projectSupportedSchemas([
    { name: 'spec-driven', description: 'Default', artifacts: ['proposal'], source: 'package' },
    { name: 'spec-driven', description: 'Shadow', artifacts: ['proposal'], source: 'project' },
    { name: 'custom', description: 'Custom', artifacts: ['plan'], source: 'project' },
  ])
  assert.deepEqual(result, {
    schemas: [{ name: 'spec-driven', description: 'Default', artifacts: ['proposal'], source: 'package' }],
  })
  assert.deepEqual(projectSupportedSchemas(null), { schemas: [] })
})

test('projectStoreList handles missing stores and absent metadata', () => {
  assert.deepEqual(projectStoreList({}), { stores: [], status: [] })
  assert.deepEqual(projectStoreList({ stores: [{}], status: [{}] }), {
    stores: [{ id: '', root: '' }],
    status: ['[object Object]'],
  })
})

test('projectShow handles a minimal spec and missing requirement fields', () => {
  const spec = projectShow({ id: 's', requirements: [{}] })
  assert.equal(spec.kind, 'spec')
  assert.deepEqual(spec.requirements, [{ name: '', text: '', scenarios: [] }])
  assert.equal(spec.root, undefined)

  const scenario = projectShow({
    id: 's',
    requirements: [{ scenarios: [{}, { name: 'n' }] }],
  })
  assert.deepEqual(scenario.requirements[0].scenarios[0], { name: '' })
})

test('projectShow handles a minimal change and missing delta fields', () => {
  const change = projectShow({ id: 'c', deltas: [{}] })
  assert.equal(change.kind, 'change')
  assert.deepEqual(change.deltas, [{ spec: '', operation: '', requirements: [] }])
  assert.equal(change.root, undefined)
})

test('projectInstructions handles missing fields and non-array lists', () => {
  const result = projectInstructions({
    existingOutputPaths: ['a', 1],
    instruction: 'Use `openspec list`.',
    dependencies: 'no',
    unlocks: null,
    root: null,
  }, 'proposal')
  assert.deepEqual(result.existingOutputPaths, ['a'])
  assert.match(result.instruction, /openspec_list/)
  assert.deepEqual(result.dependencies, [])
  assert.deepEqual(result.unlocks, [])
  assert.equal(result.resolvedOutputPath, undefined)
  assert.equal(result.root, undefined)
})

test('projectValidationReport handles empty and malformed items', () => {
  assert.deepEqual(projectValidationReport({}, 'all'), { scope: 'all', valid: true, items: [] })
  const result = projectValidationReport({
    items: [{}],
    root: null,
  }, 'all')
  assert.equal(result.valid, false)
  assert.deepEqual(result.items, [{ id: '', type: '', valid: false, issues: [] }])
  assert.equal(result.root, undefined)
})

test('projectValidate falls back to the first item and rejects an empty list', () => {
  const result = projectValidate({ items: [{ id: 'other' }] }, 'missing')
  assert.equal(result.change, 'other')
  assert.equal(result.valid, false)
  assert.deepEqual(result.issues, [])
  assert.throws(() => projectValidate({ items: [] }, 'missing'), /did not return an item/)
})

test('projectList and projectSpecList tolerate a non-array status', () => {
  const list = projectList({ root: null, status: null, changes: [] })
  assert.equal(list.issue, undefined)
  const specs = projectSpecList({ root: null, status: null, specs: [] })
  assert.equal(specs.issue, undefined)
  assert.deepEqual(projectSpecList({ root: null }).specs, [])
})

test('projectShow tolerates absent arrays', () => {
  const spec = projectShow({})
  assert.equal(spec.kind, 'spec')
  assert.deepEqual(spec.requirements, [])
  const change = projectShow({ deltas: [] })
  assert.equal(change.kind, 'change')
  assert.deepEqual(change.deltas, [])
})

test('projectInstructions defaults every absent field', () => {
  const result = projectInstructions({}, 'proposal')
  assert.equal(result.change, '')
  assert.equal(result.artifact, 'proposal')
  assert.equal(result.schema, '')
  assert.equal(result.outputPath, '')
  assert.deepEqual(result.existingOutputPaths, [])
  assert.equal(result.description, '')
  assert.equal(result.instruction, '')
  assert.deepEqual(result.dependencies, [])
  assert.deepEqual(result.unlocks, [])
  assert.equal(result.root, undefined)
})

test('projectValidationReport and projectValidate default missing issue fields', () => {
  const report = projectValidationReport({ items: [{ id: 'x', issues: [{}] }] }, 'all')
  assert.deepEqual(report.items[0].issues, [{ level: '', path: '', message: '' }])
  const validate = projectValidate({ items: [{ id: 'x', issues: [{}] }] }, 'x')
  assert.deepEqual(validate.issues, [{ level: '', path: '', message: '' }])
  assert.equal(projectValidate({ items: [{}] }, 'x').change, 'x')
  assert.throws(() => projectValidate({}, 'x'), /did not return an item/)
})

test('projectContext tolerates an absent status array', () => {
  const result = projectContext({})
  assert.equal(result.setup, false)
  assert.deepEqual(result.members, [])
  assert.deepEqual(result.status, [])
})
