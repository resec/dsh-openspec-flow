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
| apply | 已提交的 git tree（`HEAD^{tree}`） | 每次 `start` 或 `resume` 读取；工作区必须干净，提交之外的内容不进入评审 |

apply review 需要 git 仓库、干净工作区与至少一个提交。没有 git 的项目只能用 draft review；`openspec_new_change` 在锁定策略时忽略 apply review 的启用设置，把新建策略的 apply 段关闭。旧的策略文件可能仍记录 `reviews.apply.enabled: true`，status 会报告 `policy: true`、`enabled: true`、`available: false`，`openspec_archive` 不会等待它。无策略或只有 draft 段的旧 change 报告 `policy: false`，首次 apply start 会锁定或迁移策略。

## 阶段与闸门

1. `openspec_new_change` 创建变更目录前先为本变更锁定评审策略（`policy.json`），并把已解析的 reviewer 模型写入策略。
2. planning 工件写完后调用 `openspec_review`（`action: "start"`，默认 `review: "draft"`），把用户目标与验收条件放进 `intent`；`start` 只用于首轮。
3. draft review 就绪后 `openspec_apply_next` 才返回下一任务；需要下一轮时用 `action: "resume"`，不传 `intent`。
4. 实现并提交后调用 `openspec_review`（`action: "start"`、`review: "apply"`），审阅 brief 与 diff；后续轮次同样用 `resume`。
5. apply review 就绪后，或 apply review 不可用、禁用，或策略没有 apply 段时，`openspec_archive` 执行归档并合并 delta specs。

任一步都可以先用 `openspec_review` 的 `action: "status"` 查看 state、round、就绪原因与下一动作；apply status 还返回 `policy`、`enabled`、`available`。`action: "report"` 读回已提交的报告。

### apply status 字段

- `policy`：策略是否存在 apply 段；只有 draft 段的旧策略为 false。
- `enabled`：apply 段是否启用；`policy` 为 false 时为 false。
- `available`：项目是否有 git；为 false 时优先于无策略。

不可用、无策略或禁用时 status 不报错，返回 `ready: false` 与下一动作：不可用或禁用指向 `openspec_archive`，无策略或 draft-only 指向 `openspec_review` 的 `start`。

## reviewer 模式

每个评审段有 `reviewers` 设置：

- `0`：changer 自评审。用 `openspec_review` 的 `action: "self-report"` 提交本轮报告；这是唯一接受自报告的配置。
- `1`：独立 reviewer。首轮 `start` 时插件通过 subagent 的 `spawn` provider 启动一个 `openspec-reviewer` preset 的子会话，该 preset 只挂 `read`、`fs` 搜索、`web_search`、`web_fetch` 与 `openspec_reviewer` 工具，不加载写工具、bash、子代理或 workflow，因此 reviewer 不能修改工作区。联网能力由部署为 Host `web` 服务选择的 provider 提供：preset 不挂载、不选择 provider，`web_search` 与 `web_fetch` 分别使用 Host 为 search 与 fetch 选择的 provider；每个工具是否出现在某一步，取决于为该项操作选择的 provider 对该步模型路由是否就绪，一个工具被隐藏不影响另一个。所选 provider 决定抓取的目标范围；默认匿名 HTTP provider 不限制目标地址，可达回环、私网与云元数据地址，需要隔离时应更换 provider 或添加 `tools/pre-execute` 策略。reviewer 的 persona 为 `complete: true`，工具自带的系统提示不会渲染，web 结果的不可信声明由每次工具结果携带。Host 未提供 `web` 服务时，该 preset 不能组装 reviewer 会话。每个新的 draft/apply 轮次都会唤醒同一个 reviewer 读取新 brief；只有 `replace` 会启动新 reviewer。对尚无报告的轮次再次 `resume` 只会复用该轮，不会重复唤醒。

draft brief 的开头在两种模式下相同：要求对抗性审阅，不声明读者是作者；独立 reviewer 不会被提示它写过规划材料。

独立 reviewer 的模型来自本变更 policy 锁定的 reviewer 模型：

- `source: "inherit"` 在锁定 policy 时解析执行变更的模型（先 `agentDefaultModel`，再发起变更的 agent），把 provider、model 与 effort 写进策略；解析不到时拒绝创建变更。
- `source: "explicit"` 使用配置里的 provider 与 model；模型暴露可选推理档位时带 `reasoningEffort`，否则按适配器默认。
- 启动前插件会核对 provider、model 与 effort 仍在 `llm` 目录里，任一不可用都在创建子会话之前失败；子会话通过 `agentOptions` 收到锁定的路由。

reviewer 侧只有三个动作：`read`（读 brief 或报告）、`submit`（提交一份报告）、`status`（看就绪度）。`openspec_reviewer` 只在 `openspec-reviewer` preset 里注册，changer 的目录中不可见。

## 策略锁定

`openspec_new_change` 与首次评审都会写 `policy.json`，之后不再随配置改动。锁定内容：

- `reviews.draft`、`reviews.apply`：`enabled`、`reviewers`、`maxRounds`、`waitMinutes`、`reviewerModel`。
- `git.enabled`：创建时该目录是否有 git 仓库。
- `change`、`store`、`lockedAt`、`lockedBy`、`configHash`。

更早的 policy 没有 `reviewerModel` 时，下一次 `start` 或 `resume` 会解析一次并补写字段；已有模型的策略不会被重写，所以事后修改配置页只影响新变更。改动默认值不会移动已锁定评审的模型或轮次上限。

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
| `dispose status=deferred` | 需要 note 或 issue | 阻塞项不可 deferred（`critical`/`major` 会被拒绝） |
| `dispose status=rejected` | 需要带证据的 note | 阻塞项不可 rejected |
| `waive` | 需要 `approvedBy: "user"` 与 waiver 文本 | 由用户明确豁免，记录在案 |
| 后续报告 `verified-fixed` | 验证轮次必须晚于首次轮次 | 真正关闭 finding |

就绪度（readiness）要求：对象哈希与当前一致、最新报告存在且 `verdict` 为 `pass`、没有未关闭的 finding（`fixed` 尚未验证、`deferred`、`rejected`、无用户豁免的 `waived` 都算未关闭）。reviewer 被用户豁免时跳过“报告与 verdict”检查，但保留覆盖缺口标记。

## 记录布局

评审记录放在变更目录之外，归档后仍保留：

| 路径 | 内容 |
| --- | --- |
| `openspec/.review/<store>#<change>/policy.json` | 锁定的评审策略 |
| `openspec/.review/<store>#<change>/intent.md` | 首轮 `start` 写入的 draft 意图文本；`resume` 只读取，不修改 |
| `openspec/.review/<store>#<change>/review.json` | draft review 记录 |
| `openspec/.review/<store>#<change>/apply-review.json` | apply review 记录 |
| `openspec/.review/<store>#<change>/round-<n>/brief.md` | draft 第 n 轮 brief |
| `openspec/.review/<store>#<change>/apply-round-<n>/brief.md` | apply 第 n 轮 brief |
| `openspec/.review/<store>#<change>/apply-round-<n>/diff.patch` | apply 第 n 轮 diff |

`<store>#` 在无 store 时为 `local#`。评审根通过 `openspec/.gitignore` 的 `.review/` 行忽略；有 git 的项目在写记录前用 `git check-ignore` 校验，无法忽略时拒绝写入。

## 失败处理

- **等待超时**：`action: "wait"` 在 `waitMinutes` 内没有报告时返回等待片段与剩余时间；可继续 `action: "wait"`、`action: "extend"`（需 `approvedBy: "user"` 与 `reason`，`minutes` 1–15 或 `maxRounds`）或 `action: "abandon"`。
- **reviewer 未提交**：`retry` 让同一 reviewer 再评一次，可重复调用；`replace` 用新子会话替换并记录原因，次数不限，`replacements` 保留每次替换的来源与原因。
- **reviewer 不可用**：用户可 `waive-reviewer`（需 `approvedBy: "user"` 与 waiver），记录覆盖缺口。
- **轮次上限**：达到 `maxRounds` 后 `resume` 拒绝新轮次，需要 `extend maxRounds`（`unlimited` 表示不限）。
- **评审被放弃**：`abandon` 后记录状态为 `abandoned`，同一变更不能重开 draft review；要重开须先移除评审记录。
- **对象已变**：draft 工件或 apply 的 HEAD tree 改变后，旧报告不再就绪；用 `resume` 开新一轮，或修正提交。
- **意图文件缺失或被改动**：`resume` 拒绝并提示移除评审记录；`start` 不会为已有记录重写 `intent.md`。
- **工作区不干净**：apply review 拒绝启动并列出未提交路径。
- **策略缺失**：没有 `policy.json` 的旧变更会在首次 `start` 时按当前设置补锁；记录存在但策略缺失时 `resume` 拒绝，需移除记录后重新 `start`。`ensurePolicy` 失败（例如 inherit 解析不到模型）不会留下目录或忽略行。

## 配置

评审默认值由插件行配置的 `reviews` 段提供，也可以在 Web GUI 的插件配置页编辑（Plugins → `dsh-openspec-flow` 行 → Configure），保存即写入 profile：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `reviews.draft.enabled` | `true` | 新变更是否锁定 draft review |
| `reviews.draft.reviewers` | `0` | 0 自评审，1 独立 reviewer |
| `reviews.draft.maxRounds` | `3` | draft 轮次上限，1–50 |
| `reviews.draft.waitMinutes` | `15` | draft 等待上限，1–120 |
| `reviews.draft.reviewerModel` | `{ source: "inherit" }` | reviewer 模型来源 |
| `reviews.apply.enabled` | `true` | 新变更是否锁定 apply review |
| `reviews.apply.reviewers` | `0` | 0 自评审，1 独立 reviewer |
| `reviews.apply.maxRounds` | `5` | apply 轮次上限，1–50 |
| `reviews.apply.waitMinutes` | `15` | apply 等待上限，1–120 |
| `reviews.apply.reviewerModel` | `{ source: "inherit" }` | reviewer 模型来源 |

配置页保存分两阶段校验：先按 Config schema 校验形状与上下界，再用 `llm` 目录校验显式模型的 provider、model 与 effort；两次都通过才调用 `configEditor.edit`。拒绝时文件不变，页面显示原因。保存成功后插件行重启，已锁定策略不受影响。

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
openspec_apply_next { "change": "add-export-api" }
# 实现、测试、提交后：
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
# 有阻塞 finding 时逐条处置，然后开下一轮：
openspec_review { "action": "dispose", "change": "add-export-api", "id": "R1-01",
                  "status": "fixed", "note": "Added the missing scenario." }
openspec_review { "action": "resume", "change": "add-export-api" }
# 下一轮报告用 verifications 声明 R1-01 为 verified-fixed，就绪后：
openspec_apply_next { "change": "add-export-api" }
# 实现并提交后，apply review 首轮以 start、后续轮次以 resume，再 wait / report，最后：
openspec_archive { "change": "add-export-api" }
```

独立 reviewer 未按时提交时：先 `openspec_review { "action": "wait", ... }` 继续等，再 `retry`；仍无报告时用 `replace` 换人，或由用户批准后 `waive-reviewer`。

## 相关文档

- `README.md`：工具表、配置字段与安装。
- `openspec/specs/change-review/spec.md`：评审行为的需求与场景。
- `openspec/specs/review-configuration/spec.md`：配置页与 Host 通道。
