# 开发说明

## 环境

- Node.js **22.19+**（`package.json` 的 `engines`）。
- 依赖全都装在项目内，不装全局工具：`npm ci`。

## 命令

| 命令 | 做什么 | 要不要网络/模拟器 |
|---|---|---|
| `npm run check` | 公开仓库审计：本机路径、账号、凭据、代理端口泄漏；白名单越界；JSON 可解析；文档内链有效；`package.json` 脚本指向的文件存在 | 否 |
| `npm run build` | 打包 `src/` → `dist/click-paimon.lua`，并把产物内联进 `dist/click-paimon.save.json` | 否 |
| `npm run test:lua-bundle` | 打包器回归，8 个用例（语法检查、循环依赖、动态 require、行号映射、构建确定性…） | 否 |
| `npm run export:gia` | 构建后调用 `beyond-simulator-web` 导出 `dist/click-paimon.gia`，并做一次导入回环校验 | 否（本地起临时 Web 服务） |
| `npm run build:lua -- --root <src> --entry main --out <file>` | 只跑打包器，给别的游戏用 | 否 |
| `npm run build:lua:example` | 构建 `examples/lua-modular` 的最小示例 | 否 |

`npm test` = `build` + `test:lua-bundle`，可在 CI 里跑，不碰模拟器。

## 构建都做了什么

`npm run build`（[`tools/build-project.mjs`](../tools/build-project.mjs)）做三件事：

1. 用 [`tools/bundle-lua.mjs`](../tools/bundle-lua.mjs) 从 `src/main.lua` 出发，收集可达的 `require` 模块，拼成单个 Lua 文件。语法用 fengari 的 Lua 5.3 前端检查——**只查语法，不执行代码**。
2. 把产物完整内联进 `game/ui.save.json` 副本的 `assets.scripts[0].source`，写成 `dist/click-paimon.save.json`。千星只打包有脚本映射的文件，存档里 `source` 为空就等于没挂脚本。
3. 写 `dist/build.json`：模块数、产物路径、`sha256`。

生成的 `dist/` 不入库（`.gitignore` 白名单里没有它）。**不要手改 `dist/`**：下次构建会覆盖；真机上临时改的东西要合并回 `src/**` 再重新构建。

模块写法和打包器的边界（静态 `require`、禁止 `../`、循环依赖处理、报错行号怎么换算）见 [Lua 模块化指南](lua-modules.md)。

## 改代码时的注意点

- `src/main.lua` 只保留三个生命周期回调，实现全部放模块里；新功能按职责加 `src/game/*.lua`、`src/ui/*.lua`。
- 所有可调数字进 [`src/config.lua`](../src/config.lua)：时长、头像模板索引、结算信号名、音效编号。改逻辑时顺手把魔数搬进去。
- `imageTemplateId` 是**你自己关卡里那张「仅存为模板」的客户端图片控件的模板索引**，不是静态图片 ID。每个关卡都不一样，填错会在日志里打 `avatar template ID not configured` 并退回旧版头像。
- 控件名（`StartButton`、`PaimonTarget`、`ScoreText`…）在 [`src/game/runtime.lua`](../src/game/runtime.lua) 的 `child(root, "...")` 里硬编码，和 [`game/ui.save.json`](../game/ui.save.json) 的控件树一一对应。改控件名必须同步改两边，否则运行时 `error("缺少客户端控件")`。

## 游戏行为用例

[`game/tests/*.json`](../game/tests) 是模拟器的 `runCase` 用例：`events` 里放操作，`asserts` 里断言控件字段或日志。仓库里没有附带回放脚本——用 `beyond-simulator-mcp` 的 `qxqy_studio_play`（`action: "runCase"`）对着 `dist/click-paimon.save.json` 跑即可，画布选 `mobile-16-9` 或 `pc-16-9`。

用例文件本身是可读的行为文档：`boot.json` 说明启动后应看到标题、`ReadyTitle` 文案和可见的开始按钮；`first-success` / `first-fail` 说明首次命中的正负路径。

## 可选：连千星知识库查 API

[`tools/miliastra-toolbox-mcp.mjs`](../tools/miliastra-toolbox-mcp.mjs) 是一个 MCP stdio 适配器，按 [dsh-plugin-miliastra-toolbox](https://github.com/1475505/dsh-plugin-miliastra-toolbox) 的六项工具契约调用远端知识库，用来查节点、客户端控件和 Lua API 的官方说明。默认指向 `https://ugc.070077.xyz`，可用环境变量 `MILIASTRA_KNOWLEDGE_BASE_URL` 覆盖；需要网络。它只服务开发期查询，不参与构建，也不影响游戏运行。
