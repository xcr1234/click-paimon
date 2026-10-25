# 贡献指南

## 先知道一件事：`.gitignore` 是白名单

这个仓库的 `.gitignore` 第一行是 `*`——**默认忽略一切**，只有被 `!` 重新包含的路径才会进入提交。

这么做是为了防止作者本地的工程存档、备份、编辑器配置和日志被误传。对贡献者的影响：

- 你新增的文件**不会**自动被 Git 看见。要提交，就得同时改 `.gitignore`，加一条 `!` 条目（精确到文件，或者 `!/某目录/**`）。
- 如果加的是目录级通配，请确认该目录里没有本地文件会连带进来。
- 提交前跑 `npm run check`，它会检查有没有文件绕过了白名单、有没有本机路径/账号/凭据泄漏、JSON 能不能解析、文档内链是不是还能点开。

## 环境

Node.js 22.19+，依赖全部装在项目内：

```sh
npm ci
```

## 改代码的流程

1. 改 `src/**/*.lua`（不要手改 `dist/`，那是生成物）。
2. `npm run build` —— 打包并生成内联了源码的 `dist/click-paimon.save.json`。
3. `npm run test:lua-bundle` —— 打包器回归。
4. 用模拟器加载 `dist/click-paimon.save.json` 回放 [`game/tests`](game/tests) 里的用例，确认行为没变。
5. `npm run check`，然后提交。

## 代码约定

- `src/main.lua` 只放 `OnStart` / `OnUpdate` / `OnDestroy` 三个回调并转交给模块，不放业务逻辑。
- 模块用静态 `require("game.runtime")`，模块返回 table，状态用 `local`。打包器会拒绝动态、别名或被遮蔽的 `require`，详见 [Lua 模块化指南](docs/lua-modules.md)。
- 可调数字放 [`src/config.lua`](src/config.lua)，别在逻辑里留魔数。
- 控件名在 `runtime.lua` 和 `game/ui.save.json` 里各有一份，改名必须同时改。

## 不要提交的东西

本地工程存档与备份（`workspace/`、`.qxqy-guid-sync-backups/`）、编辑器配置（`.codex/`）、`dist/`、`node_modules/`、任何 `.env`、日志、密钥，以及带**本机绝对路径、私人邮箱、账号名、代理端口**的截图或文档。

`npm run check` 的规则列表在 [`tools/audit-public.mjs`](tools/audit-public.mjs) 顶部，需要时可以在那里补规则。

## 提交信息

一句话说清改了什么就行，中文英文都可以，例如：

```text
修复手机端 HUD 出屏
docs: 补头像渲染管线说明
```

多个不相关的改动请分开提交。

## 素材与版权

派蒙形象及相关素材版权归米哈游。提交新的美术资源前，确认它允许被公开分发，并在需要时于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 注明来源。
