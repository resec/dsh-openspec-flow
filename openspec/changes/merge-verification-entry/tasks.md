# Tasks

## 1. 验证入口

- [x] 1.1 在 `package.json` 增加 `verify` 脚本，取值与 `coverage:check` 一致（`node scripts/coverage.mjs --check`）；用 `node -e` 读取 `scripts.verify` 并断言等于该字符串。
- [x] 1.2 把 `.githooks/pre-push` 的覆盖率步骤从 `npm run coverage:check` 改为 `npm run verify`，保留 `COVERAGE_SKIP=1` 分支；同时把 `scripts/install-hooks.mjs` 的安装提示改为 `npm run verify`；用 `grep` 确认这两个文件都不再出现 `coverage:check`。
- [x] 1.3 更新 `test/hooks.test.mjs`：钩子调用序列断言改为 `['run openspec:check', 'run verify']`；新增两条断言，一条钉住 `scripts.verify` 与 `scripts.coverage:check` 指向同一命令，一条钉住 `scripts/install-hooks.mjs` 的提示含 `npm run verify` 且不含 `coverage:check`；运行 `node --test test/hooks.test.mjs` 确认通过。

## 2. 文档同步

- [x] 2.1 更新 `AGENTS.md` 第 5 步与 `## Verification`：完成判据改为 `npm run verify`，并保留对 strict 校验的独立要求；用 `grep` 确认 `AGENTS.md` 中不再把 `npm test` 与 `coverage:check` 并列为完成判据。
- [x] 2.2 更新 `README.md` 中承担完成判据与钩子说明的段落（「覆盖率」小节末句、「验证」小节的 pre-push 段、「自举开发」收尾、「发布顺序」第 1 步），改为 `npm run verify`；保留测试覆盖面描述与 `npm test` 复跑说明，作为低层入口继续成立；用 `grep` 确认这些段落不再出现 `coverage:check`，且 `npm test` 只出现在非完成判据的语境。
- [x] 2.3 更新 `docs/upgrading-openspec-cli.md` 与 `docs/upgrading-dsh-runtime.md` 的测试矩阵、发布顺序与验收清单，把「`npm test` + `npm run coverage:check`」并列改为 `npm run verify`；用 `grep` 确认两份文档的完成判据不再并列这两个命令。

## 3. 集成验证

- [x] 3.1 在 Node 24 上运行 `npm run verify`，确认输出同时含测试摘要与覆盖率判定，且过程中没有第二次全量测试；记录退出码为 0。
- [x] 3.2 运行 `npm test` 确认低层入口仍可用；随后运行 `openspec_inspect`（`action: "validate"`，`strict: true`）确认通过。
