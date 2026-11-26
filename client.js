/**
 * Browser half: the read-only review configuration page.
 *
 * One `plugins.row.config` entry for the `openspec-flow` row, keyed by the
 * installed package name and the row id from `cordis.patch.yml`. The page shows
 * the global review switch, the legacy-section notice, and for every OpenSpec
 * project the Host reports: its profiles, its draft and apply entries, its
 * schema error and its locked policies.
 *
 * The page owns no review decision and writes nothing. A controller reads the
 * Host channel and publishes state; the React component is a thin renderer over
 * that controller. Review parameters live in the project review file and the
 * switch lives in the profile row config.
 *
 * The file is a hand-written loader bundle because the package ships no build
 * step: `window.__ModuleLoader__.load` receives one lazy factory, React comes from
 * the page's module table, and the endpoint literals repeat
 * `lib/client/channel.js` (the channel test compares them).
 */

window.__ModuleLoader__.load({
  id: 'dsh-openspec-flow',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Channel path; must match `lib/client/channel.js`. */
    const CHANNEL = '/openspec-review'
    /** Endpoint names; must match `lib/client/channel.js`. */
    const ENDPOINTS = {
      providers: 'reviewModels/providers',
      models: 'reviewModels/models',
      efforts: 'reviewModels/efforts',
      settings: 'reviewSettings/get',
      policies: 'reviewPolicies/list',
      cards: 'reviewCards/get',
    }
    /** Locale namespace of this page. */
    const NS = 'openspecReview'

    /** Epoch-ms bounds a plausible Session event time may fall in. */
    const MIN_TURN_TIME = Date.UTC(2000, 0, 1)
    const MAX_TURN_TIME = Date.UTC(2100, 0, 1)

    /**
     * ISO form of one Session event time.
     * @param value - candidate epoch milliseconds.
     * @returns the ISO string, or undefined when missing or implausible.
     */
    function turnTimeIso(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
      if (value < MIN_TURN_TIME || value > MAX_TURN_TIME) return undefined
      return new Date(value).toISOString()
    }

    const zh = {
      summary: '项目评审配置（只读）',
      title: '评审配置',
      note: '评审参数由项目的 openspec/reviews.json 提供；页面只读展示，开关 reviewEnabled 在 profile 中修改。',
      boundary: '修改 openspec/reviews.json 只影响之后新建的变更；已锁定的策略不会改动。',
      switchLabel: '评审开关',
      switchOn: '开启',
      switchOff: '关闭',
      legacy: 'profile 中仍有 reviews 段，已被忽略；请把参数迁移到 openspec/reviews.json。',
      profiles: '档案',
      entries: '用途映射',
      object: '评审对象',
      objectDirectory: '目录',
      objectTree: 'git tree',
      enabled: '启用',
      reviewers: '评审人数',
      waitMinutes: '等待分钟',
      model: '评审模型',
      modelInherit: '继承当前模型',
      configError: '配置错误',
      noProjects: '当前没有正在使用 OpenSpec 项目的会话。',
      gitYes: 'git 可用',
      gitNo: '无 git',
      applyUnavailable: '应用评审不可用（该项目没有 git 仓库）',
      locked: '已锁定策略',
      lockDraft: '草稿',
      lockApply: '应用',
      enabledOn: '启用',
      enabledOff: '关闭',
      reviewersText: '{n} 人',
      loading: '读取配置中…',
      failed: '读取配置失败',
      retry: '重试',
    }
    const en = {
      summary: 'Project review configuration (read-only)',
      title: 'Review configuration',
      note: 'Review parameters come from the project openspec/reviews.json; this page is read-only and reviewEnabled is set in the profile.',
      boundary: 'Editing openspec/reviews.json affects only changes created afterwards; locked policies never change.',
      switchLabel: 'Review switch',
      switchOn: 'on',
      switchOff: 'off',
      legacy: 'The profile still carries a reviews section; it is ignored. Move the parameters to openspec/reviews.json.',
      profiles: 'Profiles',
      entries: 'Entries',
      object: 'Object',
      objectDirectory: 'directory',
      objectTree: 'git tree',
      enabled: 'Enabled',
      reviewers: 'Reviewers',
      waitMinutes: 'Wait minutes',
      model: 'Reviewer model',
      modelInherit: 'Follow the current model',
      configError: 'Configuration error',
      noProjects: 'No session is working in an OpenSpec project right now.',
      gitYes: 'git available',
      gitNo: 'no git',
      applyUnavailable: 'Apply review is unavailable (this project has no git repository)',
      locked: 'Locked policies',
      lockDraft: 'Draft',
      lockApply: 'Apply',
      enabledOn: 'enabled',
      enabledOff: 'off',
      reviewersText: '{n} reviewer(s)',
      loading: 'Reading configuration…',
      failed: 'Could not read the configuration',
      retry: 'Retry',
    }


    /**
     * One line describing a locked review section.
     * @param t - translate.
     * @param section - policy section.
     * @param kind - `draft` or `apply`.
     * @returns the text.
     */
    function lockLine(t, section, kind) {
      const label = kind === 'draft' ? t('lockDraft') : t('lockApply')
      const state = section.enabled ? t('enabledOn') : t('enabledOff')
      const reviewers = t('reviewersText', { n: section.reviewers })
      return `${label}: ${state} · ${reviewers} · ${String(section.waitMinutes)}m`
    }

    /**
     * Read one channel answer as `{ ok, value }` or `{ ok: false, error }`.
     * @param call - the channel caller.
     * @param endpoint - endpoint name.
     * @param payload - request payload.
     * @returns the folded result.
     */
    async function rpc(call, endpoint, payload) {
      let answer
      try {
        answer = await call(endpoint, payload)
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'reviewChannel/transport',
            message: error instanceof Error ? error.message : String(error),
          },
        }
      }
      if (answer?.ok === true) return { ok: true, value: answer.value }
      return {
        ok: false,
        error: {
          code: answer?.error?.code ?? 'reviewChannel/internal',
          message: answer?.error?.message ?? 'the review channel refused without a reason',
        },
      }
    }

    /**
     * The page's state machine.
     *
     * It owns the one read the page performs: the global switch, the legacy
     * notice and every known project's parsed configuration or schema error,
     * with that project's locked policies. The page never writes.
     * @param options - channel caller.
     * @returns the controller.
     */
    function createController({ call }) {
      let state = {
        status: 'loading',
        error: '',
        reviewEnabled: true,
        legacyReviews: false,
        projects: [],
      }
      const listeners = new Set()

      /** Publish one state patch. */
      function publish(patch) {
        state = { ...state, ...patch }
        for (const listener of [...listeners]) listener()
      }

      /** Read everything the page renders. */
      async function load() {
        publish({ status: 'loading', error: '' })
        const answer = await rpc(call, ENDPOINTS.settings, {})
        if (!answer.ok) {
          publish({ status: 'error', error: answer.error.message })
          return
        }
        publish({
          status: 'ready',
          error: '',
          reviewEnabled: answer.value.reviewEnabled !== false,
          legacyReviews: answer.value.legacyReviews === true,
          projects: Array.isArray(answer.value.projects) ? answer.value.projects : [],
        })
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        getState() {
          return state
        },
        load,
      }
    }

    /** One profile's read-only row. */
    function ProfileRow({ t, name, profile }) {
      const model = profile?.reviewerModel
      const modelText = model?.source === 'explicit'
        ? `${String(model.provider)}/${String(model.model)}`
        : t('modelInherit')
      return h('li', { style: { margin: '2px 0' }, 'data-openspec-profile': name },
        h('strong', null, name), ' — ',
        `${t('object')}: ${profile?.object === 'tree' ? t('objectTree') : t('objectDirectory')}`, ' · ',
        `${t('enabled')}: ${profile?.enabled === true ? t('enabledOn') : t('enabledOff')}`, ' · ',
        `${t('reviewers')}: ${String(profile?.reviewers)}`, ' · ',
        `${t('waitMinutes')}: ${String(profile?.waitMinutes)}`, ' · ',
        `${t('model')}: ${modelText}`)
    }

    /** One project's read-only configuration and its locked policies. */
    function ProjectCard({ t, project }) {
      const config = project.config
      const changes = Array.isArray(project.changes) ? project.changes : []
      return h('div', { key: project.path, style: cardStyle },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'baseline' } },
          h('code', { style: { font: 'var(--dsw-font-xs-13)' } }, project.path),
          h('span', { style: badgeStyle(project.git) }, project.git ? t('gitYes') : t('gitNo'))),
        project.git ? null : h('p', { style: noteStyle }, t('applyUnavailable')),
        config === undefined
          ? h('p', { style: { margin: 0, color: 'var(--dsw-alias-label-error)' } },
            `${t('configError')}: ${project.configError ?? 'openspec/reviews.json'}`)
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('h4', { style: headingStyle }, t('profiles')),
            h('ul', { style: { margin: 0, paddingLeft: '18px' } },
              Object.entries(config.profiles ?? {}).map(([name, profile]) =>
                h(ProfileRow, { key: name, t, name, profile }))),
            h('p', { style: noteStyle },
              `${t('entries')}: ${t('lockDraft')} → ${String(config.reviews?.draft)} · ${t('lockApply')} → ${String(config.reviews?.apply)}`)),
        changes.length === 0
          ? null
          : h('div', null,
            h('h4', { style: headingStyle }, t('locked')),
            h('ul', { style: { margin: 0, paddingLeft: '18px' } },
              changes.map((change) => h('li', { key: change.change, 'data-openspec-locked': change.change },
                h('strong', null, change.change), ' — ',
                lockLine(t, change.reviews.draft, 'draft'), ' · ',
                lockLine(t, change.reviews.apply, 'apply'))))))
    }

    /** The page root. */
    function Page({ t, call }) {
      const controller = React.useMemo(() => createController({ call }), [call])
      const state = React.useSyncExternalStore(controller.subscribe, controller.getState)
      React.useEffect(() => {
        void controller.load()
      }, [controller])

      if (state.status === 'loading') return h('div', { style: pageStyle }, h('p', null, t('loading')))
      if (state.status === 'error') {
        return h('div', { style: pageStyle },
          h('p', { style: { color: 'var(--dsw-alias-label-error)' } }, `${t('failed')}: ${state.error}`),
          h('button', { type: 'button', onClick: () => { void controller.load() } }, t('retry')))
      }

      return h('div', { style: pageStyle },
        h('h2', { style: { margin: 0, font: 'var(--dsw-font-lg-16)' } }, t('title')),
        h('p', { style: noteStyle }, t('note')),
        h('p', { style: noteStyle }, t('boundary')),
        h('p', { style: noteStyle },
          `${t('switchLabel')}: ${state.reviewEnabled ? t('switchOn') : t('switchOff')}`),
        state.legacyReviews
          ? h('p', { style: { margin: 0, color: 'var(--dsw-alias-label-warning)' } }, t('legacy'))
          : null,
        h('h3', { style: headingStyle }, t('profiles')),
        state.projects.length === 0
          ? h('p', { style: noteStyle }, t('noProjects'))
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
            state.projects.map((project) => h(ProjectCard, { key: project.path, t, project }))))
    }
    const pageStyle = {
      display: 'flex', flexDirection: 'column', gap: '12px', padding: '4px 2px',
      font: 'var(--dsw-font-xs-13)', color: 'var(--dsw-alias-label-primary)',
    }
    const headingStyle = { margin: 0, font: 'var(--dsw-font-sm-14)' }
    const noteStyle = { margin: 0, color: 'var(--dsw-alias-label-secondary)', font: 'var(--dsw-font-xxs-12)' }
    const cardStyle = {
      display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 10px',
      border: '1px solid var(--dsw-alias-separator-secondary)', borderRadius: '8px',
    }
    const badgeStyle = (git) => ({
      font: 'var(--dsw-font-xxs-12)',
      color: git ? 'var(--dsw-alias-label-success)' : 'var(--dsw-alias-label-warning)',
    })

    /** Read one card field as display text. */
    function cardValue(value) {
      if (value === undefined || value === null || value === '') return '未记录'
      return String(value)
    }

    /** Whether one optional value is recorded. */
    function recorded(value) {
      return value !== undefined && value !== null && value !== ''
    }

    /** One label/value row, or null when the value is not recorded. */
    function recordedRow(label, value) {
      return recorded(value) ? [label, value] : null
    }

    /** Select the cards returned by the review endpoint. */
    function selectCards(value) {
      const cards = value !== null && typeof value === 'object' ? value.cards : undefined
      return Array.isArray(cards) ? cards.filter((card) => card !== null && typeof card === 'object') : []
    }

    /** Select one turn's cards from a batch answer. */
    function selectCardArray(value) {
      return Array.isArray(value) ? value.filter((card) => card !== null && typeof card === 'object') : []
    }

    /** Finding severities, in report order. */
    const SEVERITIES = ['critical', 'major', 'minor', 'nit']

    /** Per-severity counts over every recorded finding of one card. */
    function severityCounts(card) {
      const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]))
      for (const finding of Array.isArray(card.findings) ? card.findings : []) {
        if (finding !== null && typeof finding === 'object' && SEVERITIES.includes(finding.severity)) {
          counts[finding.severity] += 1
        }
      }
      return counts
    }

    /**
     * Readiness reasons with same-kind finding reasons merged.
     *
     * The `finding <id> is <state>` forms mirror the wording owned by
     * `lib/review/readiness.js`; change both together.
     */
    function readinessLines(reasons) {
      const entries = []
      const groups = new Map()
      for (const reason of reasons) {
        const match = /^(blocking )?finding (\S+) is (.+)$/u.exec(reason)
        if (match === null) {
          entries.push({ kind: 'text', text: reason })
          continue
        }
        const key = `${match[1] ?? ''}${match[3]}`
        const group = groups.get(key)
        if (group === undefined) {
          const created = { kind: 'group', blocking: match[1] !== undefined, tail: match[3], ids: [match[2]] }
          groups.set(key, created)
          entries.push(created)
        } else {
          group.ids.push(match[2])
        }
      }
      return entries.map((entry) => {
        if (entry.kind === 'text') return entry.text
        const ids = entry.ids.join(', ')
        const prefix = entry.blocking ? 'blocking ' : ''
        if (entry.ids.length === 1) return `${prefix}finding ${ids} is ${entry.tail}`
        return `${prefix}findings ${ids} are ${entry.tail}`
      })
    }

    /** One-line collapsed summary for one card. */
    function cardSummary(card) {
      const phase = card.phase === 'resolution' ? '处理汇报' : '评审汇报'
      const review = card.review === 'apply' ? 'apply' : 'draft'
      const change = typeof card.change === 'string' && card.change.trim() !== ''
        ? `${card.change.trim()} · `
        : ''
      const counts = severityCounts(card)
      const severities = SEVERITIES.map((severity) => `${severity} ${String(counts[severity])}`).join(' · ')
      const round = typeof card.roundToken === 'string' && card.roundToken !== ''
        ? card.roundToken
        : cardValue(card.round)
      return `${phase} · ${change}${review} · 第 ${round} 轮 · ${cardValue(card.verdict)} · ${severities}`
    }

    /** One finding's full report fields. */
    function findingRows(finding) {
      return [
        ['问题', finding.problem],
        ['证据', finding.evidence],
        recordedRow('类别', finding.axis),
        ['影响', finding.impact],
        recordedRow('规则', finding.rule),
        recordedRow('失败路径', finding.failure),
        ['建议', finding.suggestion],
      ].filter((row) => row !== null)
    }

    /** All sections of the expanded card, without truncation. */
    function cardSections(card) {
      const sections = []
      const object = card.object ?? {}
      const objectText = object.kind === 'commit'
        ? `${cardValue(object.commit)}（tree ${cardValue(object.tree)}，base ${cardValue(object.baseTree)}）`
        : cardValue(object.hash)
      sections.push({
        title: '轮次信息',
        rows: [
          ['变更', card.change],
          ['评审', card.review],
          ['轮次', typeof card.roundToken === 'string' && card.roundToken !== '' ? card.roundToken : card.round],
          ['结论', card.verdict],
          ['状态', card.state],
          ['就绪', card.ready ? '是' : '否'],
          ['模式', card.independent ? '独立 reviewer' : '自评审'],
          ['对象', objectText],
          ['对象已变', object.changed ? '是' : '否'],
          ['下一步', card.nextAction],
        ],
      })
      const report = card.report
      if (report !== null && typeof report === 'object') {
        sections.push({ title: '报告结论', rows: [['结论', report.summary]] })
        sections.push({
          title: 'Findings',
          items: (Array.isArray(report.findings) ? report.findings : []).map((finding) => ({
            title: `${cardValue(finding.id)} [${cardValue(finding.severity)}/${cardValue(finding.status)}] ${cardValue(finding.location)} ${cardValue(finding.title)}`,
            rows: findingRows(finding),
          })),
        })
        sections.push({
          title: '本轮验证',
          items: (Array.isArray(report.verifications) ? report.verifications : []).map((verification) => ({
            title: `${cardValue(verification.id)} ${cardValue(verification.status)}`,
            rows: [['证据', verification.evidence]],
          })),
        })
        sections.push({
          title: '残余风险',
          rows: (Array.isArray(report.residualRisks) ? report.residualRisks : []).map((entry, index) => [`风险 ${String(index + 1)}`, entry]),
        })
        sections.push({
          title: 'Out of scope',
          rows: (Array.isArray(report.outOfScope) ? report.outOfScope : []).map((entry, index) => [`范围 ${String(index + 1)}`, entry]),
        })
      }
      const findings = Array.isArray(card.findings) ? card.findings : []
      const disposed = findings.filter((finding) => finding.status !== 'open')
      if (disposed.length > 0) {
        sections.push({
          title: '处理情况',
          items: disposed.map((finding) => ({
            title: `${cardValue(finding.id)} ${cardValue(finding.status)}`,
            rows: [
              ['说明', finding.note],
              recordedRow('豁免', finding.waiver),
              recordedRow('批准者', finding.approvedBy),
              ['验证轮次', finding.verifiedInRound],
            ].filter((row) => row !== null),
          })),
        })
      }
      if (card.planChangeWaiver !== null && typeof card.planChangeWaiver === 'object') {
        const waiver = card.planChangeWaiver
        sections.push({
          title: '规划变更豁免',
          rows: [
            ['批准者', waiver.approvedBy],
            ['记录时间', waiver.recordedAt],
            ['文本', waiver.text],
            ['文件', Array.isArray(waiver.files) ? waiver.files.join(', ') : waiver.files],
            ['draft hash', waiver.draftObjectHash],
            ['current hash', waiver.currentObjectHash],
          ],
        })
      }
      if (Array.isArray(card.readinessReasons) && card.readinessReasons.length > 0) {
        const lines = readinessLines(card.readinessReasons)
        sections.push({
          title: '未就绪原因',
          rows: lines.map((entry, index) => [`原因 ${String(index + 1)}`, entry]),
        })
      }
      return sections
    }

    const cardFrameStyle = {
      border: '1px solid var(--dsw-alias-separator-secondary)', borderRadius: '8px', marginTop: '8px',
      background: 'var(--dsw-alias-bg-secondary, transparent)', overflow: 'hidden',
    }
    const cardHeaderStyle = {
      display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', alignItems: 'center',
      padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer',
      color: 'var(--dsw-alias-label-primary)', font: 'var(--dsw-font-xs-13)', textAlign: 'left',
    }
    const cardTitleStyle = { flex: '1 1 auto', minWidth: 0 }
    const cardToggleStyle = { flex: '0 0 auto', color: 'var(--dsw-alias-label-secondary)' }
    const cardBodyStyle = {
      padding: '0 10px 10px', maxHeight: '60vh', overflow: 'auto',
      color: 'var(--dsw-alias-label-primary)', font: 'var(--dsw-font-xs-13)',
    }
    const cardSectionStyle = { marginTop: '8px', borderTop: '1px solid var(--dsw-alias-separator-secondary)', paddingTop: '8px' }
    const cardSectionTitleStyle = { margin: '0 0 4px', font: 'var(--dsw-font-sm-14)' }
    const cardRowStyle = { display: 'grid', gridTemplateColumns: '96px 1fr', gap: '8px', padding: '2px 0' }
    const cardLabelStyle = { color: 'var(--dsw-alias-label-secondary)' }
    const cardItemStyle = { padding: '4px 0', borderTop: '1px dashed var(--dsw-alias-separator-secondary)' }
    const cardItemTitleStyle = { fontWeight: 600, paddingBottom: '2px' }
    const cardTailStyle = { display: 'flex', flexDirection: 'column' }

    /** Render one expanded card's sections. */
    function renderCardSections(card) {
      return cardSections(card).map((section, index) => h('section', { key: `s${String(index)}`, style: cardSectionStyle },
        h('h4', { style: cardSectionTitleStyle }, section.title),
        ...(section.rows ?? []).map((row, rowIndex) => h('div', { key: `r${String(rowIndex)}`, style: cardRowStyle },
          h('span', { style: cardLabelStyle }, row[0]),
          h('span', {}, cardValue(row[1])))),
        ...(section.items ?? []).map((item, itemIndex) => h('div', { key: `i${String(itemIndex)}`, style: cardItemStyle },
          h('div', { style: cardItemTitleStyle }, item.title),
          ...item.rows.map((row, rowIndex) => h('div', { key: `j${String(rowIndex)}`, style: cardRowStyle },
            h('span', { style: cardLabelStyle }, row[0]),
            h('span', {}, cardValue(row[1]))))))))
    }

    /** One review round card, collapsed until the reader expands it. */
    function ReviewCard({ card }) {
      const [open, setOpen] = React.useState(false)
      return h('section', { style: cardFrameStyle, 'data-openspec-card': card.phase },
        h('button', {
          type: 'button',
          style: cardHeaderStyle,
          'aria-expanded': open,
          onClick: () => setOpen((value) => !value),
        },
        h('span', { style: cardTitleStyle }, cardSummary(card)),
        h('span', { style: cardToggleStyle }, open ? '收起' : '展开')),
        open ? h('div', { style: cardBodyStyle }, renderCardSections(card)) : null)
    }

    /** Render the returned cards, or nothing for an empty turn. */
    function cardTailElement(cards) {
      if (!Array.isArray(cards) || cards.length === 0) return null
      return h('div', { style: cardTailStyle },
        cards.map((card, index) => h(ReviewCard, { key: `${cardValue(card.phase)}-${String(index)}`, card })))
    }

    /**
     * Merge one session's turn queries into batch requests.
     *
     * Entries queued in the same microtask share one request, and a session
     * sends at most 64 turns per request. A failed batch falls back to one
     * request per turn. The dedupe key lives only in the pending batch and is
     * dropped on flush, so a later remount issues a new request.
     * @param call - channel call function.
     * @returns `{ request(sessionId, { turn, from, to }) }`.
     */
    function createCardBatcher(call) {
      const pending = new Map()
      const single = (sessionId, entry) => Promise.resolve(call(ENDPOINTS.cards, {
        sessionId,
        turn: entry.turn,
        ...(entry.from !== undefined ? { from: entry.from } : {}),
        ...(entry.to !== undefined ? { to: entry.to } : {}),
      })).then((result) => (result?.ok === true ? selectCards(result.value) : [])).catch(() => [])
      const send = (sessionId, entries) => {
        for (let index = 0; index < entries.length; index += 64) {
          const chunk = entries.slice(index, index + 64)
          if (chunk.length === 1) {
            const entry = chunk[0]
            single(sessionId, entry).then((cards) => entry.resolve(cards))
            continue
          }
          const turns = chunk.map((entry) => ({
            turn: entry.turn,
            ...(entry.from !== undefined ? { from: entry.from } : {}),
            ...(entry.to !== undefined ? { to: entry.to } : {}),
          }))
          Promise.resolve(call(ENDPOINTS.cards, { sessionId, turns })).then((result) => {
            const byTurn = result?.ok === true && result.value !== null && typeof result.value === 'object'
              ? result.value.byTurn
              : undefined
            for (const entry of chunk) entry.resolve(selectCardArray(byTurn?.[String(entry.turn)]))
          }).catch(() => {
            for (const entry of chunk) single(sessionId, entry).then((cards) => entry.resolve(cards))
          })
        }
      }
      return {
        request(sessionId, options) {
          const turn = options?.turn
          if (typeof sessionId !== 'string' || sessionId === '' || !Number.isInteger(turn) || turn < 1) {
            return Promise.resolve([])
          }
          const from = options?.from
          const to = options?.to
          const key = `${String(turn)}|${from ?? ''}|${to ?? ''}`
          let bucket = pending.get(sessionId)
          if (bucket === undefined) {
            bucket = { entries: new Map(), scheduled: false }
            pending.set(sessionId, bucket)
          }
          const existing = bucket.entries.get(key)
          if (existing !== undefined) return existing.promise
          const entry = { turn, from, to, resolve: null, promise: null }
          entry.promise = new Promise((resolve) => { entry.resolve = resolve })
          bucket.entries.set(key, entry)
          if (!bucket.scheduled) {
            bucket.scheduled = true
            Promise.resolve().then(() => {
              if (pending.get(sessionId) !== bucket) return
              pending.delete(sessionId)
              send(sessionId, [...bucket.entries.values()])
            })
          }
          return entry.promise
        },
      }
    }

    return {
      inject: ['slots', 'locale', 'connection'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'openspec-flow: review config dictionary')
        const t = ctx.locale.bind(NS)
        const call = (endpoint, payload) => ctx.connection.rpc.call(CHANNEL, endpoint, payload)
        const batcher = createCardBatcher(call)

        /** Turn-tail entry: query the review channel for the current turn's cards. */
        function ReviewCardTail({ turn, sessionId }) {
          const [loaded, setLoaded] = React.useState({ key: '', cards: [] })
          const turnNumber = turn?.turn
          const startTime = turn?.start?.time
          const endTime = turn?.end?.time
          const effectiveSessionId = typeof sessionId === 'string' && sessionId !== ''
            ? sessionId
            : (typeof turn?.sessionId === 'string' && turn.sessionId !== ''
              ? turn.sessionId
              : (typeof turn?.session?.id === 'string' ? turn.session.id : ''))
          const key = `${effectiveSessionId}:${String(turnNumber)}`
          React.useEffect(() => {
            let alive = true
            if (effectiveSessionId === '') return undefined
            if (!Number.isInteger(turnNumber)) return undefined
            const from = turnTimeIso(startTime)
            const to = turnTimeIso(endTime)
            batcher.request(effectiveSessionId, { turn: turnNumber, from, to }).then((cards) => {
              if (alive) setLoaded({ key, cards })
            }).catch(() => {
              if (alive) setLoaded({ key, cards: [] })
            })
            return () => { alive = false }
          }, [effectiveSessionId, turnNumber, startTime, endTime])
          return cardTailElement(loaded.key === key ? loaded.cards : [])
        }
        ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key: 'dsh-openspec-flow#openspec-flow',
          locale: NS,
        }, (props) => (props?.view === 'summary'
          ? t('summary')
          : h(Page, { t, call })))), 'openspec-flow: review config page')
        ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'dsh-openspec-flow/review-cards',
          locale: NS,
          inject: (sessionId) => ({ sessionId }),
        }, ReviewCardTail)), 'openspec-flow: review round cards')
      },
      // Test seam: the page's controller and pure transitions, reachable without React.
      __test: {
        ENDPOINTS,
        NS,
        lockLine,
        createController,
        selectCards,
        selectCardArray,
        createCardBatcher,
        cardTailElement,
        cardSummary,
        cardSections,
      },
    }
  },
})
