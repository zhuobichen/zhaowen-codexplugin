#!/usr/bin/env node
// DeepSeek 余额查询的 MCP 服务（stdio）。
//
// 从 Claude Code 的 `deepseek-balance` mod 移植。那边是 hooks 里画一行；Codex 没有
// 画 UI 的地方，所以这里换成**模型能调的工具**：什么时候查、查完怎么讲，交给模型。
//
// 协议：stdin/stdout 上按行收发 JSON-RPC 2.0（MCP stdio 传输）。
// 只实现 initialize / tools/list / tools/call / ping 四个必须的。

const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const SERVER_NAME = 'deepseek-balance'
const SERVER_VERSION = '0.1.0'

const KEY_VARS = ['DEEPSEEK_API_KEY']

/** 账号余额接口的返回，只取我们这个工具用得到的部分。 */
const amountOf = (currency, total) => {
  if (currency === 'CNY') return `¥${total}`
  if (currency === 'USD') return `$${total}`

  return currency === undefined || currency === '' ? total : `${total} ${currency}`
}

const keyOf = () => {
  for (const name of KEY_VARS) {
    const value = process.env[name]

    if (typeof value === 'string' && value !== '') return value
  }

  return null
}

/** 查一次余额，返回给模型看的文本。 */
const readBalance = async () => {
  const key = keyOf()

  if (key === null) {
    return {
      text:
        `没有找到 API key。把 DeepSeek 的 key 放进环境变量 ${KEY_VARS.join(' 或 ')}，` +
        `再重启 Codex（MCP 服务在启动时读环境变量）。`,
      isError: true,
    }
  }

  let response

  try {
    response = await fetch(BALANCE_URL, { headers: { Authorization: `Bearer ${key}` } })
  } catch (error) {
    return { text: `请求失败：${error instanceof Error ? error.message : String(error)}`, isError: true }
  }

  const body = await response.text()

  if (!response.ok) {
    return { text: `DeepSeek 返回 HTTP ${response.status}：${body.slice(0, 300)}`, isError: true }
  }

  let payload

  try {
    payload = JSON.parse(body)
  } catch {
    return { text: `返回的不是 JSON：${body.slice(0, 300)}`, isError: true }
  }

  if (payload?.is_available === false) {
    return { text: '这个账号报告“没有可用余额”（is_available=false）。', isError: false }
  }

  const info = payload?.balance_infos?.[0]
  const total = Number(info?.total_balance)

  if (info?.total_balance === undefined || !Number.isFinite(total)) {
    return { text: `返回里没有余额字段：${body.slice(0, 300)}`, isError: true }
  }

  const lines = [`可用余额：${amountOf(info.currency, info.total_balance)}`]

  if (info.granted_balance !== undefined) lines.push(`赠送余额：${info.granted_balance}`)
  if (info.topped_up_balance !== undefined) lines.push(`充值余额：${info.topped_up_balance}`)

  return { text: lines.join('\n'), isError: false }
}

const TOOLS = [
  {
    name: 'deepseek_balance',
    description:
      '查询 DeepSeek 账户的可用余额（含赠送/充值余额）。用 /user/balance 接口，' +
      '需要环境变量 DEEPSEEK_API_KEY。用户问“我还有多少钱”“余额多少”时用它。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

const send = message => {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

/** 处理一条消息；通知（没有 id）不回。 */
const handle = async message => {
  const { id, method, params } = message
  const isNotification = id === undefined || id === null

  if (method === 'initialize') {
    reply(id, {
      // 回客户端自己的版本号，它说什么就是什么；没给就用一个通用的
      protocolVersion: params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    })

    return
  }

  if (method === 'notifications/initialized') return
  if (method === 'ping') {
    reply(id, {})

    return
  }

  if (method === 'tools/list') {
    reply(id, { tools: TOOLS })

    return
  }

  if (method === 'tools/call') {
    const name = params?.name

    if (name !== 'deepseek_balance') {
      fail(id, -32602, `unknown tool: ${String(name)}`)

      return
    }

    const outcome = await readBalance()

    reply(id, {
      content: [{ type: 'text', text: outcome.text }],
      ...(outcome.isError ? { isError: true } : {}),
    })

    return
  }

  if (isNotification) return

  fail(id, -32601, `method not found: ${String(method)}`)
}

// ---- stdio 按行收发 ------------------------------------------------------
let buffer = ''

process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buffer += chunk

  let newline = buffer.indexOf('\n')

  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim()

    buffer = buffer.slice(newline + 1)

    if (line !== '') {
      try {
        void handle(JSON.parse(line))
      } catch (error) {
        // 一行坏 JSON 不该弄死整个服务
        process.stderr.write(`${SERVER_NAME}: bad line: ${error instanceof Error ? error.message : String(error)}\n`)
      }
    }

    newline = buffer.indexOf('\n')
  }
})

process.stdin.on('end', () => process.exit(0))
