# Lua 模块化源码与单文件交付

本项目约定开发时拆分 Lua 模块，构建时将入口及其依赖打包为一个可读的 `.lua` 文件。这里的“编译”是源码打包，不是 Lua 字节码编译。

## 目录与命令

```text
workspace/my-game/
├─ src/
│  ├─ main.lua
│  ├─ game/score.lua
│  ├─ ui/view.lua
│  └─ config.lua
└─ dist/
   ├─ main.lua           # 唯一的脚本映射/挂载文件
   └─ main.lua.map.json  # 本地排错用，不上传
```

在项目根目录执行：

```sh
npm run build:lua -- --root workspace/my-game/src --entry main --out workspace/my-game/dist/main.lua
```

项目内 `fengari@0.1.5` 用于构建时检查 Lua 5.3 语法，不执行游戏代码。无需全局安装编译器。语法检查不能替代模拟器和真机对平台 API 的验证。

现成的最小示例和打包器测试：

```sh
npm run build:lua:example
npm run test:lua-bundle
```

示例位于 `examples/lua-modular/src`，产物为 `examples/lua-modular/dist/main.lua`。为具体游戏添加固定路径命令后，构建、同步存档与测试应按顺序串联；打包失败则停止后续同步，不使用上轮遗留产物。

## 模块写法

`src/game/score.lua`：

```lua
local M = {}
local value = 0

function M.add(points)
  value = value + points
end

function M.get()
  return value
end

return M
```

`src/main.lua`：

```lua
local score = require("game.score")

function OnStart()
  score.add(1)
end

function OnUpdate(dt)
  -- 调用业务模块；平台 API 的使用仍需核对官方文档。
end

function OnDestroy()
  -- 调用业务模块清理资源。
end
```

- 模块名相对 `--root`，`game.score` 对应 `game/score.lua`。支持 `require("game.score")` 和 `require "game.score"`，使用未转义的单/双引号常量。
- 模块名各段使用英文字母、数字和下划线，首字符不为数字。只解析 `<模块路径>.lua`，不隐式查找 `init.lua`。
- 所有裸 `require` 必须是静态模块调用；不支持动态路径、别名、重定义/遮蔽 `require`、绝对路径或 `../`。不要通过 `_G`、环境表或其他间接方式访问宿主加载器。
- 只打包入口可达的模块；依赖缺失、循环引用、路径逃逸或 Lua 语法错误会在构建时失败。循环依赖需拆为共享模块或由入口传入依赖。
- 每个模块放在独立函数作用域中，local 不会因拼接相互覆盖；第一次调用时初始化，同一脚本实例内缓存导出。建议始终返回 table；未返回值按 true 缓存，false 也只初始化一次。
- 打包器在文件内部提供局部加载函数，不使用宿主 `require`、`package`、`load`、`loadfile` 或 `dofile`。模块内可按已核实的宿主规则访问 `game`、`script` 等平台对象。
- 入口中的全局生命周期回调继续暴露给宿主，普通模块不定义同名全局回调。模块化不能隔离自行写入的全局变量，应使用 local/table 导出。
- 保留可读源码、模块分隔注释与 JSON 行号映射；产物报错行位于某模块的 `startLine..endLine` 时，源行号为 `报错行 - startLine + 1`。

## 模拟器与千星交付

1. 修改 `src`，先成功构建 `dist/main.lua`。
2. 模拟器脚本 `path` 指向项目相对的产物路径。如果存档含非空 `scripts[].source`，同时更新为产物的完整内容，再显式保存。
3. 使用该产物运行模拟器回归；构建通过不等于平台行为通过。
4. 千星沙箱只给产物建立脚本映射并挂载，不给开发模块分别建映射。后续更新仍由同一构建命令生成同一路径。
5. 真机反馈的改动合并回模块，再构建、同步、验证。若外部直接改了产物，先比较并提取有效改动，不用新构建无提示覆盖它。

官方《[客户端控件和客户端脚本](https://act.mihoyo.com/ys/ugc/tutorial/detail/mhbgxf0nynww)》说明只有建立了映射的 Lua 文件才会被打包上传，并提供按脚本映射 ID 调用其他脚本的方式。本项目选择单文件交付以简化映射和发布；不据此推断平台禁止多文件。文档依据来自知识库 2026-09-25 快照；当前打包器已做本地 Lua VM 验证，尚无此模块示例的千星真机验证记录。
