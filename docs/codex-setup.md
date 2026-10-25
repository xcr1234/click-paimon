# 项目级 Codex 接入指南

本项目是在「**千星沙箱模拟器 + 千星知识库 + AI 编码助手（Codex）**」这套工作流下做出来的：AI 直接读写控件树存档、试玩截图、查官方节点/控件/Lua 文档，人只做决策和真机验收。

这份指南把同样的环境接到**任意一个千星项目**里，不改 Codex 全局配置。

## 先看视频教程

**[千星沙箱模拟器 | 2D 奇域 AI 工作流教程](https://www.bilibili.com/video/BV1goHj6REq4/)**（UP 主：神奇嘟嘟可，4 集）

| 分集 | 时长 | 内容 |
|---|---|---|
| P0 | 01:08 | 系列介绍 |
| P1 | 11:27 | 千星沙箱模拟器的介绍和安装 |
| P2 | 01:05 | 千星沙箱知识库的集成 |
| P3 | 02:20 | 2D 美术素材构建工具 |

配套资源：

- 讲义：<https://ppt.070077.xyz/beyond-ai/index.html>
- 千星沙箱模拟器：<https://github.com/1475505/miliastra-beyond-simulator>
- 千星奇域工具箱（知识库）：<https://ugc.070077.xyz>

## 准备工作：把哪些文件抄进新项目

新项目根目录准备这样的结构（都可以从本仓库复制）：

```text
新项目/
├─ .codex/config.toml              # 下面第三节给出模板，需要按你的路径改
├─ tools/
│  ├─ miliastra-toolbox-mcp.mjs    # 知识库 MCP 适配器（六项查询工具）
│  ├─ bundle-lua.mjs               # Lua 模块源码打包为单文件
│  ├─ build-project.mjs            # 打包 + 内联进存档 + 构建记录
│  └─ export-project.mjs           # 导出 GIA（可选）
├─ scripts/test-lua-bundle.mjs     # 打包器回归
├─ docs/lua-modules.md             # 模块化约定
├─ examples/lua-modular/src/       # 最小示例（不要复制它的 dist）
├─ AGENTS.md                       # 给 AI 的项目约定
├─ package.json
└─ package-lock.json
```

`tools/miliastra-toolbox-mcp.mjs` 是为 Codex 写的本地 MCP 适配器：按 [dsh-plugin-miliastra-toolbox](https://github.com/1475505/dsh-plugin-miliastra-toolbox) 提交 `f35d55c1109bb7d822e48b22695335278e7208bc` 的六项工具契约调用远端知识库。**只抄 `.codex/config.toml` 而不抄这个适配器是跑不起来的。**

## 一、安装 Node 依赖

Node.js 22.19+，在新项目根目录：

```sh
npm init -y
npm pkg set type=module
npm install --save-exact @modelcontextprotocol/sdk@1.32.1 beyond-simulator-mcp@0.4.1 undici@8.11.2 zod@4.6.6 fengari@0.1.5
```

保留 `package.json` 与 `package-lock.json`，以后 `npm ci` 就能复现依赖。

## 二、装 Lua 模块化能力

沿用「模块化源码 → 单个 Lua 交付文件」的约定：

```sh
npm pkg set "scripts.build:lua=node tools/bundle-lua.mjs"
npm pkg set "scripts.test:lua-bundle=node --test scripts/test-lua-bundle.mjs"
npm run test:lua-bundle
```

按 `src/main.lua`、`src/game/*.lua`、`src/ui/*.lua` 拆分职责，用静态 `require("game.score")` 引用模块：

```sh
npm run build:lua -- --root src --entry main --out dist/main.lua
```

只把生成的 `dist/main.lua` 登记到模拟器、写进存档的 `scripts[].source`，再到千星编辑器建立脚本映射和挂载。支持范围、边界和报错行号换算见 [Lua 模块化指南](lua-modules.md)。

## 三、配置项目级 MCP

新建 `.codex/config.toml`，把 5 处 `/ABS/PATH/TO/NEW-PROJECT` 换成**新项目的绝对路径**（Windows 上是盘符接项目路径，形如 `<盘符>:/dev/my-game`；macOS 上是 `/Users/<你的用户名>/dev/my-game`）：

```toml
[mcp_servers.qxqy_simulator]
command = "node"
args = ["/ABS/PATH/TO/NEW-PROJECT/node_modules/beyond-simulator-mcp/dist/index.js", "--workspace", "/ABS/PATH/TO/NEW-PROJECT"]
cwd = "/ABS/PATH/TO/NEW-PROJECT"
startup_timeout_sec = 120
tool_timeout_sec = 60

[mcp_servers.miliastra_toolbox]
command = "node"
args = ["/ABS/PATH/TO/NEW-PROJECT/tools/miliastra-toolbox-mcp.mjs"]
cwd = "/ABS/PATH/TO/NEW-PROJECT"
startup_timeout_sec = 30
tool_timeout_sec = 45

[mcp_servers.miliastra_toolbox.tools.get_client_document]
approval_mode = "approve"
```

**网络**：两个服务都可以走本机 HTTP 代理，需要时分别在各自下面加 `env` 表，端口改成你自己代理的（示例值不是通用值）：

```toml
[mcp_servers.qxqy_simulator.env]
HTTP_PROXY = "http://127.0.0.1:7890"
HTTPS_PROXY = "http://127.0.0.1:7890"
```

**权限**：如果宿主支持项目级网络权限，可以补 `[permissions.xxx.network]` 段放行 `github.com`、`registry.npmjs.org`、`ugc.070077.xyz` 等域名。注意权限配置不能突破宿主强制的网络隔离，也不要靠把 `CODEX_SANDBOX_NETWORK_DISABLED` 从 `1` 改成 `0` 来“修复”连不上。

## 四、验证安装

1. 在 Codex 里信任这个项目，重新打开该项目的聊天。
2. `/mcp` 里应能看到 `qxqy_simulator` 和 `miliastra_toolbox`。
3. 让它分别做一件小事：列出模拟器工具、查一条客户端控件文档，确认工具真的能调。

工具列表能列出来 = 进程启动正常；**远端查询通过是另一项独立检查**，需要网络。

## 五、常见问题

**`127.0.0.1` 通了却连不上远端。** `127.0.0.1` 永远指“执行这条命令的那个环境”。宿主能连代理，不代表 Codex 的沙箱、容器或远端执行环境也能连同一个回环端口。先确认代理监听地址，再看 Codex 所在环境的网络权限与代理转发。仅放行域名、仅给 MCP 配 `HTTP_PROXY`，都不能让一个不可达的回环端口变得可达。

**模拟器能开、知识库查询报 `fetch failed`。** 说明工具进程正常，是命令环境的出网被限制。两项检查要分开看。

**导出 GIA 需要额外装包。** 模拟器 MCP 不含可视 Web 编辑器：

```sh
npm install --save-exact beyond-simulator-web
npx --no-install beyond-simulator-web --workspace "/ABS/PATH/TO/NEW-PROJECT" --open
```

打开 `/editor` 加载 `*.save.json`，导出所需 GIA 并检查警告。

## 版本与来源

- 模拟器：`beyond-simulator-mcp@0.4.1`、`beyond-simulator-web@0.4.1`（GPL-3.0-only），上游仓库 <https://github.com/1475505/miliastra-beyond-simulator>。
- 知识库适配契约：`dsh-plugin-miliastra-toolbox` 提交 `f35d55c1109bb7d822e48b22695335278e7208bc`。
- 其他依赖：`@modelcontextprotocol/sdk@1.32.1`、`undici@8.11.2`、`zod@4.6.6`、`fengari@0.1.5`。

模拟器用于快速验证逻辑与画面；正式资产导入、Lua 挂载和可玩性验证仍然要在千星沙箱里做。
