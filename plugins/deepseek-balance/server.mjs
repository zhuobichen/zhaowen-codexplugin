#!/usr/bin/env node
// DeepSeek 余额查询的 MCP 服务（stdio）。
//
// 从 Claude Code 的 `deepseek-balance` mod 移植。那边是 hooks 里画一行；Codex 没有
// 画 UI 的地方，所以这里换成**模型能调的工具**：什么时候查、查完怎么讲，交给模型。
//
// 协议：stdin/stdout 上按行收发 JSON-RPC 2.0（MCP stdio 传输）。
// 只实现 initialize / tools/list / tools/call / ping 四个必须的。

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const SERVER_NAME = 'deepseek-balance'
const SERVER_VERSION = '0.1.0'

/** 找 key 的顺序：环境变量优先，最后回退到 Claude Code 的 settings。 */
const KEY_VARS = ['DEEPSEEK_API_KEY', 'ANTHROPIC_AUTH_TOKEN']

/**
 * Claude Code 的 settings.json 里也放着一个 DeepSeek key（它被配成 Anthropic 兼容端点）。
 * 已经装过 Claude mod 的人不必再配一遍环境变量——这条就是给他用的。
 */
const settingsKeyOf = () => {
  try {
    const path = join(homedir(), '.claude', 'settings.json')
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    const env = parsed?.env ?? {}

    for (const name of KEY_VARS) {
      const value = env[name]

      if (typeof value === 'string' && value !== '') return { value, source: `${path} env.${name}` }
    }
  } catch {
    // 没装过 Claude Code、或者文件坏了：跳过
  }

  return null
}

/** 返回 `{ value, source }`，找不到就是 null。 */
const keyOf = () => {
  for (const name of KEY_VARS) {
    const value = process.env[name]

    if (typeof value === 'string' && value !== '') return { value, source: `环境变量 ${name}` }
  }

  return settingsKeyOf()
}

/** 账号余额接口的返回，只取我们这个工具用得到的部分。 */
const amountOf = (currency, total) => {
  if (currency === 'CNY') return `¥${total}`
  if (currency === 'USD') return `$${total}`

  return currency === undefined || currency === '' ? total : `${total} ${currency}`
}

/** 查一次余额，返回给模型看的文本。 */
const readBalance = async () => {
  const found = keyOf()

  if (found === null) {
    return {
      text:
        `没有找到 DeepSeek 的 API key。查过：环境变量 ${KEY_VARS.join(' / ')}、` +
        `以及 ${join(homedir(), '.claude', 'settings.json')} 里的 env。` +
        `把 key 放进环境变量 DEEPSEEK_API_KEY 后重启 Codex（MCP 子进程只在启动时读环境变量）。`,
      isError: true,
    }
  }

  let response

  try {
    response = await fetch(BALANCE_URL, { headers: { Authorization: `Bearer ${found.value}` } })
  } catch (error) {
    return { text: `请求失败：${error instanceof Error ? error.message : String(error)}`, isError: true }
  }

  const body = await response.text()

  if (!response.ok) {
    // 401 时把 key 的来源说出来，方便判断是不是用错了那把 key（不打印 key 本身）
    const hint = response.status === 401 ? `（key 来自：${found.source}）` : ''

    return { text: `DeepSeek 返回 HTTP ${response.status}${hint}：${body.slice(0, 300)}`, isError: true }
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
let pending = 0
let ending = false

/**
 * stdin 关了之后**不要** `process.exit()`：在有句柄正在关闭时强退，Node 会在
 * Windows 上抛 libuv 断言（`handle->flags & UV_HANDLE_CLOSING`）并以 0xC0000409 崩掉。
 * 没有在飞的请求时，事件循环会自己结束，退出码是 0。
 */
const maybeExit = () => {
  // 故意留空：让事件循环耗尽后自然退出
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buffer += chunk

  let newline = buffer.indexOf('\n')

  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim()

    buffer = buffer.slice(newline + 1)

    if (line !== '') {
      try {
        const message = JSON.parse(line)

        pending += 1
        void handle(message)
          .catch(error => {
            process.stderr.write(`${SERVER_NAME}: handler failed: ${error instanceof Error ? error.message : String(error)}\n`)
          })
          .finally(() => {
            pending -= 1
            maybeExit()
          })
      } catch (error) {
        // 一行坏 JSON 不该弄死整个服务
        process.stderr.write(`${SERVER_NAME}: bad line: ${error instanceof Error ? error.message : String(error)}\n`)
      }
    }

    newline = buffer.indexOf('\n')
  }
})

process.stdin.on('end', () => {
  ending = true
  maybeExit()
})
