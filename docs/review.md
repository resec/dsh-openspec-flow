# 评审流程

本文说明 `dsh-openspec-flow` 的评审系统：两类评审对象、两种 reviewer 模式、策略锁定、报告与 finding、记录布局、失败处理与配置。工具本身的字段说明见 `README.md`，流程规则见 `openspec/specs/change-review/spec.md`。

## 用途

评审是流程闸门，不是建议：

- **draft review** 在实施前检查规划工件（proposal、delta specs、design、tasks）与用户意图是否一致，`openspec_apply_next` 在它未就绪时拒绝。
- **apply review** 在归档前检查已提交的实现与变更工件是否一致；当 apply review 启用且项目有 git 时，`openspec_archive` 在它未就绪时拒绝。

两类评审都以「报告 + finding + 就绪度」表达结论。报告是模型写的，就绪度由插件按报告、finding 生命周期与对象哈希计算，`verdict: "pass"` 本身不构成就绪。

## 两个对象

| 评审 | 对象 | 何时确定 |
| --- | --- | --- |
| draft | 变更工件（`.openspec.yaml`、`design.md`、`proposal.md`、`specs/**/*.md`、`tasks.md`）加首轮写入的意图文本 | 首轮 `start` 写入 `intent.md`，之后每次 `resume` 复用它；每次进入评审重新计算哈希；`tasks.md` 的复选框状态被归一化，勾选任务不改变哈希 |
| apply | 已提交的 git tree（`HEAD^{tree}`） | 每次 `start` 或 `resume` 读取；工作区必须干净，提交之外的内容不进入评审；打开轮次前以 `--strict` 校验提交的变更 |

apply review 需要 git 仓库、干净工作区与至少一个提交。没有 git 的项目只能用 draft review；`openspec_new_change` 在锁定策略时忽略 apply review 的启用设置，把新建策略的 apply 段关闭。旧的策略文件可能仍记录 `reviews.apply.enabled: true`，status 会报告 `policy: true`、`enabled: true`、`available: false`，`openspec_archive` 不会等待它。无策略或只有 draft 段的旧 change 报告 `policy: false`，首次 apply start 会锁定或迁移策略。

git 项目中，draft review 就绪后、首次 `openspec_apply_next` 前必须提交封存 commit：变更目录连同插件写入的 `openspec/.gitignore`，也可包含其他 `openspec/changes/` 路径。工具要求工作区干净（其他 change 目录的未提交规划文件除外）、`HEAD` 至少改一个变更目录内的文件、目录外只允许该忽略文件和其他 `openspec/changes/` 路径，且工件哈希仍等于 draft 记录；任一不满足即拒绝。封存 commit 记录为 apply 的 base。apply 开始后 draft review 冻结，不能再 `resume`；此时修改 planning 工件须先取得用户书面豁免，用 `openspec_review`（`action: "waive"`、`scope: "plan-change"`、`files`）记录，apply review 会拒绝不在豁免清单内的变更文件。

本仓库以本地 tarball 包安装插件，评审器执行的是 profile 中的已安装副本，不是工作区源码。编辑工作区源码不改变已装副本，也不会触发 HMR 重载，因此评审进行中修改插件源码不会替换评审器，评审按已装版本完整完成。需要新插件逻辑生效时，重新打包、先在 Plugins 页面移除再安装；步骤见 [`installing-bundles.md`](installing-bundles.md)。

## 阶段与闸门

1. `openspec_new_change` 创建变更目录前先为本变更锁定评审策略（`policy.json`），并把已解析的 reviewer 模型写入策略。
2. planning 工件写完后调用 `openspec_review`（`action: "start"`，默认 `review: "draft"`），把用户目标与验收条件放进 `intent`；`start` 只用于首轮。
3. draft review 未就绪时 `openspec_review` 需要下一轮：用 `action: "resume"`，不传 `intent`。就绪后，git 项目先把变更目录与 `openspec/.gitignore` 提交为封存 commit（可含其他 `openspec/changes/` 路径），再调用 `openspec_apply_next`；工具校验干净树、提交路径与工件哈希，任一不满足即拒绝并记录该 commit 为 base，同时取得本 change 的 apply 锁。apply 开始后 draft review 冻结，不再接受 `resume`。
4. 实现并逐轮提交后调用 `openspec_review`（`action: "start"`、`review: "apply"`）；插件先以 `--strict` 校验提交的变更，失败时拒绝且不写记录或轮次，通过后审阅 brief 与 diff；后续轮次同样用 `resume`，同样先做 strict 校验。apply 开始后若修改 planning 工件，须先取得用户书面豁免并用 `action: "waive"`、`scope: "plan-change"` 记录；apply review 拒绝豁免清单之外的变更文件。apply brief 对规划变更按三条轴评审：plan coherence（变更后的 artifacts 彼此一致）、intent fit（仍满足用户目标与验收条件）、scope control（没有为迁就实现而弱化或移除需求）。
5. apply review 就绪后，或 apply review 不可用、禁用，或策略没有 apply 段时，`openspec_archive` 执行归档并合并 delta specs；成功后释放本 change 的 apply 锁，失败保留。

任一步都可以先用 `openspec_review` 的 `action: "status"` 查看 state、round、就绪原因与下一动作；apply status 还返回 `policy`、`enabled`、`available`。`action: "report"` 读回已提交的报告。

### apply status 字段

- `policy`：策略是否存在 apply 段；只有 draft 段的旧策略为 false。
- `enabled`：apply 段是否启用；`policy` 为 false 时为 false。
- `available`：项目是否有 git；为 false 时优先于无策略。

不可用、无策略或禁用时 status 不报错，返回 `ready: false` 与下一动作：不可用或禁用指向 `openspec_archive`，无策略或 draft-only 指向 `openspec_review` 的 `start`。

## 并发与串行

多个 change 可以同时持有 draft review：各自的记录、reviewer 槽位与等待计时器互不影响，`start`、`resume`、`self-report`、`wait` 与 `dispose` 只作用于被点名的 change。

apply 到归档按 change 串行，由项目级 apply 锁保证：

- 每个 change 锁住自己的实现域（session 的 git worktree 根；无 worktree 时为最近的 OpenSpec 根；再退到 change 的解析根）。store-backed change 另外锁住 store 域，保证同一 store change 不会从两个项目同时 apply。
- 锁身份是实现域锁的 `<store>#<change>`；store 域锁还比较 `implementationRoot`，第二个项目会被拒绝，同一项目重入允许。
- 获得锁的入口是 `openspec_apply_next` 与 apply review 的 `start`/`resume`；另一身份持锁时这些入口与 `openspec_archive` 都拒绝，并点名持有者与锁文件路径。draft review 不受影响。
- 锁位置：git 域为 `<git dir>/openspec-flow/apply.lock.json`（worktree 的 git directory，链接 worktree 各自独立）；非 git 域为 `<domain>/openspec/.review/apply.lock.json`。锁记录 `schemaVersion`、`change`、`store`、`changeRoot`、`implementationRoot`、`startedAt`。
- 成功归档后释放本 change 的锁；归档失败保留。`changeRoot` 或 `implementationRoot` 已不存在的锁视为 stale，可被接管。暂停的 change 需要用户删除拒绝信息中列出的锁文件才能释放；agent 必须先请求用户，不能自行删除。
- 封存、apply review 与归档的干净树检查忽略其他 `openspec/changes/` 目录下的未提交规划文件；被评审 change 自身目录或 `openspec/changes/` 之外的未提交路径仍算脏。

## reviewer 模式

每个评审段有 `reviewers` 设置：

- `0`：changer 自评审。用 `openspec_review` 的 `action: "self-report"` 提交本轮报告；这是唯一接受自报告的配置。
- `1`：独立 reviewer。首轮 `start` 时插件通过 subagent 的 `spawn` provider 启动一个 `openspec-reviewer` preset 的子会话。该 preset 挂 `read`、`grep`、`glob`、`read_image`、`web_search`、`web_fetch` 与 `openspec_reviewer`；reviewer 入口按全局工具注册表计算 deny 集合，把 Host 继承的 `openspec_review`、`openspec_apply_next`、`openspec_mark_task_done`、`openspec_archive`、`openspec_new_change`、`openspec_inspect`、`issues_*`、`create_worktree` 等全部排除，并在 `tools/change` 时刷新。reviewer 的实际目录是上述七个工具；`read_image` 只在 Host 提供 `attachments` 服务时注册，Host 未提供该服务时目录只有其余六个工具，调用其他工具返回未知工具；preset 也不加载写工具、bash、子代理或 workflow，因此 reviewer 不能修改工作区。`read_image` 读取 PNG/JPEG/WebP/GIF 文件，要求该步模型路由声明图片输入，否则调用返回工具错误且不改变评审记录。联网能力由部署为 Host `web` 服务选择的 provider 提供：preset 不挂载、不选择 provider，`web_search` 与 `web_fetch` 分别使用 Host 为 search 与 fetch 选择的 provider；每个工具是否出现在某一步，取决于为该项操作选择的 provider 对该步模型路由是否就绪，一个工具被隐藏不影响另一个。所选 provider 决定抓取的目标范围；默认匿名 HTTP provider 不限制目标地址，可达回环、私网与云元数据地址，需要隔离时应更换 provider 或添加 `tools/pre-execute` 策略。reviewer 的 persona 为 `complete: true`，工具自带的系统提示不会渲染，web 结果的不可信声明由每次工具结果携带。Host 未提供 `web` 服务时，该 preset 不能组装 reviewer 会话。每个新的 draft/apply 轮次都会唤醒同一个 reviewer 读取新 brief；只有 `replace` 会启动新 reviewer。对尚无报告的轮次再次 `resume` 只会复用该轮，不会重复唤醒。

apply review 的 brief 头部记录 `validation: host strict pass (N issues)`，与提交树哈希一起绑定本轮；reviewer 不再运行校验，也不需要 `openspec_inspect`。

draft brief 的开头在两种模式下相同：要求对抗性审阅，不声明读者是作者；独立 reviewer 不会被提示它写过规划材料。

独立 reviewer 的模型来自本变更 policy 锁定的 reviewer 模型：

- `source: "inherit"` 在锁定 policy 时解析执行变更的模型（先 `agentDefaultModel`，再发起变更的 agent），把 provider、model 与 effort 写进策略；解析不到时拒绝创建变更。
- `source: "explicit"` 使用配置里的 provider 与 model；模型暴露可选推理档位时带 `reasoningEffort`，否则按适配器默认。
- 启动前插件会核对 provider、model 与 effort 仍在 `llm` 目录里，任一不可用都在创建子会话之前失败；子会话通过 `agentOptions` 收到锁定的路由。

reviewer 侧只有三个动作：`read`（读 brief、按 `round` 读历史报告、读 finding 状态，或看就绪度）、`submit`（提交一份报告）、`status`（看就绪度）。`read` 的 `target` 为 `brief`、`own-report`（可带 `round`）、`findings` 与 `status`；`findings` 返回每条 finding 的 id、severity、status、title、首次轮次、验证轮次与最后验证状态，以及每轮的 verdict 与是否已有报告。`openspec_reviewer` 只在 `openspec-reviewer` preset 里注册，changer 的目录中不可见。

## 策略锁定

`openspec_new_change` 与首次评审都会写 `policy.json`，之后不再随配置改动。锁定内容：

- `reviews.draft`、`reviews.apply`：`enabled`、`reviewers`、`waitMinutes`、`reviewerModel`。
- `git.enabled`：创建时该目录是否有 git 仓库。
- `change`、`store`、`lockedAt`、`lockedBy`、`configHash`。

更早的 policy 没有 `reviewerModel` 时，下一次 `start` 或 `resume` 会解析一次并补写字段；已有模型的策略不会被重写，所以事后修改配置页只影响新变更。改动默认值不会移动已锁定评审的模型或等待上限。

## 报告与 finding

报告由 `verdict`、`summary`、`findings`、`verifications`、`outOfScope`、`residualRisks` 组成：

- `verdict`：`pass`、`changes-requested` 或 `blocked`。`blocked` 表示评审无法进行，原因写进 `summary` 或 finding。
- `findings`：每条含 `id`（如 `R1-01`）、`severity`、`axis`、`location`、`title`、`problem`、`evidence`、`suggestion`；`critical` 与 `major` 还必须给出 `impact`、`rule`、`failure`。
- `severity`：`critical`、`major`、`minor`、`nit`。前两者是阻塞项。
- `axis`：`intent`、`coherence`、`spec-conflict`、`standards`、`feasibility`、`quality`。
- `verifications`：后续轮次逐条声明上一轮 finding 的状态：`verified-fixed`、`still-open`、`regressed`。

字段只校验类型与非空：`summary`、finding 的文本字段、`verification.evidence` 以及 `outOfScope`/`residualRisks` 的条目都不设字符上限，后两个数组也不设条数上限。报告在写入前整体校验，任一结构错误都会拒绝整份报告。

finding 的处置：

| 动作 | 要求 | 语义 |
| --- | --- | --- |
| `dispose status=fixed` | 需要 note | 已修复，等待后续轮次验证 |
| `dispose status=deferred` | 需要 note | 阻塞项不可 deferred（`critical`/`major` 会被拒绝）；后续 issue 编号写进 note |
| `dispose status=rejected` | 需要带证据的 note | 阻塞项不可 rejected |
| `waive` | 需要 `approvedBy: "user"` 与 waiver 文本 | 由用户明确豁免，记录在案 |
| 后续报告 `verified-fixed` | 验证轮次必须晚于首次轮次 | 真正关闭 finding |

`dispose` 与 finding 的 `waive` 接受 `dispositions` 数组，一次处置多条 finding；只有一条时仍可用单条 `id` 写法，两种写法不能同时出现。`dispose` 的每条带自己的 `id`、`status` 与 `note`；`waive` 的条目只需 `id`，`status` 固定为 `waived`，`waiver` 与 `approvedBy` 可由顶层提供默认值。整批先校验后写入，任一条无效时所有 finding 保持不变；重复 `id` 或未知 `id` 会拒绝整批。`dispositions` 只属于 `action: "dispose"` 与 finding 的 `waive`；`start` 与 `resume` 不接受它，传入即拒绝并指向 `action: "dispose"`。

`issue` 参数已移除：`deferred` 必须给 note，旧记录中的 `issue` 字段保留原样但不读取，新处置不再写入。plan-change 的 `waive` 仍用 `files` 记录豁免，不接受 `dispositions`。

就绪度（readiness）要求：对象哈希与当前一致、最新报告存在且 `verdict` 为 `pass`、没有未关闭的 finding（`fixed` 尚未验证、`deferred`、`rejected`、无用户豁免的 `waived` 都算未关闭）。reviewer 被用户豁免时跳过“报告与 verdict”检查，但保留覆盖缺口标记。任一 finding 仍为 `open` 时，下一步动作固定为 `openspec_review action=dispose`，即使对象已变化或有 finding 已是 `fixed`。

## 轮次汇报与信息卡

每轮结束由插件写一张信息卡文件，模型不再复述报告。卡片文件位于变更的评审目录下 `cards/<sessionKey>-<phase>-<round>.json`，`sessionKey` 是会话 id 的短 SHA-256；文件携带完整 payload。客户端 `conversation.chat.turnTail` 通过评审通道端点 `reviewCards/get` 按当前会话与 turn 查询；Host 返回已绑定到该 turn 的卡片，并把本轮写入、尚未绑定的卡片绑定到该 turn，绑定持久化，刷新后仍返回。卡片不写入会话日志、不进入模型可见面；工具结果不携带卡片 payload；`action: "report"` 与 reviewer 的 `own-report` 仍返回完整报告。

写入点：

- 评审汇报：`self-report`（自评审）、reviewer `submit`（reviewer 会话）、changer `wait`（主会话）；`report` 作为补写，已写过时不重复。
- 处理汇报：`resume` 新开一轮且关闭轮已有报告与处置时；或处置后已就绪、下一步为 apply/archive 时最后一次 `dispose`/`waive`。
- 同一会话、同一轮、同一 phase 只写一次，由 review 记录的 `cards` 标记去重。

卡片形态：

- 默认折叠，摘要显示标题、轮次、结论、findings 计数与下一步；点击展开。
- 展开显示完整内容：报告的 verdict 与 summary、每条 finding 的 problem/evidence/impact/rule/failure/suggestion、verification evidence、处置 note 与 waiver、批准者与验证轮次、residualRisks、outOfScope、plan-change waiver（批准者、时间、文本、文件、draft/current hash）以及未就绪原因。
- 不设截断、不分页；展开区可滚动。标签固定中文，报告原文保留。

模型规则：每轮只写一句报告不能表达且用户需要知道的内容（取舍、授权、等待状态、下一步等）；不复述 findings、证据、风险、scope 或处置 note。reviewer 提交后不写评审总结，brief 已写明。卡片文件不进入模型可见面。

验证边界：验证只在自备的隔离干净 DSH 中进行；代理负责准备并运行卡片文件、端点、turn 绑定与渲染数据的自动化检查；不得安装、重启或修改开发宿主的 profile、配置与会话。无法在隔离 DSH 自动化的目视 GUI 检查才留作用户自验，不作为代理任务。插件不依赖 `@deepseek-ai/*` 包。

## 记录布局

评审记录放在变更目录之外，归档后仍保留：

| 路径 | 内容 |
| --- | --- |
| `openspec/.review/<store>#<change>/policy.json` | 锁定的评审策略 |
| `openspec/.review/<store>#<change>/intent.md` | 首轮 `start` 写入的 draft 意图文本；`resume` 只读取，不修改 |
| `openspec/.review/<store>#<change>/review.json` | draft review 记录 |
| `openspec/.review/<store>#<change>/apply-review.json` | apply review 记录 |
| `openspec/.review/<store>#<change>/plan-change-waiver.json` | apply 阶段规划变更的用户豁免：原文、批准者、时间与文件清单 |
| `openspec/.review/<store>#<change>/round-<n>/brief.md` | draft 第 n 轮 brief |
| `openspec/.review/<store>#<change>/apply-round-<n>/brief.md` | apply 第 n 轮 brief |
| `openspec/.review/<store>#<change>/apply-round-<n>/diff.patch` | apply 第 n 轮 diff |
| `openspec/.review/<store>#<change>/cards/<sessionKey>-<phase>-<round>.json` | 一轮卡片文件；payload 完整，绑定后写入 `turn` |
| `openspec/.review/<store>#<change>/card-delivery.json` | 每会话投递水位，用于绑定 turn |
| `<git dir>/openspec-flow/apply.lock.json` 或 `openspec/.review/apply.lock.json` | 项目级 apply 锁；git 域在 worktree git directory，非 git 域在 OpenSpec 根；字段为 `schemaVersion`、`change`、`store`、`changeRoot`、`implementationRoot`、`startedAt` |

`<store>#` 在无 store 时为 `local#`。评审根通过 `openspec/.gitignore` 的 `.review/` 行忽略；有 git 的项目在写记录前用 `git check-ignore` 校验，无法忽略时拒绝写入。`review.json` 与 `apply-review.json` 还携带 `cards` 标记（sessionId、phase、round、at），写入前查重，保证同一会话、同一轮、同一 phase 只写一张卡；卡片文件本身以短 SHA-256 会话键命名，避免会话 id 进入路径。

## 失败处理

- **等待超时**：`action: "wait"` 返回 `waiting` 后 changer 结束本轮；`waitMinutes` 到期仍无报告时插件唤醒 waiter 并返回 `overdue`，可 `action: "extend"`（需 `approvedBy: "user"` 与 `reason`，`minutes` 1–15）或 `action: "abandon"`；`extend` 后应再次 `action: "wait"` 重新登记计时器。
- **reviewer 未提交**：`retry` 让同一 reviewer 再评一次，可重复调用；`replace` 用新子会话替换并记录原因，次数不限，`replacements` 保留每次替换的来源与原因。
- **reviewer 不可用**：用户可 `waive-reviewer`（需 `approvedBy: "user"` 与 waiver），记录覆盖缺口。
- **轮次上限**：draft 与 apply review 不设轮次上限；只要 finding 处置完成，`resume` 就开下一轮。`extend` 只延长等待上限。
- **finding 未处置**：`resume` 在有 `open` finding 时拒绝开新轮，错误列出全部 id 并指向 `action: "dispose"`；先处置再 `resume`。
- **dispositions 误用**：`start` 与 `resume` 携带 `dispositions` 会被拒绝；批量处置只属于 `dispose` 或 finding 的 `waive`。
- **评审被放弃**：`abandon` 后记录状态为 `abandoned`，同一变更不能重开 draft review；要重开须先移除评审记录。
- **对象已变**：draft 工件或 apply 的 HEAD tree 改变后，旧报告不再就绪；用 `resume` 开新一轮，或修正提交。
- **意图文件缺失或被改动**：`resume` 拒绝并提示移除评审记录；`start` 不会为已有记录重写 `intent.md`。
- **工作区不干净**：apply review 拒绝启动并列出未提交路径；其他 `openspec/changes/` 目录的未提交规划文件不算脏。
- **另一 change 持有 apply 锁**：apply、apply review 与 archive 拒绝，点名持有者与锁文件路径；draft review 仍可继续。成功归档会释放锁；暂停的 change 由用户删除锁文件释放，agent 必须先请求用户。
- **策略缺失**：没有 `policy.json` 的旧变更会在首次 `start` 时按当前设置补锁；记录存在但策略缺失时 `resume` 拒绝，需移除记录后重新 `start`。`ensurePolicy` 失败（例如 inherit 解析不到模型）不会留下目录或忽略行。

## 配置

评审默认值由插件行配置的 `reviews` 段提供，也可以在 Web GUI 的插件配置页编辑（Plugins → `dsh-openspec-flow` 行 → Configure），保存即写入 profile：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `reviews.draft.enabled` | `true` | 新变更是否锁定 draft review |
| `reviews.draft.reviewers` | `0` | 0 自评审，1 独立 reviewer |
| `reviews.draft.waitMinutes` | `15` | draft 等待上限，1–120 |
| `reviews.draft.reviewerModel` | `{ source: "inherit" }` | reviewer 模型来源 |
| `reviews.apply.enabled` | `true` | 新变更是否锁定 apply review |
| `reviews.apply.reviewers` | `0` | 0 自评审，1 独立 reviewer |
| `reviews.apply.waitMinutes` | `15` | apply 等待上限，1–120 |
| `reviews.apply.reviewerModel` | `{ source: "inherit" }` | reviewer 模型来源 |

配置页保存分两阶段校验：先按 Config schema 校验形状与上下界，再用 `llm` 目录校验显式模型的 provider、model 与 effort；两次都通过才调用 `configEditor.edit`。拒绝时文件不变，页面显示原因。保存成功后插件行重启，已锁定策略不受影响。

### 等待与唤醒

`openspec_review` 的 `action: "wait"` 不轮询：它读取评审记录（守卫读、锁内写入重读与写入后结果读），返回 `waiting`、`ready` 或 `overdue`。`waiting` 时 changer 结束当前轮次；reviewer 提交报告后，插件通过 `subagents.sendMessage` 的 steer 消息唤醒记录中的 changer（以及等待中的 waiter）；`waitMinutes` 到期仍未提交且 reviewer slot 仍 live 时，插件唤醒 waiter 并提示 `extend` 或 `abandon`；slot 不再 live 时跳过唤醒并记录 warning。`extend` 之后应再次 `wait` 以重新登记计时器。等待计时器是进程内的：插件或 Host 重启会丢失未触发的计时器，恢复后由 `status` 或下一次 `wait` 重新判断。

## 示例：reviewers 0（自评审）

```text
openspec_new_change { "name": "add-export-api", "description": "Add a CSV export endpoint." }
# 写 proposal / specs / design / tasks 后：
openspec_review { "action": "start", "change": "add-export-api",
                  "intent": "Export the issue list as CSV; keep the existing JSON API unchanged." }
# 读 brief，按 brief 的 axes 自查后：
openspec_review { "action": "self-report", "change": "add-export-api",
                  "report": { "verdict": "pass", "summary": "Artifacts are coherent.",
                              "findings": [], "verifications": [],
                              "outOfScope": [], "residualRisks": [] } }
# draft 就绪后封存（git 项目）：只提交变更目录与 openspec/.gitignore
openspec_apply_next { "change": "add-export-api" }
# 实现、测试、逐轮提交后：
openspec_review { "action": "start", "review": "apply", "change": "add-export-api" }
openspec_review { "action": "self-report", "review": "apply", "change": "add-export-api",
                  "report": { "verdict": "pass", "summary": "The commit matches the reviewed plan.",
                              "findings": [], "verifications": [],
                              "outOfScope": [], "residualRisks": [] } }
openspec_archive { "change": "add-export-api" }
```

## 示例：reviewers 1（独立 reviewer）

```text
# 新变更的 draft 与 apply 段都锁定 1 名 reviewer（配置页或 profile 里的 reviews.*.reviewers: 1）
openspec_new_change { "name": "add-export-api" }
openspec_review { "action": "start", "change": "add-export-api",
                  "intent": "Export the issue list as CSV; keep the JSON API unchanged." }
openspec_review { "action": "wait", "change": "add-export-api" }
# reviewer 会话内：
#   openspec_reviewer { "action": "read", "target": "brief", "change": "add-export-api", "review": "draft", "slot": 1 }
#   openspec_reviewer { "action": "submit", "change": "add-export-api", "review": "draft", "slot": 1, "report": { ... } }
openspec_review { "action": "report", "change": "add-export-api" }
# 有 finding 时一次传入全部处置；只有一条时仍可用单条 id 写法：
openspec_review { "action": "dispose", "change": "add-export-api",
                  "dispositions": [
                    { "id": "R1-01", "status": "fixed", "note": "Added the missing scenario." },
                    { "id": "R1-02", "status": "deferred", "note": "Follow up in ISS-42." } ] }
openspec_review { "action": "dispose", "change": "add-export-api", "id": "R1-03",
                  "status": "fixed", "note": "Named the new requirement." }
openspec_review { "action": "resume", "change": "add-export-api" }
# 下一轮报告用 verifications 声明 R1-01 为 verified-fixed，就绪后：
# draft 就绪后封存（git 项目）：只提交变更目录与 openspec/.gitignore
openspec_apply_next { "change": "add-export-api" }
# 实现并逐轮提交后，apply review 首轮以 start、后续轮次以 resume，再 wait / report，最后：
openspec_archive { "change": "add-export-api" }
```

独立 reviewer 未按时提交时：`wait` 返回 `waiting` 后结束本轮，等 reviewer 提交或超时唤醒；仍无报告时用 `retry` 重试，再用 `replace` 换人，或由用户批准后 `waive-reviewer`。

## 相关文档

- `README.md`：工具表、配置字段与安装。
- `openspec/specs/change-review/spec.md`：评审行为的需求与场景。
- `openspec/specs/review-configuration/spec.md`：配置页与 Host 通道。
