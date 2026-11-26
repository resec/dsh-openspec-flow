/**
 * Reviewer model resolution, locking and availability.
 *
 * The model catalog is a stub unless a test is about the catalog itself, so
 * each assertion names one refusal rather than a chain of failures.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  assertReviewerModelAvailable,
  lockReviewerModel,
  modelResolver,
  policyReviewerModel,
  resolveInheritedModel,
  reviewerAgentOptions,
  selectionOf,
} from '../lib/review/model.js'
import { ensureReviewerModel, readPolicy } from '../lib/review/policy.js'
import { writeJsonAtomic } from '../lib/review/store.js'
import { createFakeContext } from './fake-context.mjs'

/** Build one parsed review document for a model migration test. */
function configOf(overrides = {}) {
  const section = (extra = {}) => ({
    enabled: true,
    reviewers: 0,
    waitMinutes: 15,
    reviewerModel: { source: 'inherit' },
    ...extra,
  })
  return { draft: section(overrides.draft), apply: section(overrides.apply) }
}

/**
 * A context carrying only the services the model module reads.
 * @param options - default selection and agent selection.
 * @returns the context and the initiating agent.
 */
function contextWith({ defaultSelection, agentSelection } = {}) {
  const ctx = {
    get(name) {
      if (name !== 'agentDefaultModel') return undefined
      return { currentSelection: () => defaultSelection }
    },
  }
  const agent = {
    model: {
      current: () => agentSelection,
    },
  }
  return { ctx, agent }
}

test('selectionOf detaches a complete route and rejects a partial one', () => {
  assert.deepEqual(selectionOf({ provider: 'p', model: 'm', reasoningEffort: 'max' }), {
    provider: 'p', model: 'm', reasoningEffort: 'max',
  })
  assert.deepEqual(selectionOf({ provider: ' p ', model: ' m ' }), { provider: 'p', model: 'm' })
  assert.equal(selectionOf({ provider: 'p' }), undefined)
  assert.equal(selectionOf({ provider: 'p', model: '  ' }), undefined)
  assert.equal(selectionOf(null), undefined)
  assert.equal(selectionOf(['p', 'm']), undefined)
})

test('inherit resolves the default model first and the agent second', () => {
  const both = contextWith({
    defaultSelection: { provider: 'deepseek', model: 'deepseek-flash' },
    agentSelection: { provider: 'other', model: 'other-model' },
  })
  assert.deepEqual(resolveInheritedModel(both), { provider: 'deepseek', model: 'deepseek-flash' })

  const agentOnly = contextWith({ agentSelection: { provider: 'other', model: 'other-model' } })
  assert.deepEqual(resolveInheritedModel(agentOnly), { provider: 'other', model: 'other-model' })

  const neither = contextWith({})
  assert.equal(resolveInheritedModel(neither), undefined)
  assert.equal(resolveInheritedModel({}), undefined)
  assert.deepEqual(modelResolver(agentOnly)(), { provider: 'other', model: 'other-model' })
})

test('locking copies an explicit model and resolves an inherited one', () => {
  assert.deepEqual(
    lockReviewerModel({ source: 'explicit', provider: 'p', model: 'm', reasoningEffort: 'low' }, undefined, 'draft'),
    { source: 'explicit', provider: 'p', model: 'm', reasoningEffort: 'low' },
  )
  assert.deepEqual(
    lockReviewerModel({ source: 'explicit', provider: 'p', model: 'm' }, undefined, 'draft'),
    { source: 'explicit', provider: 'p', model: 'm' },
  )
  assert.throws(
    () => lockReviewerModel({ source: 'explicit', provider: 'p' }, undefined, 'draft'),
    /needs a provider and a model/,
  )
  const resolve = () => ({ provider: 'deepseek', model: 'deepseek-flash' })
  assert.deepEqual(
    lockReviewerModel({ source: 'inherit' }, resolve, 'apply'),
    { source: 'inherit', provider: 'deepseek', model: 'deepseek-flash' },
  )
  assert.throws(
    () => lockReviewerModel({ source: 'inherit' }, () => undefined, 'apply'),
    /no current model is available/,
  )
  assert.throws(() => lockReviewerModel({ source: 'inherit' }, undefined, 'draft'), /no current model is available/)
})

test('a policy record falls back to inherit and keeps a concrete route', () => {
  assert.deepEqual(policyReviewerModel(undefined), { source: 'inherit' })
  assert.deepEqual(policyReviewerModel({ source: 'nonsense', provider: 'p', model: 'm' }), {
    source: 'inherit', provider: 'p', model: 'm',
  })
  assert.deepEqual(policyReviewerModel({ source: 'explicit', provider: 'p', model: 'm' }), {
    source: 'explicit', provider: 'p', model: 'm',
  })
  assert.deepEqual(policyReviewerModel({ source: 'explicit' }), { source: 'inherit' })
  assert.deepEqual(policyReviewerModel([]), { source: 'inherit' })
})

test('an activation without a locked route is refused', () => {
  assert.deepEqual(reviewerAgentOptions({ provider: 'p', model: 'm', reasoningEffort: 'max' }), {
    provider: 'p', model: 'm', reasoningEffort: 'max',
  })
  assert.throws(() => reviewerAgentOptions({ source: 'inherit' }), /has no provider or model/)
})

test('the catalog check refuses every unavailable part', async () => {
  const catalog = {
    listProviders: () => [{ id: 'deepseek', name: 'DeepSeek' }],
    async resolveModelInfo(provider, model) {
      if (model !== 'deepseek-flash') throw new Error('not found')
      return { provider, model, reasoning: { efforts: [{ id: 'max', name: 'Max' }], defaultEffort: 'max' } }
    },
  }
  await assertReviewerModelAvailable(catalog, { provider: 'deepseek', model: 'deepseek-flash' })
  await assertReviewerModelAvailable(catalog, {
    provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })
  await assert.rejects(
    assertReviewerModelAvailable(catalog, { provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'low' }),
    /reasoning effort 'low' is unavailable/,
  )
  await assert.rejects(
    assertReviewerModelAvailable(catalog, { provider: 'missing', model: 'deepseek-flash' }),
    /provider 'missing' is unavailable/,
  )
  await assert.rejects(
    assertReviewerModelAvailable(catalog, { provider: 'deepseek', model: 'missing' }),
    /model 'deepseek\/missing' is unavailable: not found/,
  )
  await assert.rejects(
    assertReviewerModelAvailable(undefined, { provider: 'deepseek', model: 'deepseek-flash' }),
    /model catalog is unavailable/,
  )
  await assert.rejects(
    assertReviewerModelAvailable({ listProviders: () => [{ id: 'deepseek' }] }, { provider: 'deepseek', model: 'x' }),
    /model catalog is unavailable/,
  )
  await assert.rejects(
    assertReviewerModelAvailable(catalog, { source: 'inherit' }),
    /needs a provider and a model/,
  )
  // An asynchronous provider list is awaited like a synchronous one.
  await assertReviewerModelAvailable({
    listProviders: async () => [{ id: 'deepseek' }],
    resolveModelInfo: catalog.resolveModelInfo,
  }, { provider: 'deepseek', model: 'deepseek-flash' })
})

test('a policy written before the model existed migrates once', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-openspec-model-'))
  try {
    const directory = join(root, 'openspec', '.review', 'local#demo')
    mkdirSync(directory, { recursive: true })
    const policy = {
      schemaVersion: 1,
      change: 'demo',
      reviews: {
        draft: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 },
        apply: { enabled: true, reviewers: 0, maxRounds: 5, waitMinutes: 15 },
      },
    }
    writeJsonAtomic(join(directory, 'policy.json'), policy)
    const resolveModel = () => ({ provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max' })
    const migrated = ensureReviewerModel(directory, policy, {
      config: configOf(),
      resolveModel,
    })
    assert.deepEqual(migrated.reviews.draft.reviewerModel, {
      source: 'inherit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
    })
    assert.deepEqual(readPolicy(directory).reviews.apply.reviewerModel, {
      source: 'inherit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
    })

    // A second migration pass changes nothing: the fields are already locked.
    const again = ensureReviewerModel(directory, migrated, {
      config: configOf({ draft: { reviewerModel: { source: 'explicit', provider: 'other', model: 'other' } } }),
      resolveModel: () => ({ provider: 'other', model: 'other' }),
    })
    assert.equal(again, migrated)

    // A policy whose apply section arrived without a model migrates only that section.
    const partial = {
      ...migrated,
      reviews: {
        draft: migrated.reviews.draft,
        apply: { enabled: true, reviewers: 0, maxRounds: 5, waitMinutes: 15 },
      },
    }
    const filled = ensureReviewerModel(directory, partial, { config: configOf(), resolveModel })
    assert.deepEqual(filled.reviews.apply.reviewerModel, {
      source: 'inherit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
    })

    // A damaged record without sections is left exactly as it is.
    assert.equal(ensureReviewerModel(directory, { change: 'demo' }, { config: configOf(), resolveModel }).change, 'demo')
    assert.equal(ensureReviewerModel(directory, undefined, { config: configOf(), resolveModel }), undefined)
    assert.equal(
      ensureReviewerModel(directory, { reviews: { draft: { enabled: true, reviewerModel: { source: 'inherit' } } } }, {})
        .reviews.draft.reviewerModel.source,
      'inherit',
    )
    writeFileSync(join(directory, 'keep.txt'), 'keep\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the fake context offers a default model and a catalog', async () => {
  const fake = createFakeContext({ cwd: tmpdir() })
  assert.deepEqual(fake.ctx.get('agentDefaultModel').currentSelection(), {
    provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })
  assert.deepEqual(fake.ctx.get('llm').listProviders(), [{ id: 'deepseek', name: 'deepseek' }])
  assert.equal((await fake.ctx.get('llm').listModels('deepseek')).length, 1)
  await assertReviewerModelAvailable(fake.ctx.get('llm'), {
    provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })
})
