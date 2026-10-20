---
name: deepseek-balance
description: "Report the DeepSeek account balance. Use when the user asks how much balance or credit they have left on DeepSeek (\"还有多少钱\", \"余额\", \"balance\", \"usage left\", \"快没钱了吗\"), or asks whether a long agent run is affordable. The number comes from the deepseek_balance MCP tool, never from guessing."
---

# DeepSeek 余额

`deepseek_balance` 这个工具会去 `https://api.deepseek.com/user/balance` 读一次真实余额，
返回可用余额、赠送余额、充值余额。

## 什么时候用

- 用户明确问余额 / 还剩多少钱 / 还能不能用
- 用户在跑很长的任务前问"这样跑要花多少、我还有没有"
- 用户看到报错里提到 `insufficient balance` / `402` 之类，想确认账户状态

## 什么时候别用

- 用户问的是**某次对话花了多少**：这个接口只给余额，没有消耗明细。
  要知道花了多少，只能前后各查一次余额再相减——并且要如实说明这是差值，不是账单。
- 用户问的是 token 用量：那是会话自己的统计，不是这个工具。

## 怎么用

1. 调 `deepseek_balance`（无参数）。
2. 按返回原样转述金额，**不要自己换算或四舍五入**。
3. 工具报"没有找到 API key"时，告诉用户：把 key 放进环境变量 `DEEPSEEK_API_KEY`
   再重启 Codex（MCP 服务在启动时读环境变量，改了要重启才生效）。不要说成"接口挂了"。

## 注意

- 这个工具会真的访问外网，属于只读操作，不需要征求同意。
- 返回的是**账户级**余额，和具体哪个会话无关。
