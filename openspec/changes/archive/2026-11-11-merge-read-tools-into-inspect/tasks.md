# Tasks

## 1. Inspect 工具与 action 分发

- [x] 1.1 把 `query.js` 的六个注册函数改为内部 `readX(ctx, settings, args, exec)` handler，保留原 CLI argv、schema gate 与投影调用；验证：现有 query 相关单测仍通过。
- [x] 1.2 新增 `registerInspectTool`，声明 `action` 枚举与九个平铺参数；验证：工具注册测试断言参数集合与 `action` 必填。
- [x] 1.3 在 `execute` 内按 action 校验参数组合并在任何 `runOpenSpec` 之前抛错；验证：`test/inspect.test.mjs` 覆盖缺参、错位参数与未知 action，且 fake context 的 spawn 计数为 0。
- [x] 1.4 实现六个 action 到六个 handler 的分发，返回原投影；验证：同一输入下每个 action 的结果与该投影函数输出逐字节一致。
- [x] 1.5 构造严格 `oneOf` output schema：六个顶部分支，`list` 与 `instructions` 各含嵌套 `oneOf`；验证：每个 action 的结果恰好命中一个顶部分支，`assertSupportedJsonSchema` 在注册时通过。
- [x] 1.6 把 `lib/tools/index.js` 的六次注册替换为一次 `registerInspectTool`；验证：注册表测试断言核心工具为 5 个、总数为 8 个、六个旧名不存在。

## 2. 工具引用与 CLI 映射

- [x] 2.1 把 `projectStatus` 的 `nextSteps` 改为 `openspec_inspect` 并补 `action: "instructions"`，`openspec_apply_next` 分支不变；验证：status 投影测试断言 tool 与 arguments，且其余字段不变。
- [x] 2.2 把 `projectContextMember` 的 `fetch` 改为 `openspec_inspect` 并补 `action: "show"`，同步 `note`；验证：context 投影测试断言 fetch 形状，且 members 其余字段不变。
- [x] 2.3 改写 `mapInstructionCommands`，把 `openspec list --specs`、`openspec show`、`openspec validate` 映射为 `openspec_inspect` 带 action 的文本；验证：instructions 文本测试断言无 `openspec ` 命令片段且含 `action: "list"` 等。
- [x] 2.4 把五份技能里的六个读工具调用改为 `openspec_inspect` 带 action，步骤编号与顺序不变；验证：skills 测试通过，且 `grep` 在 `skills/` 无六个旧名。
- [x] 2.5 把 `lib/policy.js` 的工具引用改为 `openspec_inspect` 带 action；验证：policy 测试通过，且 `grep` 无六个旧名。
- [x] 2.6 更新 `README.md` 的工具表、CLI 对照表与技能对照表，使六个读命令行都指向 `openspec_inspect` 并写明 action；验证：`grep` 无六个旧名，且六行都含 `action`。

## 3. 回归测试与门禁

- [x] 3.1 新增 `test/inspect.test.mjs`，覆盖 action 路由、参数错误、`oneOf` 唯一命中与未启动 CLI；验证：`node --test test/inspect.test.mjs` 通过。
- [x] 3.2 新增扫描测试，检查 `skills/`、`lib/policy.js` 与 `README.md` 不含六个旧工具名；验证：测试失败时输出文件名与旧名。
- [x] 3.3 更新 `test/integration.test.mjs`、`test/descriptions.test.mjs` 与 `test/skills.test.mjs` 的调用与断言；验证：`node --test test/` 通过。
- [x] 3.4 把 `package.json` 版本升到 `0.3.0`，同步五份技能的 `metadata.generatedBy`；验证：skills 测试通过。
- [x] 3.5 运行 `npm test`、`npm run coverage:check` 与 `openspec_validate`（`strict: true`）；验证：三条命令均通过。

## 4. 集成验证

- [x] 4.1 在临时 fixture 上走完整流程：`openspec_inspect` 的 list、status、instructions、validate，创建变更，apply 与 archive；验证：e2e 测试通过，归档目录与主 specs 合并结果符合预期。
- [x] 4.2 在注册测试中记录 `openspec_inspect` 的 `name + description + parameters` 字符数；验证：断言小于被替换的 3,820 字符。

## Workflow follow-up

- 用户要求归档时再执行 `openspec_archive`。
- 归档后同步 `dsh-openspec-flow-eval` 的技能文本与对照运行；该仓库不在本次变更范围。
