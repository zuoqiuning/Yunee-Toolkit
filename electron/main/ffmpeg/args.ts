/**
 * FFmpeg 命令参数构造 args.ts
 * 职责：根据「转换任务规格」（类型 + 参数）构造 ffmpeg 命令行参数数组。
 *
 * 设计说明：
 *   - 由 queue/types.ts 的 ConversionOptions 驱动，界面状态 → 参数数组的单一翻译点；
 *   - 软编（libx264/libx265/libvpx-vp9）用 CRF 恒定质量；硬件编码（NVENC/QSV/AMF）
 *     使用各厂商对应的恒定质量参数，保证不同编码器体验一致；
 *   - 统一追加 -progress pipe:1 -nostats：把进度 key=value 打到 stdout 供 runner 解析，
 *     stderr 只保留错误信息。
 */
import type { ConversionOptions, TaskKind } from '../queue/types'

/** 画质档位 → CRF（数值越小越清晰、体积越大） */
export const CRF_VALUES: Record<string, number> = {
  high: 18, // 高画质
  medium: 23, // 平衡
  low: 28, // 高压缩
}

/** 软编速度预设（libx264/libx265） */
const ENCODER_PRESET = 'medium'

/** 硬件加速品牌 → 编解码器变体 */
const HW_VIDEO_ENCODERS: Record<string, { h264: string; hevc: string }> = {
  nvidia: { h264: 'h264_nvenc', hevc: 'hevc_nvenc' },
  intel: { h264: 'h264_qsv', hevc: 'hevc_qsv' },
  amd: { h264: 'h264_amf', hevc: 'hevc_amf' },
}

/** 硬件加速品牌 → 解码端参数 */
const HW_DECODE_ARGS: Record<string, string[]> = {
  nvidia: ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'],
  intel: ['-hwaccel', 'qsv'],
  amd: ['-hwaccel', 'd3d11va'],
}

/** 软编编码器名（无硬件加速或硬件不支持时回退） */
const SW_VIDEO_ENCODERS: Record<string, string> = {
  h264: 'libx264',
  hevc: 'libx265',
  vp9: 'libvpx-vp9',
  av1: 'libaom-av1',
}

/** 音频编码器名 */
const AUDIO_ENCODERS: Record<string, string> = {
  aac: 'aac',
  mp3: 'libmp3lame',
  opus: 'libopus',
  vorbis: 'libvorbis',
}

/**
 * 构造 ffmpeg 完整参数列表。
 * @param kind 转换类型（当前实现视频转码/封装；音频/图片预留同一入口）
 * @param input 输入文件绝对路径
 * @param output 输出文件绝对路径
 * @param options 转换参数
 */
export function buildFfmpegArgs(
  kind: TaskKind,
  input: string,
  output: string,
  options: ConversionOptions,
): string[] {
  const args: string[] = ['-y']

  // 编码线程数（仅当设置 >0 时显式指定，0/缺省由 ffmpeg 自动决定）
  if (options.threads && options.threads > 0) {
    args.push('-threads', String(options.threads))
  }

  // —— 视频 / 容器：处理视频流 ——
  if (kind === 'video' || kind === 'container') {
    const videoCodec = options.videoCodec ?? 'copy'
    const hw = options.hwaccel && options.hwaccel !== 'none' ? options.hwaccel : null

    // 解码端硬件加速（仅在软件可编码且选用硬解时追加，避免与流复制冲突）
    if (hw && videoCodec !== 'copy') {
      args.push(...(HW_DECODE_ARGS[hw] ?? []))
    }

    args.push('-i', input)

    if (videoCodec === 'copy') {
      // 流复制：不重新编码，仅改封装（速度最快，但不改变编码）
      args.push('-c:v', 'copy')
    } else {
      // 编码器：优先硬件变体，其次软件编码
      const hwEnc = hw ? HW_VIDEO_ENCODERS[hw]?.[videoCodec] : undefined
      const encoder = hwEnc ?? SW_VIDEO_ENCODERS[videoCodec] ?? SW_VIDEO_ENCODERS.h264
      args.push('-c:v', encoder)

      const crf = options.crf ?? CRF_VALUES.medium
      if (encoder === 'libvpx-vp9') {
        // VP9 恒定质量需配合 -b:v 0
        args.push('-b:v', '0', '-crf', String(crf))
      } else if (hwEnc) {
        // 各硬件编码器的恒定质量参数（数组展开为独立参数：
        // 若整体 push 会把 ['-cq','23'] 变成单个元素，ffmpeg 将报 Unrecognized option 'cq,23'）
        args.push(...getHwQualityArg(encoder, crf))
      } else {
        args.push('-crf', String(crf), '-preset', ENCODER_PRESET)
      }
    }

    // 分辨率缩放（宽/高任填其一，保持原始宽高比等比缩小）
    const res = options.resolution
    if (res && (res.width || res.height)) {
      const scale = res.width
        ? `scale=${res.width}:-2`
        : `scale=-2:${res.height}`
      args.push('-vf', `${scale}:force_original_aspect_ratio=decrease`)
    }

    // 输出帧率
    if (options.fps && options.fps > 0) {
      args.push('-r', String(options.fps))
    }
  } else {
    args.push('-i', input)
  }

  // —— 音频流 ——
  const audioCodec = options.audioCodec ?? 'aac'
  if (audioCodec === 'copy') {
    args.push('-c:a', 'copy')
  } else {
    args.push('-c:a', AUDIO_ENCODERS[audioCodec] ?? audioCodec)
    if (options.audioBitrate) {
      args.push('-b:a', options.audioBitrate)
    }
  }

  args.push(output)

  // —— 进度输出：key=value 打到 stdout（pipe:1），stderr 仅保留错误 ——
  args.push('-progress', 'pipe:1', '-nostats', '-loglevel', 'error')

  return args
}

/**
 * 硬件编码器的恒定质量参数。
 * NVENC：-cq；QSV：-global_quality；AMF：-qp（均为 0-51 类似 CRF 的取值）。
 */
function getHwQualityArg(encoder: string, crf: number): string[] {
  if (encoder.includes('nvenc')) return ['-cq', String(crf)]
  if (encoder.includes('qsv')) return ['-global_quality', String(crf)]
  return ['-qp', String(crf)]
}
