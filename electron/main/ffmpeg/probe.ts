/**
 * 媒体信息探测 probe.ts
 * 职责：调用 ffprobe 读取输入媒体的基础信息（时长/分辨率/编码），
 *       供界面展示输入文件详情与任务百分比计算（时长）使用。
 *
 * 设计说明：
 *   - 一次性 JSON 输出，解析更稳定；失败（非媒体/文件缺失）返回 null，调用方兜底；
 *   - 通过 -v error 抑制非错误输出，只保留 JSON 结果。
 */
import { spawn } from 'node:child_process'
import { getFfprobePath } from './paths'

/** 媒体基础信息 */
export interface MediaInfo {
  /** 总时长（秒） */
  durationSec: number
  /** 视频宽度（无视频为 0） */
  width: number
  /** 视频高度（无视频为 0） */
  height: number
  /** 视频编码（无视频为空串） */
  videoCodec: string
  /** 音频编码（无音频为空串） */
  audioCodec: string
  /** 是否含视频流 */
  hasVideo: boolean
  /** 是否含音频流 */
  hasAudio: boolean
  /** 容器格式名（如 mov,mp4,m4a,3gp,3g2,mj2） */
  formatName: string
}

/** ffprobe JSON 输出结构（仅取所需字段） */
interface FfprobeJson {
  streams?: {
    codec_type?: string
    codec_name?: string
    width?: number
    height?: number
  }[]
  format?: {
    duration?: string
    format_name?: string
  }
}

/**
 * 探测输入媒体的基础信息。
 * @param input 媒体文件绝对路径
 * @returns 解析成功返回 MediaInfo；失败（非媒体/文件缺失/超时）返回 null
 */
export function probeMedia(input: string): Promise<MediaInfo | null> {
  return new Promise((resolve) => {
    const child = spawn(
      getFfprobePath(),
      [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        input,
      ],
      { windowsHide: true },
    )

    let stdout = ''
    let settled = false

    // 兜底超时：ffprobe 卡死（如损坏文件）时 8 秒后放弃
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      resolve(null)
    }, 8000)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.on('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(null)
    })

    child.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(parseProbe(stdout))
    })
  })
}

/** 解析 ffprobe JSON 为标准 MediaInfo */
function parseProbe(stdout: string): MediaInfo | null {
  try {
    const data = JSON.parse(stdout) as FfprobeJson
    const streams = data.streams ?? []
    const video = streams.find((s) => s.codec_type === 'video')
    const audio = streams.find((s) => s.codec_type === 'audio')
    const duration = Number(data.format?.duration ?? 0)
    return {
      durationSec: Number.isFinite(duration) ? duration : 0,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      videoCodec: video?.codec_name ?? '',
      audioCodec: audio?.codec_name ?? '',
      hasVideo: !!video,
      hasAudio: !!audio,
      formatName: data.format?.format_name ?? '',
    }
  } catch {
    return null
  }
}
