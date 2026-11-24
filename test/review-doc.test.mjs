/**
 * The review document, checked against the live tools and settings.
 *
 * The document is a repository document, not a packaged asset, so nothing at
 * runtime would notice it going stale. This test reads it as text and compares
 * the names it uses with the code: tools registered by both plugin halves, the
 * `openspec_review` action list, the review defaults, the record layout and the
 * README link. A negative case proves a stale name is reported by name.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { apply } from '../index.js'
import { apply as reviewerApply } from '../reviewer.js'
import {
  DEFAULT_APPLY_REVIEW,
  DEFAULT_DRAFT_REVIEW,
  DEFAULT_REVIEWER_MODEL,
} from '../lib/review/config.js'
import { APPLY_REVIEW_FILE, DRAFT_REVIEW_FILE } from '../lib/review/record.js'
import { LOCK_DIRECTORY_NAME, LOCK_FIELDS, LOCK_FILE_NAME } from '../lib/review/apply-lock.js'
import { REVIEW_DIRECTORY, REVIEW_IGNORE_LINE } from '../lib/review/store.js'
import { createFakeContext } from './fake-context.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DOC_PATH = join(ROOT, 'docs', 'review.md')

/** Tools the document must name because they carry the review flow. */
const REQUIRED_TOOLS = ['openspec_review', 'openspec_reviewer', 'openspec_apply_next', 'openspec_archive']

/** Review actions the document must show, because every phase names one. */
const REQUIRED_ACTIONS = ['start', 'resume', 'wait', 'status', 'self-report', 'report', 'dispose', 'extend', 'abandon']

/** OpenSpec CLI verbs a document must not present as an instruction. */
const CLI_COMMAND = /\bopenspec (?:validate|archive|list|status|show|new|init|update|view|diff|schemas|instructions|config|store|completion)\b/

/**
 * Read the live names the document is checked against.
 * @returns the tool map, the review action list, the defaults and the record layout.
 */
function liveCatalog() {
  // Both review sections must be enabled for the review tool to register.
  const fake = createFakeContext({ cwd: ROOT })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true }, apply: { enabled: true } },
  })
  const reviewer = createFakeContext({ cwd: ROOT })
  reviewerApply(reviewer.ctx)
  const tools = new Map([...fake.tools, ...reviewer.tools])
  const reviewTool = fake.tools.get('openspec_review')
  assert.ok(reviewTool, 'openspec_review is registered')
  return {
    tools,
    reviewActions: reviewTool.parameters.properties.action.enum,
    defaults: {
      draft: DEFAULT_DRAFT_REVIEW,
      apply: DEFAULT_APPLY_REVIEW,
      reviewerModel: DEFAULT_REVIEWER_MODEL,
    },
    record: {
      root: `openspec/${REVIEW_DIRECTORY}/`,
      draftFile: DRAFT_REVIEW_FILE,
      applyFile: APPLY_REVIEW_FILE,
      waiverFile: 'plan-change-waiver.json',
      ignore: REVIEW_IGNORE_LINE,
      lockFile: LOCK_FILE_NAME,
      lockDirectory: LOCK_DIRECTORY_NAME,
      lockFields: LOCK_FIELDS,
    },
  }
}

/**
 * Format one default the way the document's table spells it.
 * @param value - default value.
 * @returns the cell text.
 */
function cell(value) {
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null) {
    return `{ source: "${String(value.source)}" }`
  }
  return String(value)
}

/**
 * Check one document text against the live catalog.
 * @param text - the document.
 * @param spec - live names from {@link liveCatalog}.
 * @returns the problems, each naming the offending item.
 */
export function checkDocument(text, spec) {
  const problems = []
  for (const name of REQUIRED_TOOLS) {
    if (!text.includes(name)) problems.push(`missing tool ${name}`)
  }
  const mentioned = new Set(text.match(/openspec_[a-z_]+/gu) ?? [])
  for (const name of mentioned) {
    if (!spec.tools.has(name)) problems.push(`unknown tool ${name}`)
  }
  for (const action of REQUIRED_ACTIONS) {
    if (!text.includes(`"${action}"`)) problems.push(`missing action ${action}`)
  }
  // Action values are read per line, and only from lines that name
  // `openspec_review`: `openspec_reviewer` has its own read/submit/status
  // vocabulary, which is not this action list.
  for (const line of text.split('\n')) {
    if (!line.includes('openspec_review') || line.includes('openspec_reviewer')) continue
    for (const match of line.matchAll(/action"?\s*:\s*"([^"]+)"/gu)) {
      if (!spec.reviewActions.includes(match[1])) problems.push(`unknown action ${match[1]}`)
    }
  }
  for (const kind of ['draft', 'apply']) {
    const defaults = spec.defaults[kind]
    for (const [key, value] of Object.entries(defaults)) {
      const row = new RegExp(`^\\| \`reviews\\.${kind}\\.${key}\` \\| \`([^\`]+)\``, 'mu').exec(text)
      if (row === null) {
        problems.push(`missing config key reviews.${kind}.${key}`)
        continue
      }
      if (row[1] !== cell(value)) {
        problems.push(`stale default for reviews.${kind}.${key}: ${row[1]}, expected ${cell(value)}`)
      }
    }
  }
  if (text.includes('maxRounds')) problems.push('names the removed round cap maxRounds')
  if (!text.includes(spec.record.root)) problems.push(`missing record root ${spec.record.root}`)
  if (!text.includes('<git common dir>/openspec-flow/review')) problems.push('missing shared record root')
  if (!text.includes('@root-')) problems.push('missing nested-root suffix')
  if (!text.includes('.migrated')) problems.push('missing migration marker')
  if (!text.includes('既不写 `openspec/.gitignore` 也不运行 `git check-ignore`')) problems.push('missing shared-root ignore skip')
  if (!text.includes('旧记录根下的卡片')) problems.push('missing legacy card fallback')
  if (!text.includes('<store>#<change>')) problems.push('missing record key <store>#<change>')
  for (const name of [spec.record.draftFile, spec.record.applyFile, spec.record.waiverFile]) {
    if (!text.includes(name)) problems.push(`missing record file ${name}`)
  }
  if (!text.includes(spec.record.ignore)) problems.push(`missing ignore entry ${spec.record.ignore}`)
  if (!text.includes('openspec/.gitignore')) problems.push('missing the ignored review root file')
  if (!text.includes(spec.record.lockFile)) problems.push(`missing lock file ${spec.record.lockFile}`)
  if (!text.includes(spec.record.lockDirectory)) problems.push(`missing lock directory ${spec.record.lockDirectory}`)
  for (const field of spec.record.lockFields) {
    if (!text.includes(field)) problems.push(`missing lock field ${field}`)
  }
  if (CLI_COMMAND.test(text)) {
    const match = CLI_COMMAND.exec(text)
    problems.push(`names an OpenSpec CLI command: ${String(match?.[0])}`)
  }
  return problems
}

/**
 * Check the README points at the document.
 * @param readme - README text.
 * @returns the problems.
 */
export function checkReadme(readme) {
  return readme.includes('docs/review.md') ? [] : ['README does not link docs/review.md']
}

test('the review document matches the live tools, actions, defaults and record layout', () => {
  const spec = liveCatalog()
  const text = readFileSync(DOC_PATH, 'utf8')
  assert.deepEqual(checkDocument(text, spec), [])
})

test('the README links the review document', () => {
  assert.deepEqual(checkReadme(readFileSync(join(ROOT, 'README.md'), 'utf8')), [])
})

test('the review document states the shared brief report contract', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  assert.match(text, /同一渲染器按当前轮生成/)
  assert.match(text, /R<round>-NN/)
  assert.match(text, /`verified-fixed`、`still-open`、`regressed`/)
  assert.match(text, /首轮为空/)
  assert.match(text, /本轮开始前已记录/)
})

test('the review document and README state the apply brief base scope', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  assert.match(text, /base tree/)
  assert.match(text, /空 diff/)
  assert.match(text, /封存 commit、显式 `base` 或 merge-base/)
  assert.match(text, /整棵已提交树才是评审对象/)
  assert.match(text, /可选 `base`/)
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  assert.match(readme, /可选 `base`/)
})

test('the review document and README state the no-draft apply baseline', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of [
    'baseline',
    '`none`',
    '显式 `baseline: "none"`',
    '已有 draft 记录时拒绝',
    'git check-ignore',
    'openspec/.gitignore',
  ]) {
    assert.ok(text.includes(phrase), `the document names ${phrase}`)
  }
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  assert.match(readme, /baseline/)
  assert.match(readme, /`none`/)
  assert.match(readme, /默认 `draft`/)
  assert.match(readme, /非空 `base`/)
})

test('the review document and README state the requirement length gate', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of [
    '500 字符上限',
    'ADDED',
    'MODIFIED',
    '历史既有超长',
    '不要为了通过长度限制而压缩',
    '专门 change',
    '保留 header 和全部 scenario',
    'openspec_review action=resume review=draft',
  ]) {
    assert.ok(text.includes(phrase), `the document names ${phrase}`)
  }
  assert.doesNotMatch(text, /建议压缩文本|应该压缩文本/)
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  for (const phrase of ['500 字符上限', 'ADDED', 'MODIFIED', '历史超长', 'resume review=draft', '不要为了过闸门压缩文本']) {
    assert.ok(readme.includes(phrase), `the README names ${phrase}`)
  }
})

test('the review document and README state the execution preflight', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of [
    '执行性预检',
    'requirement 锚点',
    'tasks.md',
    '`test/`',
    '`scripts/`',
    '`execution`',
    'openspec_review action=resume review=draft',
    '另一个尚未归档的 change',
    'openspec_apply_next',
    'apply review',
  ]) {
    assert.ok(text.includes(phrase), `the document names ${phrase}`)
  }
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  for (const phrase of ['执行性预检', 'requirement 锚点', 'tasks.md', '`test/`', '`scripts/`', 'draft `resume`', 'docs/review.md']) {
    assert.ok(readme.includes(phrase), `the README names ${phrase}`)
  }
})

test('the README carries no round-cap policy wording', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  assert.doesNotMatch(readme, /与轮次、等待上限|轮次上限.*策略|maxRounds/)
})

test('the review document explains the apply status states', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of ['`policy`', '`enabled`', '`available`', '`mode`', '`independent`', 'draft-only']) {
    assert.ok(text.includes(phrase), `the document names ${phrase}`)
  }
  assert.match(text, /评审未开始时按锁定策略该段的 `reviewers` 推导/)
  assert.match(text, /已有评审记录时用记录中的值/)
  assert.match(text, /没有 git 的项目只能用 draft review/)
  assert.match(text, /旧的策略文件可能仍记录/)
  assert.match(text, /无策略或只有 draft 段/)
  assert.match(text, /每个新的 draft\/apply 轮次/)
  assert.match(text, /唤醒同一个 reviewer/)
  assert.match(text, /不会重复唤醒/)
  assert.doesNotMatch(text, /归档会一直等到 apply review 就绪/)
})

test('the document covers both review kinds and both reviewer modes', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of ['draft review', 'apply review', 'reviewers 0', 'reviewers 1', 'openspec-reviewer']) {
    assert.ok(text.includes(phrase), `the document names ${phrase}`)
  }
  assert.match(text, /reviewers`?.*`?0/s)
  assert.match(text, /reviewers`?.*`?1/s)
  assert.match(text, /draft brief 的开头在两种模式下相同/)
})

test('the document explains the frozen reviewer', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of ['已安装副本', '不改变已装副本', '不会触发 HMR 重载', '评审按已装版本完整完成', 'installing-bundles.md']) {
    assert.ok(text.includes(phrase), `the document names ${phrase}`)
  }
  assert.match(text, /重新打包、先在 Plugins 页面移除再安装/)
})

test('a stale tool, default or record path is reported by name', () => {
  const spec = liveCatalog()
  const text = readFileSync(DOC_PATH, 'utf8')

  const removedTool = text.replaceAll('openspec_apply_next', 'openspec_apply_old')
  const toolProblems = checkDocument(removedTool, spec)
  assert.ok(toolProblems.includes('missing tool openspec_apply_next'))
  assert.ok(toolProblems.includes('unknown tool openspec_apply_old'))

  const staleDefault = `${text}\n| \`reviews.draft.maxRounds\` | \`3\` |\n`
  const defaultProblems = checkDocument(staleDefault, spec)
  assert.ok(
    defaultProblems.includes('names the removed round cap maxRounds'),
    defaultProblems.join('; '),
  )

  const renamedKey = text.replace('`reviews.apply.waitMinutes`', '`reviews.apply.wait`')
  const keyProblems = checkDocument(renamedKey, spec)
  assert.ok(keyProblems.includes('missing config key reviews.apply.waitMinutes'))

  const movedRoot = text.replaceAll(`openspec/${REVIEW_DIRECTORY}/`, 'openspec/reviews/')
  const pathProblems = checkDocument(movedRoot, spec)
  assert.ok(pathProblems.includes(`missing record root openspec/${REVIEW_DIRECTORY}/`))

  const cliCommand = `${text}\n\nopenspec validate --all\n`
  const cliProblems = checkDocument(cliCommand, spec)
  assert.ok(cliProblems.some((problem) => problem.startsWith('names an OpenSpec CLI command')))

  const unknownAction = text.replace('"action": "wait"', '"action": "pause"')
  assert.ok(checkDocument(unknownAction, spec).includes('unknown action pause'))

  assert.deepEqual(checkReadme('# README\n'), ['README does not link docs/review.md'])
})

test('the review document states the reviewer catalog and the host strict validation', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const name of ['`read`', '`grep`', '`glob`', '`read_image`', '`web_search`', '`web_fetch`', '`openspec_reviewer`']) {
    assert.ok(text.includes(name), `the document names reviewer tool ${name}`)
  }
  assert.match(text, /实际目录是上述七个工具/)
  assert.match(text, /`read_image` 只在 Host 提供 `attachments` 服务时注册/)
  assert.match(text, /要求该步模型路由声明图片输入/)
  assert.match(text, /Host 继承/)
  assert.match(text, /--strict/)
  assert.match(text, /brief 头部记录/)
  assert.match(text, /reviewer 不再运行校验/)
})

test('the review document explains the seal, the freeze and the plan-change waiver', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  assert.match(text, /封存 commit/)
  assert.match(text, /refs\/openspec-flow\/seal\/<slug>-<hash>/)
  assert.match(text, /封存提交在 land 前不进入 main 的历史/)
  assert.match(text, /私有引用保证 rebase/)
  assert.match(text, /规划副本/)
  assert.match(text, /已跟踪的 `\.gitignore` 修改或删除则恢复到 `HEAD` 版本/)
  assert.match(text, /rebase 后原封存提交与分支上重放的封存提交并存/)
  assert.match(text, /apply 开始后 draft review 冻结/)
  assert.match(text, /scope: "plan-change"/)
  assert.match(text, /plan-change-waiver\.json/)
  assert.match(text, /plan coherence/)
  assert.match(text, /intent fit/)
  assert.match(text, /scope control/)
})

test('the review document explains batch disposition and the removed issue field', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  assert.match(text, /`dispositions` 数组/)
  assert.match(text, /只有一条时仍可用单条 `id` 写法/)
  assert.match(text, /整批先校验后写入，任一条无效时所有 finding 保持不变/)
  assert.match(text, /`deferred` 必须给 note/)
  assert.match(text, /旧记录中的 `issue` 字段保留原样但不读取/)
  assert.match(text, /plan-change 的 `waive` 仍用 `files` 记录豁免，不接受 `dispositions`/)
})

test('the review document explains the reviewer read targets and the resume gate', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of ['`own-report`', '`findings`', '`round`', '`resume` 在有 `open` finding 时拒绝开新轮']) {
    assert.ok(text.includes(phrase), `the document names ${phrase}`)
  }
  assert.match(text, /`read` 的 `target` 为 `brief`、`own-report`（可带 `round`）、`findings` 与 `status`/)
  assert.match(text, /`start` 与 `resume` 不接受它/)
  assert.match(text, /`resume` 在有 `open` finding 时拒绝开新轮/)
})

test('the review document explains the non-polling wait and the wakeup', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  assert.match(text, /不轮询/)
  assert.match(text, /waiting.*结束当前轮次/s)
  assert.match(text, /subagents\.sendMessage/)
  assert.match(text, /waitMinutes.*到期/s)
  assert.ok(!text.includes('OPENSPEC_FLOW_REVIEW_POLL_MS'))
})

test('a missing lock layout is reported by name', () => {
  const spec = liveCatalog()
  const text = readFileSync(DOC_PATH, 'utf8')
  const stripped = text.replaceAll('apply.lock.json', 'removed-lock.json')
  const problems = checkDocument(stripped, spec)
  assert.ok(
    problems.some((problem) => problem.startsWith('missing lock file')),
    problems.join('; '),
  )
})

test('the review document explains the cards and the model rule', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of [
    'cards/<sessionKey>-<phase>-<round>.json',
    'reviewCards/get',
    'card-delivery.json',
    'conversation.chat.turnTail',
    '起止时间窗口',
    '写入时间升序',
    '投递水位不会越过',
    '默认折叠',
    '点击展开',
    '四档计数',
    '摘要不显示下一步',
    '评审卡不投递',
    '`review.json` 或 `apply-review.json`',
    '升级前写入的同类卡同样不投递',
    '汇报类型 · change 名 · 评审类型',
    'change 名缺失时省略',
    '未记录时不显示',
    '合并为一行',
    '不设截断',
    '不分页',
    '固定中文',
    'plan-change waiver',
    'self-report',
    'submit',
    'wait',
    'report',
    'resume',
    'dispose',
    'cards',
    '不进入模型可见面',
    '不依赖 `@deepseek-ai/*`',
  ]) {
    assert.ok(text.includes(phrase), `the document names ${phrase}`)
  }
  assert.match(text, /不复述 findings/)
  assert.match(text, /reviewer 提交后不写评审总结/)
  assert.doesNotMatch(text, /plugin:openspec-flow\/review-card|openspecReviewCards|sessionProjections|probe-session\.mjs|@deepseek-ai\/dsh-session/)
})

test('the review document states the host verification boundary', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of [
    '自备的隔离干净 DSH',
    '不得安装、重启或修改开发宿主',
    '代理负责准备并运行',
    '自验',
    '不作为代理任务',
    'reviewCards/get',
  ]) {
    assert.ok(text.includes(phrase), `the document states ${phrase}`)
  }
  assert.doesNotMatch(text, /probe-session\.mjs|@deepseek-ai\/dsh-session|sessionProjections/)
})

test('the review document qualifies every dispose example and next action', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  const lines = text.split('\n').filter((line) => line.includes('"action": "dispose"'))
  assert.ok(lines.length >= 2, 'the document keeps both dispose examples')
  for (const line of lines) {
    assert.match(line, /"review": "(draft|apply)"/, line)
  }
  assert.match(text, /openspec_review action=dispose review=<kind>/)
})

test('the review document states that a closed finding cannot be disposed again', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  assert.match(text, /`verified` 与 `waived` 是 finding 的终态/)
  assert.match(text, /错误报出 finding 的当前状态并说明它已关闭，不再指向下一步处置/)
})

test('the README states the review kind and the draft freeze', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  assert.match(readme, /`dispose` 与 finding 的 `waive` 必须显式传 `review`/)
  assert.match(readme, /apply 启动后 draft 记录冻结/)
  assert.match(readme, /openspec_review action=dispose review=<kind>/)
})

test('the review document and README state the card lookup deduplication and batch request', () => {
  const doc = readFileSync(DOC_PATH, 'utf8')
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  for (const phrase of [
    '每个评审根在单次请求内最多扫描一次',
    '按卡片文件绝对路径去重',
    '`turns` 批量请求',
    '`byTurn`',
    '重复 turn 只保留首项',
    '只写一次 `card-delivery.json`',
    '`clearGitRootCache()`',
  ]) {
    assert.ok(doc.includes(phrase), `the document states ${phrase}`)
  }
  for (const phrase of [
    '`turns` 批量请求',
    '`byTurn`',
    '同一张卡只返回一次',
    '[docs/review.md](docs/review.md)',
  ]) {
    assert.ok(readme.includes(phrase), `the README states ${phrase}`)
  }
})

test('the review document names the extra round contract', () => {
  const doc = readFileSync(DOC_PATH, 'utf8')
  for (const text of ['rebaseReview', 'extraRounds', 'roundToken', 'E1']) {
    assert.ok(doc.includes(text), `document names ${text}`)
  }
})

test('the review document states the stale-round block and the qualified reuse rule', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  assert.match(text, /对尚无报告且对象未变的轮次再次 `resume` 只会复用该轮/)
  assert.match(text, /先把该轮记为 `blocked`/)
  assert.match(text, /`blockedReason: "stale-object"`/)
  assert.match(text, /监视是尽力而为/)
})

test('the review document states the cross-change finding boundary', () => {
  const text = readFileSync(DOC_PATH, 'utf8')
  for (const phrase of [
    '另一个 change 的规划工件',
    'openspec/changes/<other>/',
    '改记到 `outOfScope`',
    '不得在轮次无报告期间要求该 change 修改产物',
    '任一结构错误或范围违规都会拒绝整份报告',
  ]) {
    assert.ok(text.includes(phrase), `the document states ${phrase}`)
  }
  assert.doesNotMatch(text, /任一结构错误都会拒绝整份报告/)
})
