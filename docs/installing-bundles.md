# 安装与重装

本文说明本插件以本地 npm tarball 包安装时的产物、打包、安装、重装与回退。评审如何使用已装副本见 [`review.md`](review.md)。

## 产物

一次打包产生两个文件，位于仓库的 `dist/` 目录：

| 文件 | 内容 |
| --- | --- |
| `<name>-<version>.tgz` | 由 `npm pack` 生成的安装包，含 `package.json` 及其 `files` 列出的文件（`README.md`、`LICENSE` 为文档） |
| `<name>-<version>.json` | 元数据：`name`、`version`、`file`、`sha512`、`bytes`、`files`、`revision`、`dirty`、`at` |

`revision` 记录打包时的 `HEAD` 提交，是产物来源的标识；成功产物中 `dirty` 恒为 `false`。`dist/` 被版本控制忽略，产物可由提交重新生成。

## 打包

在仓库根目录执行：

```text
npm run bundle:pack
```

前提与行为：

- 工作树必须干净；未提交的改动会让 `revision` 不描述包内容，命令列出脏路径并退出非零。
- 同一版本已存在产物时拒绝覆盖；确实需要重发同一版本时加 `--force`，两个文件一起替换并记录新的 `revision`。
- 打包先写入 `.cache/pack/`，读取 tarball 字节校验必含内容与禁含路径；校验通过后才发布到 `dist/`，失败时 `dist/` 保持原样，临时目录在成功和失败后都会删除。
- 必含内容分两层：无条件核心集（`package.json`、`index.js`、`client.js`、`reviewer.js`、`cordis.patch.yml`、`icon.svg`、`lib/` 全部文件、`skills/` 全部文件、`locale/*.json`）与 `files` 列出的文件；核心集不依赖 `files`，所以清单删掉入口文件也会被拒绝。
- 禁含 `test/`、`openspec/`、`scripts/`、`node_modules/`、`dist/`。
- 脚本不写 profile、不调用插件管理器，也不在 profile 目录运行包管理器。

命令在 Node 24 上运行，与 `engines.node` 一致。

## 安装

1. 在 DSH 的 Plugins 页面移除已安装的 `dsh-openspec-flow`（首次从 `link:` 切换时必须移除，否则管理器会拒绝同一依赖规格）。
2. 安装 `dist/` 中刚生成的 tarball。
3. 重启会话，让新安装的 Host 代码生效。

安装后插件行 id 为 `openspec-flow`，依赖 `@fission-ai/openspec` 由 profile 的包管理器一并安装。

## 重装与冻结

已安装的包在 profile 自己的 `node_modules` 内运行，不是工作区源码。编辑工作区源码不会改变已装副本，也不会触发 HMR 重载；评审器按已装版本完整完成评审，不需要为每个提交重新打包或安装。

需要新插件逻辑生效时（例如本插件自身的功能完成后、或发布新版本时）才重装：

```text
npm run bundle:pack -- --force
```

然后在 Plugins 页面先移除、再安装该 tarball。重装会短暂停止插件，宜放在评审轮次之间。

## 回退

在 Plugins 页面移除当前 bundle，再安装上一版本的 tarball；上一版本已被覆盖时，从对应提交重新打包后安装。回退不手写 profile 的依赖或 patch。

## 限制

- `git clean -xfd` 会删除 `dist/` 与 `.cache/`。两者都可由提交重新生成。
- 安装需要访问 registry 获取 `@fission-ai/openspec`；离线或被镜像阻塞时安装失败，插件在装回上一版本前不可用。
- 包形态不随工作区改动重载；这一冻结是有意行为，不是故障。
