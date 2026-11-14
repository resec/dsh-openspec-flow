# Tasks

## 1. 修复 reviewer preset 配置

- [x] 1.1 在 `cordis.patch.yml` 的 `openspec-reviewer` preset 中，为 `tool-fs-search` 条目增加 `config.sampleOverCapGlobResults: false`，与 `dsh-base` 的值一致。验证：`grep -A 4 "id: tool-fs-search" cordis.patch.yml` 显示该键位于该条目下，且 YAML 可被解析。
- [x] 1.2 扩展 `test/review.test.mjs` 的 preset 测试，断言 `sampleOverCapGlobResults: false` 与该 preset 的 fs-search 条目同时出现，保留只读与导出断言。验证：`node --test test/review.test.mjs` 通过。

## 2. 验证独立 reviewer 可启动

- [x] 2.1 重新加载插件或重启 DSH 使新的 preset 生效，然后启动一个 `reviewers: 1` 的 draft review（可在恢复 `fix-apply-review-without-git` 后执行），确认不再出现 `$.sampleOverCapGlobResults missing required value`。验证：`openspec_review` 的 `action: "start"` 成功，`action: "status"` 显示 `mode: "reviewer"`。

## 3. 集成验证

- [x] 3.1 在 Node 24 运行 `npm test` 与 `npm run coverage:check`。验证：两条命令退出码为 0，覆盖率门槛通过。
- [x] 3.2 运行 `npm run contract:check` 与 `npm run openspec:check`。验证：两条命令退出码为 0。

## Bootstrap

- 1.1 与 1.2 的代码与测试在本 change 的 draft review 之前应用；复选框在 apply 阶段标记。
- 本 change 的 draft 与 apply review 按用户要求使用自评审；policy 的 `reviewers` 为 `0`，`lockedBy` 记录为 `user-override:self-review`。
- 2.1 是 live 验证，可在插件重新加载或 DSH 重启后执行，不阻塞自评审的 draft 与 apply。

## Workflow follow-up

- 提交实现后运行 apply review；修复全部 blocker 直至 ready。
- 归档仅在用户明确要求时执行。
- 归档后提交归档产物与合并后的规格，并推送到 `origin/main`。
- 本 change 完成后，恢复 `stash@{0}`（`fix-apply-review-without-git` 的规划工件）并继续该变更的 draft review。
