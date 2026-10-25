# 点击派蒙 · Click Paimon

一个跑在**千星奇域**（原神 UGC 局内编辑器）里的 2D + Lua 点击小游戏：30 秒内点中随机换位的派蒙，每中一次得 1 分。

关卡已在千星奇域发布。这个仓库是它的全部源码、控件树、构建工具和回归用例——**重点是让人能直接读懂代码**，而不是只丢一个 GIA。

![点击派蒙宣传封面](assets/cover.png)

## 玩法

1. 标题页点「开始游戏」，进入 30 秒倒计时。
2. 派蒙在中央游玩区随机换位，点中一次得 1 分，飘出 `+1` 并轻微脉冲。
3. 时间到显示本局总分；得分大于 0 时按钮变成「确认通关」，点击后向服务端发送结算信号。
4. 也可以「再玩一次」重开一局。

---

## 五分钟读懂代码

### 文件地图

| 路径 | 作用 | 为什么值得看 |
|---|---|---|
| [`src/main.lua`](src/main.lua) | 平台入口 | 只有 14 行：把 `OnStart/OnUpdate/OnDestroy` 三个生命周期回调转交给 `game.runtime`。这是「入口只做委托」的示范。 |
| [`src/game/runtime.lua`](src/game/runtime.lua) | 全部游戏逻辑（约 420 行） | 状态机、计时、命中判定、反馈动画、音效、结算信号都在这一个文件里。 |
| [`src/avatar/renderer.lua`](src/avatar/renderer.lua) | 图元头像渲染 | 用**一个**客户端图片模板控件复制 2567 次，拼出像素派蒙。 |
| [`src/avatar/pixels.lua`](src/avatar/pixels.lua) | 拟合数据（2567 条记录） | 每条 18 个字段：图片 ID、位置、尺寸、锚点、pivot、旋转、颜色。纯数据，不含逻辑。 |
| [`src/config.lua`](src/config.lua) | 可配参数 | 时长、头像模板索引、结算信号名、4 个内置音效编号。 |
| [`game/ui.save.json`](game/ui.save.json) | 控件树存档 | 模拟器可加载的工程存档：控件层级、布局、脚本映射都在里面。 |
| [`game/tests/*.json`](game/tests) | 回归用例 | 8 个行为用例（启动、首中、超时、重开、移动端冒烟、数字显示等）。 |
| [`tools/bundle-lua.mjs`](tools/bundle-lua.mjs) | Lua 打包器 | 把 `require` 出来的模块拼成单个可挂载的 Lua 文件，构建时用 fengari 做 Lua 5.3 语法检查。 |
| [`tools/build-project.mjs`](tools/build-project.mjs) | 构建编排 | 打包 + 把产物内联进存档的 `scripts[].source`，并写出 sha256 构建记录。 |
| [`examples/lua-modular/`](examples/lua-modular/src/main.lua) | 最小模块化示例 | 想在新关里套这套结构，从这里抄。 |

### 状态机：只有四个状态

```text
ready  --点「开始游戏」--> playing  --30 秒到--> result  --点重开--> playing
                              |                      `--得分>0 时点「确认通关」--> settling
```

对应 [`src/game/runtime.lua`](src/game/runtime.lua) 里的 `beginGame` / `hitTarget` / `finishGame` 三个函数，加 `onUpdate` 里的倒计时。所有交互都靠 `AddCursorEventListener` 绑在三个控件上，没有轮询。

三个控件数组 `ui.ready` / `ui.playing` / `ui.result` 负责整屏显隐，是这套 UI 唯一的「路由」机制。

### 头像不是图片，是 2567 个方块

千星沙箱里没法直接塞一张位图，所以头像走的是「像素图元」路线：

1. 先在关卡里建一个**仅存为模板**的客户端图片控件，拿到它的模板索引。
2. 把它填进 [`src/config.lua`](src/config.lua) 的 `imageTemplateId`。
3. 运行时 [`renderer.lua`](src/avatar/renderer.lua) 调 `game.InstantiateClientUIControl(模板索引, parent)` 复制出 2567 份，再按 [`pixels.lua`](src/avatar/pixels.lua) 的坐标/颜色逐个摆好。

这样一份数据能同时驱动手机、PC 和手柄四种画布的布局，代价是控件数量大——所以**脉冲动画只缩放父节点**，不逐帧改图元（见 `onUpdate` 里的注释）。

模板索引没配（或填 0）时会自动退回旧版「7 个基础图元拼头像」的降级路径，并打印日志，不会直接崩。

### 一套自适应布局

`onStart` 里读 `game.GetUICanvasSize()`，算出 `scale = min(1, 宽/1280, 高/720)`，之后所有坐标和字号都乘这个系数。真机屏幕越大，布局不会被二次放大到出屏。

---

## 构建

需要 Node.js 22.19+。

```sh
npm ci

npm run build          # src/ -> dist/click-paimon.lua 与 dist/click-paimon.save.json
npm run test:lua-bundle # 打包器回归（8 个用例，不用开模拟器）
npm run check          # 公开仓库审计：本机路径/凭据泄漏、白名单、文档链接
```

`dist/` 是生成物，不入库；它里面是**内联了 Lua 源码的存档**，可以直接交给模拟器加载。

想改逻辑就改 `src/**`，改完重新 `npm run build`，不要手改 `dist/`。细节见 [Lua 模块化指南](docs/lua-modules.md) 和 [开发说明](docs/development.md)。

## 自己跑一局

见 [导入与运行](docs/game-import.md)：把存档载入模拟器试玩，或导出 GIA 导入千星沙箱并在自己的关卡里建立脚本映射。

## 这套东西是怎么做出来的

关卡、Lua 代码、像素头像，是在「**千星沙箱模拟器 + 千星知识库 + AI 编码助手**」的组合下完成的：AI 直接读写控件树存档、试玩截图、查官方节点与 Lua 文档，人只做决策和真机验收。

想复刻这套工作流：

- 🎬 教程视频：[千星沙箱模拟器 | 2D 奇域 AI 工作流教程](https://www.bilibili.com/video/BV1goHj6REq4/)（UP 主：神奇嘟嘟可）。分 4 集：系列介绍 → 模拟器的介绍和安装 → 知识库的集成 → 2D 美术素材构建工具。配套[讲义](https://ppt.070077.xyz/beyond-ai/index.html)。
- 📄 本仓库里的落地方案：[项目级 Codex 接入指南](docs/codex-setup.md)，含可直接抄的 `.codex/config.toml` 模板、[知识库 MCP 适配器](tools/miliastra-toolbox-mcp.mjs)、[Lua 模块化约定](docs/lua-modules.md) 和给 AI 看的 [AGENTS.md](AGENTS.md)。

## 许可与版权

- **代码**（`src/`、`tools/`、`scripts/`、`examples/`）以 [MIT](LICENSE) 授权，随便用、随便改。
- **派蒙形象与相关素材**版权归**米哈游**所有。`assets/` 下的封面与截图、`src/avatar/pixels.lua` 的拟合数据都是**同人二创**，仅供学习交流和本项目的展示使用，不作商业用途，也不代表官方立场。
- 第三方依赖与它们的许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 致谢

- [miliastra-beyond-simulator](https://github.com/1475505/miliastra-beyond-simulator)：本地模拟器与 MCP 服务，本项目的构建与回归都依赖它。
- [dsh-plugin-miliastra-toolbox](https://github.com/1475505/dsh-plugin-miliastra-toolbox)：千星节点、控件与 Lua API 的查询入口，本仓库的 [`tools/miliastra-toolbox-mcp.mjs`](tools/miliastra-toolbox-mcp.mjs) 按它的工具契约做了个本地适配器。

参与贡献前请读 [CONTRIBUTING.md](CONTRIBUTING.md)——特别提醒：这个仓库的 `.gitignore` 是**白名单**模式。
