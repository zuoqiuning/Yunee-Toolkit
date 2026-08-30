/**
 * 转换任务 IPC 处理器 conversion.ts
 * 职责：向渲染进程暴露「任务队列」操作 —— 入队、取消、查询、清理已结束任务。
 *
 * 设计说明：
 *   - 所有关键入参做类型与路径校验（输入文件必须存在、输出目录必须存在），
 *     防止渲染进程传入脏数据破坏队列或误操作文件系统；
 *   - 任务进度/结果不在此轮询，统一由队列管理器向所有窗口广播事件（progress/complete/error/queued/removed）。
 */
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { taskQueue } from '../main/queue/manager'
import { probeMedia } from '../main/ffmpeg/probe'
import { resolveOutputPath, type FileNamePreset } from '../main/ffmpeg/output'
import type { ConversionOptions, TaskKind, TaskPriority } from '../main/queue/types'
import { info as logInfo, warn as logWarn } from '../main/logger'

/** 合法转换类型 */
const KINDS = new Set<TaskKind>(['video', 'audio', 'image', 'container'])
/** 合法优先级 */
const PRIORITIES = new Set<TaskPriority>(['low', 'normal', 'high'])
/** 合法命名预设 */
const PRESETS = new Set<FileNamePreset>(['keep', 'time-suffix', 'time-prefix'])

/** 入队请求体（由渲染进程提交） */
interface StartPayload {
  kind: unknown
  input: unknown
  output: unknown
  options?: unknown
  priority?: unknown
}

/** 注册转换相关 IPC 处理器 */
export function registerConversionIpc(): void {
  // 入队新任务：校验后交给队列，返回创建的任务（含 id / 初始状态）
  ipcMain.handle('conversion:start', (_e, payload: unknown) => {
    const spec = parseStartPayload(payload)
    if (!spec) return null
    const task = taskQueue.add(spec.kind, spec.input, spec.output, spec.options, spec.priority)
    logInfo('ipc', `转换任务入队：${path.basename(spec.input)} → ${path.basename(spec.output)}`)
    return task
  })

  // 取消任务：运行中中止 + 清理残留；排队中直接移除
  ipcMain.handle('conversion:cancel', (_e, id: unknown) => {
    if (typeof id !== 'string' || !id) return false
    return taskQueue.cancel(id)
  })

  // 查询全部任务
  ipcMain.handle('conversion:list', () => taskQueue.list())

  // 探测输入文件信息（供界面展示文件详情）；非法/非媒体返回 null
  ipcMain.handle('conversion:probe', async (_e, input: unknown) => {
    if (typeof input !== 'string' || !input.trim() || !fs.existsSync(input)) return null
    return probeMedia(input)
  })

  // 解析输出路径：输入文件 + 格式 + 命名预设 + 输出目录 → 输出路径（供界面预览 / 重名决策）
  ipcMain.handle('conversion:resolve-output', (_e, payload: unknown) => {
    const spec = parseResolvePayload(payload)
    if (!spec) return null
    return resolveOutputPath(spec.input, spec.format, {
      preset: spec.preset,
      outputDir: spec.outputDir,
    })
  })

  // 清理已结束任务
  ipcMain.handle('conversion:clear-finished', () => taskQueue.clearFinished())
}

/** 输出路径解析请求体（由渲染进程提交） */
interface ResolvePayload {
  input: unknown
  format: unknown
  preset?: unknown
  outputDir?: unknown
}

/** 解析并校验输出路径解析请求；非法（输入不存在 / 格式含路径分隔符）返回 null */
function parseResolvePayload(payload: unknown): {
  input: string
  format: string
  preset: FileNamePreset
  outputDir: string
} | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as ResolvePayload

  const input = typeof p.input === 'string' ? p.input.trim() : ''
  if (!input || !fs.existsSync(input)) {
    logWarn('ipc', '输出路径解析被拒：输入文件不存在')
    return null
  }

  // 格式必须为纯扩展名（防路径穿越/注入）
  const format = typeof p.format === 'string' ? p.format.trim().toLowerCase() : ''
  if (!format || !/^[a-z0-9]{1,8}$/.test(format)) {
    logWarn('ipc', `输出路径解析被拒：非法格式 ${String(p.format)}`)
    return null
  }

  const preset =
    typeof p.preset === 'string' && PRESETS.has(p.preset as FileNamePreset)
      ? (p.preset as FileNamePreset)
      : 'keep'
  const outputDir = typeof p.outputDir === 'string' ? p.outputDir.trim() : ''

  return { input, format, preset, outputDir }
}

/**
 * 解析并校验入队请求。
 * 非法（类型不对 / 输入不存在 / 输出目录不存在）时返回 null 并记警告日志。
 */
function parseStartPayload(payload: unknown): {
  kind: TaskKind
  input: string
  output: string
  options: ConversionOptions
  priority: TaskPriority
} | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as StartPayload

  const kind = p.kind
  if (typeof kind !== 'string' || !KINDS.has(kind as TaskKind)) {
    logWarn('ipc', `转换入队被拒：非法类型 ${String(kind)}`)
    return null
  }

  const input = typeof p.input === 'string' ? p.input.trim() : ''
  const output = typeof p.output === 'string' ? p.output.trim() : ''
  if (!input || !output) {
    logWarn('ipc', '转换入队被拒：输入/输出路径为空')
    return null
  }
  if (!fs.existsSync(input)) {
    logWarn('ipc', `转换入队被拒：输入文件不存在 ${input}`)
    return null
  }
  if (!fs.existsSync(path.dirname(output))) {
    logWarn('ipc', `转换入队被拒：输出目录不存在 ${path.dirname(output)}`)
    return null
  }

  // 选项做浅校验：非法则用默认值兜底（args.ts 内部还会进一步收敛）
  const options = sanitizeOptions(p.options)

  const priority =
    typeof p.priority === 'string' && PRIORITIES.has(p.priority as TaskPriority)
      ? (p.priority as TaskPriority)
      : 'normal'

  return { kind: kind as TaskKind, input, output, options, priority }
}

/** 选项净化：只保留已知字段，非法字段回退默认值 */
function sanitizeOptions(raw: unknown): ConversionOptions {
  if (typeof raw !== 'object' || raw === null) return {}
  const o = raw as Record<string, unknown>
  const out: ConversionOptions = {}
  if (typeof o.format === 'string') out.format = o.format
  const codec = ['copy', 'h264', 'hevc', 'vp9', 'av1'].includes(String(o.videoCodec))
    ? (o.videoCodec as ConversionOptions['videoCodec'])
    : undefined
  if (codec) out.videoCodec = codec
  const crf = Number(o.crf)
  if (Number.isFinite(crf)) out.crf = Math.min(51, Math.max(0, Math.trunc(crf)))
  if (typeof o.resolution === 'object' && o.resolution !== null) {
    const r = o.resolution as Record<string, unknown>
    const res: { width?: number; height?: number } = {}
    const w = Number(r.width)
    const h = Number(r.height)
    if (Number.isFinite(w) && w > 0) res.width = Math.trunc(w)
    if (Number.isFinite(h) && h > 0) res.height = Math.trunc(h)
    if (res.width || res.height) out.resolution = res
  }
  const fps = Number(o.fps)
  if (Number.isFinite(fps) && fps > 0) out.fps = fps
  const acodec = ['copy', 'aac', 'mp3', 'opus', 'vorbis'].includes(String(o.audioCodec))
    ? (o.audioCodec as ConversionOptions['audioCodec'])
    : undefined
  if (acodec) out.audioCodec = acodec
  if (typeof o.audioBitrate === 'string' && o.audioBitrate) out.audioBitrate = o.audioBitrate
  const hw = ['none', 'nvidia', 'intel', 'amd'].includes(String(o.hwaccel))
    ? (o.hwaccel as ConversionOptions['hwaccel'])
    : undefined
  if (hw) out.hwaccel = hw
  const threads = Number(o.threads)
  if (Number.isFinite(threads) && threads > 0) out.threads = Math.trunc(threads)
  // 删除源文件开关：仅接受布尔值，防止脏数据触发误删
  if (o.deleteSource === true) out.deleteSource = true
  return out
}
