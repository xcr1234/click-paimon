# 导入与运行

关卡已经在千星奇域发布。这里说明**怎么把本仓库自己跑起来**：先用模拟器快速看效果，再进千星沙箱做真机验证。

如果你只是想读代码，不需要这一步——直接看 [README 的代码导读](../README.md#五分钟读懂代码)。

## 一、先构建

```sh
npm ci
npm run build
```

产物：

- `dist/click-paimon.lua`：打包后的单文件 Lua（3100 行左右，含模块分隔注释和行号映射）。
- `dist/click-paimon.save.json`：把上面的源码内联进 `scripts[0].source` 的存档。

`game/ui.save.json` 是控件树的**可读源文件**，`source` 是空的；模拟器和编辑器要用 `dist/` 里那份。

## 二、模拟器里试玩

在项目根目录用 `beyond-simulator-mcp` 打开 `dist/click-paimon.save.json`，或起一个可视编辑器：

```sh
npx --no-install beyond-simulator-web --workspace . --open
```

进 `/editor` 加载存档，能直接点「开始游戏」试玩、截图、看日志。模拟器不是官方运行时，**构建通过、模拟器通过都不等于真机通过**。

## 三、导出 GIA

```sh
npm run export:gia
```

得到 `dist/click-paimon.gia`（控件 + 脚本整合包），同时会做一次「导出 → 重新导入」回环，确认脚本映射还在、Lua 内容与 `dist/click-paimon.lua` 一致。

## 四、导进千星沙箱

1. 打开局内编辑器，进 **资产导入导出管理 → 加载外部资产 → 打开目录**，把 `.gia` 放进该目录。
2. 回到游戏，**加载外部资产 → 转存所选资产**，选择存放页签。官方流程见 [《1.6 奇域资产中心》](https://act.mihoyo.com/ys/ugc/tutorial/course/detail/mhgf8i0hvzag?tk=course_chosen_1)。
3. 在**实际生效的界面布局**里关掉摇杆、技能区等固有内容的「初始可见」，只留本项目自己的容器可见——两套容器同时出现会互相遮挡。
4. 在客户端脚本资源管理器里核对两件事：
   - 脚本映射指向你导入的 Lua 文件；
   - 脚本挂载在**游戏根容器**（`GameRoot`）上，不是外层服务端容器。

   导出器声称这两项关系会保留，但以导入结果为准；缺失就手动建。
5. 在本关卡里找到那张**仅存为模板**的客户端图片控件，把它的模板索引填进 [`src/config.lua`](../src/config.lua) 的 `imageTemplateId`，重新 `npm run build` + `export:gia`。索引是每个关卡各自生成的，不能照抄别人的。

## 五、真机试玩检查单

- 标题、说明、「开始游戏」都可见且文案正确。
- 点击开始后 30 秒倒计时递减，点中派蒙得分 +1、飘出 `+1`、目标换位。
- 手机竖屏与 PC 宽屏各试一遍：HUD 不出屏、点击热区对得上。
- 时间到显示总分；得分 > 0 时显示「确认通关」，点击后服务端收到结算信号。
- 「再玩一次」能回到干净的一局（分数归零、倒计时重置）。

日志关键字：`ready`、`ui_canvas`、`game_start`、`score N`、`game_over`、`completion signal`。

## 备注

- `.save.json` 是模拟器格式，**不能**直接导入游戏；游戏只认 `.gia`（资产）和 `.gil`（关卡存档），两者别混。
- 想分享关卡给别人玩，用编辑器里的上传/发布入口；把 GIA 传上资产中心只是分享文件，不等于关卡对玩家开放。
