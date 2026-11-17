/**
 * Browser half: the review configuration page.
 *
 * One `plugins.row.config` entry for the `openspec-flow` row, keyed by the
 * installed package name and the row id from `cordis.patch.yml`. The page draws
 * the draft and apply review sections, the reviewer model cascade, and the
 * locked policies of every OpenSpec project the Host reports.
 *
 * The page owns no review decision. A controller holds the form, calls the Host
 * channel and publishes state; the React component is a thin renderer over that
 * controller. A save is validated twice Host-side (shape, then the model
 * catalog) and only a save that passes both reaches the profile.
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
      update: 'reviewSettings/update',
      policies: 'reviewPolicies/list',
      cards: 'reviewCards/get',
    }
    /** Locale namespace of this page. */
    const NS = 'openspecReview'

    const zh = {
      summary: '草稿与应用评审的配置',
      title: '评审配置',
      note: '设置保存在当前 profile，只影响之后新建的变更；已锁定策略不会被这里修改。',
      draft: '草稿评审',
      apply: '应用评审',
      enabled: '启用',
      reviewers: '评审人数',
      waitMinutes: '等待分钟',
      model: '评审模型',
      inherit: '跟随执行变更的模型',
      explicit: '指定模型',
      provider: '提供方',
      modelId: '模型',
      effort: '推理档位',
      effortDefault: '适配器默认',
      chooseProvider: '选择提供方',
      chooseModel: '选择模型',
      save: '保存',
      saving: '保存中…',
      saved: '已保存；配置已写入 profile，插件行会重启，必要时刷新页面。',
      loading: '读取配置中…',
      failed: '读取配置失败',
      retry: '重试',
      locked: '已锁定策略',
      noProjects: '当前没有正在使用 OpenSpec 项目的会话，因此没有可展示的锁定策略。',
      gitYes: 'git 可用',
      gitNo: '无 git',
      applyUnavailable: '应用评审不可用（该项目没有 git 仓库）',
      lockDraft: '草稿',
      lockApply: '应用',
      enabledOn: '启用',
      enabledOff: '关闭',
      reviewersText: '{n} 人',
      canSave: '可以保存',
      cannotSave: '无法保存',
      providersFailed: '提供方读取失败。',
      modelsFailed: '模型目录读取失败，保留原值。',
    }
    const en = {
      summary: 'Draft and apply review settings',
      title: 'Review settings',
      note: 'Saved in this profile and applied to new changes only; locked policies are not changed here.',
      draft: 'Draft review',
      apply: 'Apply review',
      enabled: 'Enabled',
      reviewers: 'Reviewers',
      waitMinutes: 'Wait minutes',
      model: 'Reviewer model',
      inherit: 'Follow the changing model',
      explicit: 'Explicit model',
      provider: 'Provider',
      modelId: 'Model',
      effort: 'Reasoning effort',
      effortDefault: 'Adapter default',
      chooseProvider: 'Choose a provider',
      chooseModel: 'Choose a model',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved; the row restarts, refresh the page if the form looks stale.',
      loading: 'Reading settings…',
      failed: 'Could not read the settings',
      retry: 'Retry',
      locked: 'Locked policies',
      noProjects: 'No session is working in an OpenSpec project right now, so there is no locked policy to show.',
      gitYes: 'git available',
      gitNo: 'no git',
      applyUnavailable: 'Apply review is unavailable (this project has no git repository)',
      lockDraft: 'Draft',
      lockApply: 'Apply',
      enabledOn: 'enabled',
      enabledOff: 'off',
      reviewersText: '{n} reviewer(s)',
      canSave: 'Saving is available',
      cannotSave: 'Saving is unavailable',
      providersFailed: 'Could not read the providers.',
      modelsFailed: 'Could not read the model catalog; the previous values were kept.',
    }

    /** Bounds the Host reports, with a standalone fallback. */
    const DEFAULT_BOUNDS = {
      reviewers: { min: 0, max: 1 },
      waitMinutes: { min: 1, max: 120 },
    }

    /**
     * Copy one review section into the form's shape.
     * @param raw - section from the Host, or undefined.
     * @param kind - `draft` or `apply`.
     * @returns the form section.
     */
    function sectionOf(raw, kind = 'draft') {
      const present = typeof raw === 'object' && raw !== null
      const section = present ? raw : {}
      const model = typeof section.reviewerModel === 'object' && section.reviewerModel !== null
        ? section.reviewerModel
        : { source: 'inherit' }
      const reviewerModel = model.source === 'explicit'
        ? {
          source: 'explicit',
          provider: typeof model.provider === 'string' ? model.provider : '',
          model: typeof model.model === 'string' ? model.model : '',
          ...(typeof model.reasoningEffort === 'string' && model.reasoningEffort !== ''
            ? { reasoningEffort: model.reasoningEffort }
            : {}),
        }
        : { source: 'inherit' }
      return {
        enabled: present ? section.enabled === true : true,
        reviewers: section.reviewers === 1 ? 1 : 0,
        waitMinutes: Number.isInteger(section.waitMinutes) ? section.waitMinutes : 15,
        reviewerModel,
      }
    }

    /**
     * Build the form from a Host settings payload.
     * @param reviews - `{ draft, apply }`.
     * @returns the form.
     */
    function initialForm(reviews) {
      return {
        draft: sectionOf(reviews?.draft, 'draft'),
        apply: sectionOf(reviews?.apply, 'apply'),
      }
    }

    /**
     * Replace one section field.
     * @param form - current form.
     * @param kind - `draft` or `apply`.
     * @param patch - fields to merge.
     * @returns the next form.
     */
    function patchSection(form, kind, patch) {
      return { ...form, [kind]: { ...form[kind], ...patch } }
    }

    /**
     * Replace one section's reviewer model.
     * @param form - current form.
     * @param kind - `draft` or `apply`.
     * @param model - the next model record.
     * @returns the next form.
     */
    function setModel(form, kind, model) {
      return patchSection(form, kind, { reviewerModel: model })
    }

    /**
     * Choose a provider for one section: drop the model and effort it no longer names.
     * @param form - current form.
     * @param kind - `draft` or `apply`.
     * @param provider - provider id.
     * @returns the next form.
     */
    function chooseProvider(form, kind, provider) {
      return setModel(form, kind, { source: 'explicit', provider, model: '' })
    }

    /**
     * Choose a model for one section and clear the effort it no longer names.
     * @param form - current form.
     * @param kind - `draft` or `apply`.
     * @param model - model id.
     * @returns the next form.
     */
    function chooseModel(form, kind, model) {
      const current = form[kind].reviewerModel
      return setModel(form, kind, { source: 'explicit', provider: current.provider, model })
    }

    /**
     * Choose a reasoning effort, or the adapter default when `effort` is empty.
     * @param form - current form.
     * @param kind - `draft` or `apply`.
     * @param effort - effort id, or the empty string.
     * @returns the next form.
     */
    function chooseEffort(form, kind, effort) {
      const current = form[kind].reviewerModel
      const next = { source: 'explicit', provider: current.provider, model: current.model }
      if (effort !== '') next.reasoningEffort = effort
      return setModel(form, kind, next)
    }

    /**
     * The payload `reviewSettings/update` expects.
     * @param form - current form.
     * @returns the payload.
     */
    function savePayload(form) {
      return { reviews: { draft: form.draft, apply: form.apply } }
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
     * It owns every read and write the page performs, so the React half only
     * renders: `load` reads settings, project facts and providers, the cascade
     * loads models and efforts, and `save` validates through the Host.
     * @param options - channel caller and translate.
     * @returns the controller.
     */
    function createController({ call, t }) {
      let state = {
        status: 'loading',
        error: '',
        form: initialForm(undefined),
        bounds: DEFAULT_BOUNDS,
        canSave: false,
        saveReason: '',
        providers: [],
        models: { draft: [], apply: [] },
        efforts: { draft: null, apply: null },
        projects: [],
        busy: false,
        message: null,
      }
      const listeners = new Set()

      /** Publish one state patch. */
      function publish(patch) {
        state = { ...state, ...patch }
        for (const listener of [...listeners]) listener()
      }

      /** Apply a change to the form and notify. */
      function updateForm(next) {
        publish({ form: next, message: null })
      }

      /** Read everything the page renders. */
      async function load() {
        publish({ status: 'loading', error: '' })
        const [settings, policies, providers] = await Promise.all([
          rpc(call, ENDPOINTS.settings, {}),
          rpc(call, ENDPOINTS.policies, {}),
          rpc(call, ENDPOINTS.providers, {}),
        ])
        if (!settings.ok) {
          publish({ status: 'error', error: settings.error.message })
          return
        }
        publish({
          status: 'ready',
          error: '',
          form: initialForm(settings.value.reviews),
          bounds: settings.value.bounds ?? DEFAULT_BOUNDS,
          canSave: settings.value.canSave === true,
          saveReason: typeof settings.value.saveReason === 'string' ? settings.value.saveReason : '',
          providers: providers.ok ? providers.value : [],
          projects: policies.ok ? policies.value.projects : [],
          message: providers.ok ? null : { kind: 'error', text: t('providersFailed') },
        })
      }

      /** Replace one section field, or the whole reviewer model when asked. */
      function onChange(kind, patch, replaceModel = false) {
        const section = replaceModel
          ? { ...state.form[kind], reviewerModel: patch.reviewerModel }
          : { ...state.form[kind], ...patch }
        updateForm({ ...state.form, [kind]: section })
      }

      /** Load one section's models and their effort metadata. */
      async function loadModels(kind, provider) {
        const answer = await rpc(call, ENDPOINTS.models, { provider })
        if (!answer.ok) {
          publish({
            models: { ...state.models, [kind]: [] },
            efforts: { ...state.efforts, [kind]: null },
            message: { kind: 'error', text: t('modelsFailed') },
          })
          return
        }
        const models = answer.value
        publish({
          models: { ...state.models, [kind]: models },
          form: models.length === 0 ? state.form : chooseModel(state.form, kind, models[0].id),
        })
        if (models.length > 0) await loadEfforts(kind, provider, models[0].id)
      }

      /** Load one section's effort metadata for the chosen model. */
      async function loadEfforts(kind, provider, model) {
        if (provider === undefined || provider === '') return
        const answer = await rpc(call, ENDPOINTS.efforts, { provider, model })
        if (!answer.ok) {
          publish({ efforts: { ...state.efforts, [kind]: null } })
          return
        }
        const efforts = answer.value
        let form = state.form
        const currentModel = form[kind].reviewerModel
        const accepted = efforts.efforts.some((entry) => entry.id === currentModel.reasoningEffort)
        if (currentModel.model === model && efforts.efforts.length > 0 && !accepted) {
          form = setModel(form, kind, {
            source: 'explicit',
            provider: currentModel.provider,
            model,
            reasoningEffort: efforts.defaultEffort ?? efforts.efforts[0].id,
          })
        }
        publish({ efforts: { ...state.efforts, [kind]: efforts }, form })
      }

      /** Choose a provider and load its models. */
      async function onProvider(kind, provider) {
        updateForm(chooseProvider(state.form, kind, provider))
        if (provider !== '') await loadModels(kind, provider)
      }

      /** Choose a model and load its efforts. */
      async function onModel(kind, model) {
        updateForm(chooseModel(state.form, kind, model))
        if (model !== '') await loadEfforts(kind, state.form[kind].reviewerModel.provider, model)
      }

      /** Choose an effort. */
      function onEffort(kind, effort) {
        updateForm(chooseEffort(state.form, kind, effort))
      }

      /** Persist the form and report the Host's answer. */
      async function save() {
        publish({ busy: true, message: null })
        const answer = await rpc(call, ENDPOINTS.update, savePayload(state.form))
        if (!answer.ok) {
          publish({ busy: false, message: { kind: 'error', text: answer.error.message } })
          return answer
        }
        publish({ busy: false, message: { kind: 'ok', text: t('saved') } })
        // A save restarts the row; the re-read reconciles a restarted Host.
        const settings = await rpc(call, ENDPOINTS.settings, {})
        if (settings.ok) {
          publish({
            form: initialForm(settings.value.reviews),
            canSave: settings.value.canSave === true,
          })
        }
        return answer
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
        onChange,
        onProvider,
        onModel,
        onEffort,
        save,
      }
    }

    /** One labelled row of the form. */
    function Row({ label, children, note }) {
      return h('label', { style: rowStyle },
        h('span', { style: labelStyle }, label),
        h('span', { style: controlStyle }, children),
        note === undefined ? null : h('span', { style: noteStyle }, note))
    }

    /** One review section form. */
    function Section({ kind, t, controller, state }) {
      const section = state.form[kind]
      const model = section.reviewerModel
      const models = state.models[kind] ?? []
      const effortOptions = state.efforts[kind]?.efforts ?? []
      return h('section', { style: sectionStyle, 'data-openspec-review': kind },
        h('h3', { style: headingStyle }, kind === 'draft' ? t('draft') : t('apply')),
        h(Row, { label: t('enabled') },
          h('input', {
            type: 'checkbox',
            checked: section.enabled,
            'data-openspec-field': `${kind}.enabled`,
            onChange: (event) => { controller.onChange(kind, { enabled: event.target.checked }) },
          })),
        h(Row, { label: t('reviewers') },
          h('select', {
            value: String(section.reviewers),
            'data-openspec-field': `${kind}.reviewers`,
            onChange: (event) => { controller.onChange(kind, { reviewers: Number(event.target.value) }) },
          }, h('option', { value: '0' }, '0'), h('option', { value: '1' }, '1'))),
        h(Row, {
          label: t('waitMinutes'),
          note: `${String(state.bounds.waitMinutes.min)}–${String(state.bounds.waitMinutes.max)}`,
        },
        h('input', {
          type: 'number',
          min: state.bounds.waitMinutes.min,
          max: state.bounds.waitMinutes.max,
          value: String(section.waitMinutes),
          'data-openspec-field': `${kind}.waitMinutes`,
          onChange: (event) => { controller.onChange(kind, { waitMinutes: Number(event.target.value) }) },
        })),
        h(Row, { label: t('model') },
          h('select', {
            value: model.source,
            'data-openspec-field': `${kind}.source`,
            onChange: (event) => {
              controller.onChange(kind, {
                reviewerModel: event.target.value === 'inherit'
                  ? { source: 'inherit' }
                  : { source: 'explicit', provider: '', model: '' },
              }, true)
            },
          },
          h('option', { value: 'inherit' }, t('inherit')),
          h('option', { value: 'explicit' }, t('explicit')))),
        model.source === 'explicit'
          ? [
            h(Row, { key: `${kind}-provider`, label: t('provider') },
              h('select', {
                value: model.provider,
                'data-openspec-field': `${kind}.provider`,
                onChange: (event) => { void controller.onProvider(kind, event.target.value) },
              },
              h('option', { value: '' }, t('chooseProvider')),
              state.providers.map((provider) => h('option', { key: provider.id, value: provider.id }, provider.name || provider.id)))),
            h(Row, { key: `${kind}-model`, label: t('modelId') },
              h('select', {
                value: model.model,
                'data-openspec-field': `${kind}.model`,
                disabled: models.length === 0,
                onChange: (event) => { void controller.onModel(kind, event.target.value) },
              },
              h('option', { value: '' }, t('chooseModel')),
              models.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.name || entry.id)))),
            h(Row, { key: `${kind}-effort`, label: t('effort') },
              h('select', {
                value: model.reasoningEffort ?? '',
                'data-openspec-field': `${kind}.effort`,
                disabled: effortOptions.length === 0,
                onChange: (event) => { controller.onEffort(kind, event.target.value) },
              },
              h('option', { value: '' }, t('effortDefault')),
              effortOptions.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.name || entry.id)))),
          ]
          : null)
    }

    /** The locked-policy list. */
    function LockedPolicies({ t, projects }) {
      if (projects.length === 0) return h('p', { style: noteStyle }, t('noProjects'))
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        projects.map((project) => h('div', { key: project.path, style: cardStyle },
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'baseline' } },
            h('code', { style: { font: 'var(--dsw-font-xs-13)' } }, project.path),
            h('span', { style: badgeStyle(project.git) }, project.git ? t('gitYes') : t('gitNo'))),
          project.git ? null : h('p', { style: noteStyle }, t('applyUnavailable')),
          project.changes.length === 0
            ? null
            : h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } },
              project.changes.map((change) => h('li', { key: change.change, 'data-openspec-locked': change.change },
                h('strong', null, change.change), ' — ',
                lockLine(t, change.reviews.draft, 'draft'), ' · ',
                lockLine(t, change.reviews.apply, 'apply')))))))
    }

    /** The page root. */
    function Page({ t, call }) {
      const controller = React.useMemo(() => createController({ call, t }), [call, t])
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
        h(Section, { kind: 'draft', t, controller, state }),
        h(Section, { kind: 'apply', t, controller, state }),
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
          h('button', {
            type: 'button',
            disabled: state.busy || !state.canSave,
            'data-openspec-save': 'review-settings',
            onClick: () => { void controller.save() },
          }, state.busy ? t('saving') : t('save')),
          h('span', { style: noteStyle }, state.canSave ? t('canSave') : `${t('cannotSave')}: ${state.saveReason}`)),
        state.message === null
          ? null
          : h('p', {
            style: {
              margin: 0,
              color: state.message.kind === 'ok' ? 'var(--dsw-alias-label-success)' : 'var(--dsw-alias-label-error)',
            },
          }, state.message.text),
        h('h3', { style: headingStyle }, t('locked')),
        h(LockedPolicies, { t, projects: state.projects }))
    }

    const pageStyle = {
      display: 'flex', flexDirection: 'column', gap: '12px', padding: '4px 2px',
      font: 'var(--dsw-font-xs-13)', color: 'var(--dsw-alias-label-primary)',
    }
    const sectionStyle = {
      display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 12px',
      border: '1px solid var(--dsw-alias-separator-secondary)', borderRadius: '8px',
    }
    const headingStyle = { margin: 0, font: 'var(--dsw-font-sm-14)' }
    const rowStyle = { display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: '8px', alignItems: 'center' }
    const labelStyle = { color: 'var(--dsw-alias-label-secondary)' }
    const controlStyle = { display: 'inline-flex', gap: '6px', alignItems: 'center' }
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

    /** Select the cards returned by the review endpoint. */
    function selectCards(value) {
      const cards = value !== null && typeof value === 'object' ? value.cards : undefined
      return Array.isArray(cards) ? cards.filter((card) => card !== null && typeof card === 'object') : []
    }

    /** One-line collapsed summary for one card. */
    function cardSummary(card) {
      const phase = card.phase === 'resolution' ? '处理汇报' : '评审汇报'
      const review = card.review === 'apply' ? 'apply' : 'draft'
      const counts = card.counts ?? {}
      return `${phase} · ${review} · 第 ${cardValue(card.round)} 轮 · ${cardValue(card.verdict)} · findings ${cardValue(counts.total)}（阻塞 ${cardValue(counts.blocking)}） · 下一步 ${cardValue(card.nextAction)}`
    }

    /** One finding's full report fields. */
    function findingRows(finding) {
      return [
        ['问题', finding.problem],
        ['证据', finding.evidence],
        ['影响', finding.impact],
        ['规则', finding.rule],
        ['失败路径', finding.failure],
        ['建议', finding.suggestion],
      ]
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
          ['轮次', card.round],
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
              ['豁免', finding.waiver],
              ['批准者', finding.approvedBy],
              ['验证轮次', finding.verifiedInRound],
            ],
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
        sections.push({
          title: '未就绪原因',
          rows: card.readinessReasons.map((entry, index) => [`原因 ${String(index + 1)}`, entry]),
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

    return {
      inject: ['slots', 'locale', 'connection'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'openspec-flow: review config dictionary')
        const t = ctx.locale.bind(NS)
        const call = (endpoint, payload) => ctx.connection.rpc.call(CHANNEL, endpoint, payload)

        /** Turn-tail entry: query the review channel for the current turn's cards. */
        function ReviewCardTail({ turn, sessionId }) {
          const [loaded, setLoaded] = React.useState({ key: '', cards: [] })
          const turnNumber = turn?.turn
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
            const payload = { sessionId: effectiveSessionId, turn: turnNumber }
            if (typeof turn?.start === 'string') payload.from = turn.start
            Promise.resolve(call(ENDPOINTS.cards, payload)).then((result) => {
              if (!alive) return
              setLoaded({ key, cards: result?.ok === true ? selectCards(result.value) : [] })
            }).catch(() => {
              if (alive) setLoaded({ key, cards: [] })
            })
            return () => { alive = false }
          }, [effectiveSessionId, turnNumber])
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
        initialForm,
        patchSection,
        setModel,
        chooseProvider,
        chooseModel,
        chooseEffort,
        savePayload,
        lockLine,
        createController,
        selectCards,
        cardTailElement,
        cardSummary,
        cardSections,
      },
    }
  },
})
