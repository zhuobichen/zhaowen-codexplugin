# zhaowen-codexplugin

赵文自己的 **Codex 插件**市场。内容从 Claude Code 的 mod 移植而来（[`zhaowen-claudemod`](https://github.com/zhuobichen/zhaowen-claudemod)），
但**形态不一样**——见下面那张对照表，这是这个仓库存在的原因。

## Codex 插件长什么样

Codex Desktop 的插件是一个目录，加上一个市场清单：

```
.agents/plugins/marketplace.json          ← 市场清单（列有哪些插件）
plugins/<name>/.codex-plugin/plugin.json  ← 插件清单（名字、版本、指向 skills / MCP）
plugins/<name>/skills/<skill>/SKILL.md    ← skill：教模型怎么做
plugins/<name>/.mcp.json                  ← 可选：MCP 服务，给模型真能调的工具
```

装的时候写进 `~/.codex/config.toml`：

```toml
[marketplaces.zhaowen-codexplugin]
source_type = "local"
source = 'D:\github_project\ZhaoWen_GitHub维护\zhaowen-codexplugin'

[plugins."deepseek-balance@zhaowen-codexplugin"]
enabled = true
```

## Claude mod → Codex 的形态对照（重点）

Claude Code 的 mod 能**在输入框上方画一行**（`ui.render{component:'AbovePrompt'}`）。
Codex 没有这个接缝，所以同一个点子只能落在它支持的两种形态上：

| 原 mod（Claude Code） | 在 Codex 里 | 说明 |
|---|---|---|
| `deepseek-balance`（画一行余额） | **MCP 工具** `deepseek_balance` + skill | 数字一样，只是从"一直显示"变成"问就查" |
| `moon-band`（月相 + 诗句 + 详解） | **skill + 脚本**（待做） | 语料与月相表随包，脚本算"这一分钟那一句" |
| `novel-pane`（可折叠读书窗格） | **skill + 脚本**（待做） | 分页读、记位置；没有窗格可画 |

一句话：**Claude 那套是"装饰 + hook"，Codex 这套是"工具 + 说明书"。** 移植时不能照抄文件结构，只能照抄"它替你做了什么"。

## 已收录

| 插件 | 是什么 | 形态 |
|---|---|---|
| [`deepseek-balance`](plugins/deepseek-balance) | 查 DeepSeek 账户余额（可用 / 赠送 / 充值） | MCP 工具 + skill |

## 装

1. 把本仓库 clone 到本地。
2. 在 `~/.codex/config.toml` 里加上面那两段（市场 + 要启用的插件）。
3. 重启 Codex。
4. `deepseek-balance` 需要环境变量 `DEEPSEEK_API_KEY`（MCP 服务启动时读，改完要重启）。

## 加一个新插件

```
plugins/<name>/
  .codex-plugin/plugin.json   { name, version, description, author, license,
                                skills?: "./skills/", mcpServers?: "./.mcp.json",
                                interface{ displayName, shortDescription, ... } }
  skills/<name>/SKILL.md       ---
                                name: <name>
                                description: "何时用它（写清触发场景，模型靠这句话决定要不要读）"
                                ---
                                正文
  .mcp.json                    { "mcpServers": { "<name>": { command, args, cwd, env_vars } } }
```

然后在 `.agents/plugins/marketplace.json` 的 `plugins` 里加一项。

## 约定

- 每个插件**自包含**：脚本、数据都在自己目录里，不跨插件依赖。
- 需要密钥的一律走**环境变量名**声明（`env_vars`），不把 key 写进仓库。
- 只读操作（查余额、算月相）不该让模型征求同意；会写盘的（记读书位置）要说清楚写到哪。

## License

MIT
