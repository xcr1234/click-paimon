# 第三方依赖与素材声明

本仓库自己的代码以 [MIT](LICENSE) 授权。下面是它依赖的东西，以及它们各自的许可证。

## 运行与构建依赖

| 依赖 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | 1.32.1 | MIT | 与模拟器 MCP 服务通信、提供本地知识库 MCP 适配器 |
| [fengari](https://github.com/fengari-lua/fengari) | 0.1.5 | MIT | 构建时做 Lua 5.3 语法检查（不执行游戏代码） |
| [undici](https://github.com/nodejs/undici) | 8.11.2 | MIT | 知识库适配器的 HTTP 客户端与代理支持 |
| [zod](https://github.com/colinhacks/zod) | 4.6.6 | MIT | 知识库 MCP 工具的入参校验 |

## 开发与测试工具

| 工具 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| [beyond-simulator-mcp](https://github.com/1475505/miliastra-beyond-simulator) | 0.4.1 | GPL-3.0-only | 本地模拟器 MCP 服务，用于加载存档、回放用例、截图 |
| [beyond-simulator-web](https://github.com/1475505/miliastra-beyond-simulator) | 0.4.1 | GPL-3.0-only | 可视编辑器与 GIA 导出，只在 `npm run export:gia` 时使用 |

这两个 GPL-3.0 组件以**独立本地工具**方式使用：通过进程调用，不链接、不嵌入到本仓库发布给玩家的 Lua 产物中。仓库发布的交付物是 `dist/click-paimon.lua` 与关卡资产，不含上述工具的代码。

## 知识库工具契约

[`tools/miliastra-toolbox-mcp.mjs`](tools/miliastra-toolbox-mcp.mjs) 是按 [dsh-plugin-miliastra-toolbox](https://github.com/1475505/dsh-plugin-miliastra-toolbox) 提交 `f35d55c1109bb7d822e48b22695335278e7208bc` 的六项工具契约编写的本地适配器，查询的是该项目的远端知识库服务。适配器代码本身属于本仓库，以 MIT 授权。

## 游戏与美术素材

- 《原神》及「派蒙」等角色、形象、名称的版权归**米哈游（miHoYo / HoYoverse）**所有。
- 本项目的关卡是千星奇域（UGC 平台）上的**同人创作**，与官方无隶属关系，不代表官方立场，不作商业用途。
- `assets/cover.png`、`assets/result.png` 与 `src/avatar/pixels.lua` 中的像素拟合数据是基于官方形象的**非官方二创**，随本仓库公开仅为代码阅读与流程演示之用。
- 若版权方认为本仓库的呈现方式不当，可通过提 issue 联系，作者会配合调整或移除相关素材。

## 平台与文档

开发期查阅的官方文档（《客户端控件和客户端脚本》《奇域资产中心》《存档导入与导出》等）版权归米哈游所有，本仓库不转载其内容，只引用链接。
