/**
 * 转换任务队列管理 manager.ts
 * 职责：集中管理全部转换任务 —— 入队（优先级排序）、串行执行、进度/结果事件推送、
 *       取消与清理；作为主进程与渲染进程之间的任务中枢。
 *
 * 设计说明：
 *   - 单例 taskQueue：主进程唯一队列实例，由 IPC 层引用；
 *   - 串行执行（并发数固定为 1）：转码为 CPU/GPU 密集任务，避免多任务抢占资源拖垮系统；
 *   - 排队按优先级取下一任务：high > normal > low，同级先入先出；
 *   - 事件推送：任务新增/进度/完成/失败/移除通过回调广播到所有窗口（preload 白名单通道）；
 *   - 运行前先 ffprobe 探测时长，用于百分比；探测失败时进度保持 0（UI 显示“处理中”）；
 *   - 取消：中止子进程并删除残留的半成品输出文件。
 */
import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { buildFfmpegArgs } from '../ffmpeg/args'
import { runFfmpeg } from '../ffmpeg/runner'
import { probeMedia } from '../ffmpeg/probe'
import { info as logInfo, warn as logWarn } from '../logger'
import type { ConversionOptions, ConversionTask, TaskPriority, TaskStatus } from './types'

/** 队列并发数：固定串行，保证稳定性 */
const CONCURRENCY = 1

/** 进度推送的最小间隔（毫秒），避免高频刷屏 */
const PROGRESS_THROTTLE_MS = 200

/**
 * 任务队列类。
 * @param send 事件广播函数（channel + payload），由调用方注入窗口发送实现
 */
class TaskQueue {
  private tasks = new Map<string, ConversionTask>()
  private runningIds: string[] = []
  private abortedIds = new Set<string>()
  private send: (channel: string, payload: unknown) => void

  constructor(send: (channel: string, payload: unknown) => void) {
    this.send = send
  }

  /**
   * 加入一个新任务并尝试启动（若队列空闲立即执行）。
   * 返回创建后的任务对象（含 id 与初始状态）。
   */
  add(
    kind: ConversionTask['kind'],
    input: string,
    output: string,
    options: ConversionOptions,
    priority: TaskPriority = 'normal',
  ): ConversionTask {
    const task: ConversionTask = {
      id: randomUUID(),
      kind,
      status: 'queued',
      input,
      output,
      options,
      progress: { percent: 0, speed: '', fps: 0, bitrate: '', outTimeMs: 0 },
      error: null,
      priority,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    }
    this.tasks.set(task.id, task)
    logInfo('queue', `任务入队：${pathBase(input)} → ${pathBase(output)}（优先级 ${priority}）`)
    this.send('conversion-queued', task)
    this.pump()
    return task
  }

  /**
   * 取消任务：运行中则中止子进程（并清理残留输出），排队中则直接移出。
   * @returns 是否成功取消（已结束的任务返回 false）
   */
  cancel(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false
    if (task.status === 'running') {
      // 标记后由 runTask 的中止回调接管收尾
      this.abortedIds.add(id)
      return true
    }
    if (task.status === 'queued') {
      this.removeTask(id, 'aborted')
      logInfo('queue', `排队任务已取消：${pathBase(task.input)}`)
      return true
    }
    return false
  }

  /** 返回全部任务（按创建时间排序） */
  list(): ConversionTask[] {
    return [...this.tasks.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  /** 清理全部已结束（完成/失败/取消）的任务，返回清理数量 */
  clearFinished(): number {
    let removed = 0
    for (const [id, task] of this.tasks) {
      if (task.status !== 'queued' && task.status !== 'running') {
        this.tasks.delete(id)
        this.send('conversion-removed', { id })
        removed++
      }
    }
    if (removed) logInfo('queue', `已清理 ${removed} 个已结束任务`)
    return removed
  }

  /** 应用退出前中止所有运行中的任务 */
  shutdown(): void {
    for (const id of this.runningIds) this.abortedIds.add(id)
    // 运行中的子进程由 runTask 的 AbortController 统一中止
  }

  /**
   * 调度器：队列非空且并发未满时，取出优先级最高的任务执行。
   */
  private pump(): void {
    while (this.runningIds.length < CONCURRENCY) {
      const next = this.nextTask()
      if (!next) return
      this.runningIds.push(next.id)
      this.setStatus(next, 'running')
      next.startedAt = Date.now()
      void this.runTask(next)
    }
  }

  /** 取出优先级最高的排队任务（同级先入先出） */
  private nextTask(): ConversionTask | null {
    const queued = [...this.tasks.values()].filter((t) => t.status === 'queued')
    if (!queued.length) return null
    const order: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 }
    return queued.sort(
      (a, b) => order[a.priority] - order[b.priority] || a.createdAt - b.createdAt,
    )[0]
  }

  /**
   * 执行单个任务：探测时长 → 构造参数 → 运行 ffmpeg → 更新状态并推送。
   * 任何异常都被捕获并转为 failed 状态，绝不阻断队列调度。
   */
  private async runTask(task: ConversionTask): Promise<void> {
    const id = task.id
    const abort = new AbortController()
    logInfo('queue', `任务开始：${pathBase(task.input)}`)

    try {
      // 1. 探测时长（用于百分比）；失败不影响执行，仅百分比不可用
      const durationSec = (await probeMedia(task.input))?.durationSec ?? null

      // 2. 构造并运行 ffmpeg
      const args = buildFfmpegArgs(task.kind, task.input, task.output, task.options)
      let lastProgress = 0
      const result = await runFfmpeg(args, {
        durationSec,
        signal: abort.signal,
        onProgress: (p) => {
          // 节流：避免高频事件刷爆渲染进程
          if (Date.now() - lastProgress < PROGRESS_THROTTLE_MS && p.percent < 100) return
          lastProgress = Date.now()
          task.progress = p
          // 事件附带当前任务状态：渲染进程据此把「排队中」实时刷新为「转换中」，
          // 避免任务开始运行后界面状态标签仍停留在「排队中」。
          this.send('conversion-progress', { id, progress: p, status: task.status })
        },
      })

      // 3. 收尾：判断结果
      if (this.abortedIds.has(id)) {
        this.abortedIds.delete(id)
        this.cleanupOutput(task.output)
        this.removeTask(id, 'aborted')
        logInfo('queue', `任务已取消：${pathBase(task.input)}`)
        return
      }
      if (result.code === 0) {
        task.progress = { ...task.progress, percent: 100 }
        // 不保留源文件：转换成功后删除输入文件
        // 安全：仅当「请求删除」且输入输出不是同一文件时才执行，删除失败只记日志不阻断完成。
        let deletedSource = false
        if (task.options.deleteSource && !isSamePath(task.input, task.output)) {
          try {
            await fs.promises.rm(task.input, { force: true })
            deletedSource = true
            logInfo('queue', `源文件已删除：${pathBase(task.input)}`)
          } catch (err) {
            logWarn('queue', `源文件删除失败：${pathBase(task.input)} · ${String(err)}`)
          }
        }
        this.setStatus(task, 'completed')
        task.finishedAt = Date.now()
        this.send('conversion-complete', { id, deletedSource })
        logInfo('queue', `任务完成：${pathBase(task.output)}`)
      } else {
        this.cleanupOutput(task.output)
        this.setStatus(task, 'failed')
        task.error = result.error || '未知错误'
        task.finishedAt = Date.now()
        this.send('conversion-error', { id, message: task.error })
        logWarn('queue', `任务失败：${pathBase(task.input)} · ${task.error}`)
      }
    } catch (err) {
      // 意外异常（如参数构造错误）兜底为失败
      this.cleanupOutput(task.output)
      this.setStatus(task, 'failed')
      task.error = String(err)
      task.finishedAt = Date.now()
      this.send('conversion-error', { id, message: task.error })
      logWarn('queue', `任务异常：${pathBase(task.input)} · ${task.error}`)
    } finally {
      this.runningIds = this.runningIds.filter((rid) => rid !== id)
      abort.abort()
      this.pump()
    }
  }

  /** 更新任务状态并保存 */
  private setStatus(task: ConversionTask, status: TaskStatus): void {
    task.status = status
    // 状态变化仅随事件推送，无需单独通道
  }

  /** 移除任务并广播（同时广播一次移除事件） */
  private removeTask(id: string, status: TaskStatus): void {
    const task = this.tasks.get(id)
    if (!task) return
    task.status = status
    task.finishedAt = Date.now()
    this.tasks.delete(id)
    this.send('conversion-removed', { id })
  }

  /** 删除不完整的输出文件（取消/失败时避免留下半成品） */
  private cleanupOutput(output: string): void {
    fs.promises.rm(output, { force: true }).catch(() => {})
  }
}

/** 路径取文件名（日志更简洁） */
function pathBase(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

/**
 * 判断两个路径是否为同一文件（Windows 语义：忽略大小写与分隔符差异）。
 * 用于「删除源文件」前的安全校验，防止输入输出同路径时误删。
 */
function isSamePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+/g, '/').replace(/\/+$/g, '').toLowerCase()
  return norm(a) === norm(b)
}

/** 事件广播到所有窗口的默认发送实现 */
function broadcastToWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** 全局单例：主进程唯一任务队列 */
export const taskQueue = new TaskQueue(broadcastToWindows)
