/**
 * FFmpeg 子进程运行器 runner.ts
 * 职责：以子进程方式运行 ffmpeg，解析 stdout 的 -progress 输出为实时进度，
 *       支持通过 AbortSignal 中止（取消转换），并聚合 stderr 错误信息。
 *
 * 设计说明：
 *   - 子进程由本模块创建并持有，CPU 密集转码不阻塞主进程 UI 线程；
 *   - 进度来自 stdout 的 key=value 行（由 args.ts 的 -progress pipe:1 产生），
 *     配合已知时长计算百分比；时长未知时 percent 保持 0（UI 显示“处理中”）；
 *   - stderr 仅保留末尾若干行（-loglevel error 下通常是真正的报错），供失败原因展示。
 */
import { spawn } from 'node:child_process'
import { getFfmpegPath } from './paths'

/** 解析出的单条进度快照 */
export interface ParsedProgress {
  /** 完成百分比 0-100（未知时长时为 0） */
  percent: number
  /** 实时速度（如 1.5x；无则为空串） */
  speed: string
  /** 实时帧率 */
  fps: number
  /** 实时码率（如 1234kbits/s；无则为空串） */
  bitrate: string
  /** 已处理时长（毫秒） */
  outTimeMs: number
}

/** 运行选项 */
export interface RunFfmpegOptions {
  /** 输入媒体总时长（秒），用于计算百分比；缺失时 percent 恒为 0 */
  durationSec?: number | null
  /** 实时进度回调 */
  onProgress?: (p: ParsedProgress) => void
  /** 取消信号：触发后中止子进程 */
  signal?: AbortSignal
}

/** 运行结果 */
export interface RunFfmpegResult {
  /** 退出码；被信号终止为 null */
  code: number | null
  /** 终止信号名（正常退出为 null） */
  signal: string | null
  /** 失败原因（stderr 末尾聚合），成功为 null */
  error: string | null
}

/** stderr 保留的最大行数（防止长输出撑爆内存） */
const MAX_STDERR_LINES = 30

/**
 * 解析一行 -progress key=value 输出，返回收集到的字段（部分字段可能缺失）。
 */
function parseProgressLine(line: string, acc: {
  outTimeMs: number
  speed: string
  fps: number
  bitrate: string
}): void {
  const eq = line.indexOf('=')
  if (eq <= 0) return
  const key = line.slice(0, eq).trim()
  const value = line.slice(eq + 1).trim()
  switch (key) {
    case 'out_time_ms':
    case 'out_time_us': {
      // 两者单位不同：ms 直接可用，us 需要 /1000
      const n = Number(value)
      if (Number.isFinite(n)) {
        acc.outTimeMs = key === 'out_time_ms' ? n : n / 1000
      }
      break
    }
    case 'speed':
      acc.speed = value
      break
    case 'fps': {
      const n = Number(value)
      if (Number.isFinite(n)) acc.fps = n
      break
    }
    case 'bitrate':
      acc.bitrate = value
      break
  }
}

/**
 * 运行 ffmpeg 并等待结束。
 * @param args ffmpeg 参数（不含程序名，由本模块拼接 ffmpeg 路径）
 * @param opts 运行选项（时长/进度回调/取消信号）
 */
export function runFfmpeg(args: string[], opts: RunFfmpegOptions = {}): Promise<RunFfmpegResult> {
  return new Promise((resolve) => {
    // windowsHide：转换期间不弹出黑色控制台窗口
    const child = spawn(getFfmpegPath(), args, { windowsHide: true })

    const progressAcc = { outTimeMs: 0, speed: '', fps: 0, bitrate: '' }
    const stderrTail: string[] = []
    let settled = false

    // stdout：-progress 输出的 key=value 行（行缓冲逐行解析）
    let stdoutBuf = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8')
      let nl: number
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim()
        stdoutBuf = stdoutBuf.slice(nl + 1)
        if (!line) continue
        parseProgressLine(line, progressAcc)
        if (line.startsWith('progress=')) {
          // 一条完整进度（progress=continue/end）结束后回调
          const durationMs = (opts.durationSec ?? 0) * 1000
          const percent = durationMs > 0 ? Math.min(100, (progressAcc.outTimeMs / durationMs) * 100) : 0
          opts.onProgress?.({
            percent: Math.max(0, percent),
            speed: progressAcc.speed,
            fps: progressAcc.fps,
            bitrate: progressAcc.bitrate,
            outTimeMs: progressAcc.outTimeMs,
          })
        }
      }
    })

    // stderr：保留末尾若干行，作为失败原因
    child.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString('utf8').split(/\r?\n/)
      for (const l of lines) {
        if (!l.trim()) continue
        stderrTail.push(l.trim())
        if (stderrTail.length > MAX_STDERR_LINES) stderrTail.shift()
      }
    })

    // 取消：中止子进程（Windows 下等效 TerminateProcess，残留文件由上层清理）
    const onAbort = () => {
      if (!child.killed) child.kill()
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    // 启动失败（如 ffmpeg 不存在）
    child.on('error', (err) => {
      if (settled) return
      settled = true
      resolve({ code: null, signal: null, error: `启动 ffmpeg 失败：${err.message}` })
    })

    // 退出：汇总结果
    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({
        code,
        signal,
        error: code === 0 ? null : stderrTail.join(' ') || `ffmpeg 异常退出（code=${code}）`,
      })
    })
  })
}
