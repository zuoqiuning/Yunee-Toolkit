/**
 * 主进程日志模块 logger.ts
 * 职责：统一记录应用全流程日志（软件启动/关闭、用户操作、功能使用、异常排查），
 *       按日期写入独立日志文件，并按「保留天数 + 文件数量」双规则自动清理旧日志。
 *
 * 设计要点：
 *   - 按日期一个文件：<logDir>/2026-08-28.log，当天多条记录追加写入同一文件；
 *   - 每次启动以醒目分割线建立「会话头」，同一天内多次启动可在同一文件内清晰区分；
 *   - 日志级别固定为 debug（全量记录、最利于排查错误/BUG），预留 level 便于将来扩展；
 *   - 自动清理：删除超过保留天数（默认 7 天）的日志文件；文件数超过上限（默认 50）时删除最旧的；
 *   - 写入采用串行队列保证并发写不交错；任何写失败均静默，绝不阻塞主流程。
 */
import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** 当前日志目录（空表示尚未初始化，静默丢弃日志） */
let currentDir = ''

/** 日志保留天数与文件数量上限（清理规则，可在 init/set-dir 时更新） */
let retainDays = 7
let maxFiles = 50

/** 内部日志级别枚举：当前固定写入 debug（全量），预留扩展 */
type LogLevel = 'INFO' | 'WARN' | 'ERROR'

/** 串行写入队列：保证多条并发 appendFile 按调用顺序落盘、互不交错 */
let writeQueue: Promise<void> = Promise.resolve()

/** 两位补零 */
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** 当前时间戳：2026-08-28 20:00:01.123 */
function nowStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

/** 今天的文件名前缀：2026-08-28 */
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 追加写入一行日志（通过队列串行化）
 * 失败静默：日志文件不可写（只读/磁盘满）不应影响应用主流程。
 */
function appendLine(line: string): void {
  if (!currentDir) return
  const file = path.join(currentDir, `${todayKey()}.log`)
  writeQueue = writeQueue
    .then(() => fs.promises.appendFile(file, `${line}\n`, 'utf8'))
    .catch(() => {
      // 写入失败静默忽略
    })
}

/** 会话分割线字符（醒目区分同文件内多次启动） */
const LINE_CHAR = '═'

/** 平台标识 → 可读名称（process.platform 的 win32 是 Node 固定标识，不代表 32 位） */
function platformName(): string {
  switch (process.platform) {
    case 'win32':
      return 'Windows'
    case 'darwin':
      return 'macOS'
    case 'linux':
      return 'Linux'
    default:
      return process.platform
  }
}

/**
 * 会话头：每次启动（或切换日志目录）时写入。
 * 记录启动时刻、版本、平台架构、系统版本与运行环境，便于区分同一天内的多次会话。
 * 注意：不记录主机名、内存使用等本机隐私信息（用户明确要求）。
 */
function beginSession(): void {
  const version = app.getVersion()
  const env = app.isPackaged ? 'production' : 'development'
  appendLine(LINE_CHAR.repeat(64))
  appendLine(`  启动会话 · ${nowStamp()} · YuneeToolkit beta ${version}`)
  appendLine(
    `  平台 ${platformName()}（${process.arch}）· 系统 ${os.version()} · 内核 ${os.release()} · 环境 ${env} · 日志级别 debug（全量）`,
  )
  appendLine(LINE_CHAR.repeat(64))
}

/** 会话尾：应用退出时写入「会话结束」标记 */
function endSession(reason: string): void {
  appendLine('─'.repeat(64))
  appendLine(`  会话结束 · ${nowStamp()} · ${reason}`)
  appendLine('─'.repeat(64))
}

/**
 * 清理指定日志目录下的旧日志文件。
 * 规则（双保险）：
 *   1. 删除日期早于「今天 - 保留天数」的日志文件；
 *   2. 若剩余文件数仍超过上限，则删除最旧的（按文件名日期字典序判断新旧）。
 * 仅操作符合 YYYY-MM-DD.log 命名的文件，绝不触碰目录内其它内容。
 */
export async function cleanLogs(
  dir: string,
  days: number,
  files: number,
): Promise<{ removed: number; remaining: number }> {
  let names: string[] = []
  try {
    names = await fs.promises.readdir(dir)
  } catch {
    // 目录不存在/无权限：无可清理内容
    return { removed: 0, remaining: 0 }
  }

  // 仅收录按日期命名的日志文件，并以文件名（即日期）排序，字典序即时间序
  const entries = names
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.log$/.test(n))
    .sort()

  const threshold = new Date()
  threshold.setDate(threshold.getDate() - Math.max(0, days))
  const thresholdKey = `${threshold.getFullYear()}-${pad(threshold.getMonth() + 1)}-${pad(threshold.getDate())}`

  // 第一步：淘汰超出保留天数的文件
  const kept = entries.filter((n) => n.slice(0, 10) >= thresholdKey)
  const removed = entries.length - kept.length
  const capped = Math.max(1, files)

  // 第二步：数量仍超上限时，从最旧开始裁剪
  const excess = Math.max(0, kept.length - capped)
  const stale = [...entries.slice(0, removed), ...kept.slice(0, excess)]

  // 并发删除（失败忽略单文件，不中断整体清理）
  await Promise.all(
    stale.map((n) =>
      fs.promises.rm(path.join(dir, n), { force: true }).catch(() => {}),
    ),
  )

  return { removed: stale.length, remaining: Math.max(0, entries.length - stale.length) }
}

/**
 * 设置日志目录（含首次初始化）。
 * 目录变化时：写入新的「会话头」，并对该目录执行一次自动清理（双规则）。
 */
export function setLogDir(dir: string, rules?: { retainDays?: number; maxFiles?: number }): void {
  if (rules) {
    retainDays = rules.retainDays ?? retainDays
    maxFiles = rules.maxFiles ?? maxFiles
  }
  if (!dir) return
  const changed = dir !== currentDir
  currentDir = dir
  if (changed) {
    beginSession()
    // 目录切换成本次会话的一次性清理；失败不影响会话启动
    void cleanLogs(currentDir, retainDays, maxFiles).catch(() => {})
  }
}

/** 读取当前日志目录（未初始化返回空字符串） */
export function getLogDir(): string {
  return currentDir
}

/** 日志文件信息（供“在线查看”列表展示） */
export interface LogFileInfo {
  /** 文件名（YYYY-MM-DD.log） */
  name: string
  /** 日期键（YYYY-MM-DD） */
  date: string
  /** 文件大小（字节） */
  size: number
}

/**
 * 列出当前日志目录下全部按日期命名的日志文件（按日期倒序，最新的在前）。
 * 供渲染进程“在线查看”选择文件；目录不可读时返回空数组。
 */
export async function listLogFiles(): Promise<LogFileInfo[]> {
  if (!currentDir) return []
  let names: string[] = []
  try {
    names = await fs.promises.readdir(currentDir)
  } catch {
    return []
  }
  const files: LogFileInfo[] = []
  for (const n of names.filter((x) => /^\d{4}-\d{2}-\d{2}\.log$/.test(x)).sort().reverse()) {
    try {
      const st = await fs.promises.stat(path.join(currentDir, n))
      files.push({ name: n, date: n.slice(0, 10), size: st.size })
    } catch {
      // 单个文件 stat 失败跳过，不影响其余
    }
  }
  return files
}

/**
 * 读取指定日志文件内容（供“在线查看”展示）。
 * 仅允许日期命名文件（防路径穿越）；目录未初始化 / 读取失败返回 null。
 */
export async function readLogFile(name: string): Promise<string | null> {
  if (!currentDir) return null
  if (typeof name !== 'string' || !/^\d{4}-\d{2}-\d{2}\.log$/.test(name)) return null
  try {
    return await fs.promises.readFile(path.join(currentDir, name), 'utf8')
  } catch {
    return null
  }
}

/** 读取当前清理规则（供渲染进程展示） */
export function getCleanRules(): { retainDays: number; maxFiles: number } {
  return { retainDays, maxFiles }
}

/** 主动触发一次清理（用户手动“立即清理”或修改规则后调用），返回删除统计 */
export async function cleanNow(): Promise<{ removed: number; remaining: number }> {
  if (!currentDir) return { removed: 0, remaining: 0 }
  const result = await cleanLogs(currentDir, retainDays, maxFiles)
  if (result.removed > 0) {
    appendLine(`[${nowStamp()}] [INFO] [logger] 自动清理完成：移除 ${result.removed} 个过期日志文件`)
  }
  return result
}

/**
 * 通用日志写入（三者均追加时间戳/级别/作用域）
 * scope 标识来源模块（如 main / startup / tools / ipc），便于按来源检索日志。
 */
function write(level: LogLevel, scope: string, message: string): void {
  const safe =
    typeof message === 'string' && message.length ? message : String(message ?? '')
  appendLine(`[${nowStamp()}] [${level}] [${scope}] ${safe}`)
}

/** 输出 INFO 日志 */
export function info(scope: string, message: string): void {
  write('INFO', scope, message)
}

/** 输出 WARN 日志 */
export function warn(scope: string, message: string): void {
  write('WARN', scope, message)
}

/** 输出 ERROR 日志 */
export function error(scope: string, message: string): void {
  write('ERROR', scope, message)
}

/** 记录渲染进程上报的用户操作（scope 如 settings / tools / panel） */
export function logUserEvent(scope: string, action: string, message: string): void {
  write('INFO', scope, `${action} · ${message}`)
}

/** 应用退出前统一写会话尾（由主进程 before-quit 调用） */
export function closeSession(reason: string): void {
  endSession(reason)
}