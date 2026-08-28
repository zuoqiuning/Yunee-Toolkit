/**
 * 视频转换模块：类型与默认值 types.ts
 * 职责：定义视频转换页面的「转换参数」结构、默认值，以及到主进程 ConversionOptions 的翻译。
 *
 * 设计说明：
 *   - 页面参数（VideoParams）与主进程参数（ConversionOptions）解耦：
 *     页面负责「档位」选择（如 1080P、平衡画质），提交前由 toConversionOptions 翻译为 ffmpeg 参数；
 *   - 分辨率/帧率/码率提供「自定义」档位，输入合法数值才生效；
 *   - 硬件加速复用设置面板的 HwAccel 类型（auto/nvidia/intel/amd/cpu），
 *     auto/cpu 在提交时翻译为 none（交由 ffmpeg 自动选择）。
 */
import type { HwAccel } from '@/stores/settings'

/** 视频编码器（copy=流复制不改编码） */
export type VideoCodec = 'copy' | 'h264' | 'hevc' | 'vp9' | 'av1'
/** 画质档位（对应 CRF 恒定质量） */
export type VideoQuality = 'high' | 'medium' | 'low'
/** 分辨率档位 */
export type ResolutionPreset = 'origin' | '1080p' | '720p' | '480p' | 'custom'
/** 帧率档位 */
export type FpsPreset = 'keep' | '24' | '25' | '30' | '60' | 'custom'
/** 音频编码器 */
export type AudioCodec = 'copy' | 'aac' | 'mp3' | 'opus' | 'vorbis'
/** 音频码率档位 */
export type AudioBitrate = 'keep' | '128k' | '192k' | '256k' | '320k'

/** 页面级视频转换参数（与主进程 ConversionOptions 的「界面状态」层） */
export interface VideoParams {
  /** 输出封装格式（扩展名） */
  format: string
  /** 视频编码器 */
  videoCodec: VideoCodec
  /** 画质档位 */
  quality: VideoQuality
  /** 分辨率档位 */
  resolution: ResolutionPreset
  /** 自定义宽度（仅 resolution=custom 时生效） */
  customWidth: number | undefined
  /** 自定义高度（仅 resolution=custom 时生效） */
  customHeight: number | undefined
  /** 帧率档位 */
  fps: FpsPreset
  /** 自定义帧率（仅 fps=custom 时生效） */
  customFps: number | undefined
  /** 音频编码器 */
  audioCodec: AudioCodec
  /** 音频码率档位 */
  audioBitrate: AudioBitrate
  /** 硬件加速偏好（默认跟随设置面板） */
  hwaccel: HwAccel
}

/** 画质档位 → CRF（与主进程 args.ts 的 CRF_VALUES 保持一致） */
const QUALITY_CRF: Record<VideoQuality, number> = {
  high: 18,
  medium: 23,
  low: 28,
}

/** 分辨率档位 → 目标宽度（保持原始宽高比等比缩放） */
const RESOLUTION_WIDTH: Partial<Record<ResolutionPreset, number>> = {
  '1080p': 1920,
  '720p': 1280,
  '480p': 854,
}

/** 页面参数默认值 */
export function defaultVideoParams(): VideoParams {
  return {
    format: 'mp4',
    videoCodec: 'h264',
    quality: 'medium',
    resolution: 'origin',
    customWidth: undefined,
    customHeight: undefined,
    fps: 'keep',
    customFps: undefined,
    audioCodec: 'aac',
    audioBitrate: 'keep',
    hwaccel: 'auto',
  }
}

/**
 * 页面参数 → 主进程 ConversionOptions。
 * @param p 页面参数
 * @param threads 编码线程数（0=自动，不传）
 */
export function toConversionOptions(p: VideoParams, threads: number): ConversionOptions {
  const options: ConversionOptions = { format: p.format }

  // —— 视频流 ——
  if (p.videoCodec === 'copy') {
    // 流复制：不重新编码（分辨率/画质/帧率随之失效）
    options.videoCodec = 'copy'
  } else {
    options.videoCodec = p.videoCodec
    options.crf = QUALITY_CRF[p.quality]

    // 分辨率：自定义时仅使用合法数值，优先宽度
    const res = resolveResolution(p)
    if (res) options.resolution = res

    // 帧率：自定义档位需合法数值
    const fps = resolveFps(p)
    if (fps) options.fps = fps

    // 硬件加速：auto/cpu → 由 ffmpeg 自动选择（none）
    options.hwaccel =
      p.hwaccel === 'auto' || p.hwaccel === 'cpu' ? 'none' : p.hwaccel
  }

  // —— 音频流 ——
  if (p.audioCodec === 'copy') {
    options.audioCodec = 'copy'
  } else {
    options.audioCodec = p.audioCodec
    if (p.audioBitrate !== 'keep') options.audioBitrate = p.audioBitrate
  }

  // 编码线程数（设置面板配置；0=自动不传）
  if (threads > 0) options.threads = threads

  return options
}

/** 解析分辨率档位 → 目标尺寸（无缩放返回 null） */
function resolveResolution(p: VideoParams): { width?: number; height?: number } | null {
  const w = RESOLUTION_WIDTH[p.resolution]
  if (w) return { width: w }
  if (p.resolution === 'custom') {
    if (p.customWidth && p.customWidth > 0) return { width: p.customWidth }
    if (p.customHeight && p.customHeight > 0) return { height: p.customHeight }
  }
  return null
}

/** 解析帧率档位 → 目标帧率（保持原帧率或非法自定义返回 null） */
function resolveFps(p: VideoParams): number | null {
  if (p.fps === 'custom') return p.customFps && p.customFps > 0 ? p.customFps : null
  if (p.fps === 'keep') return null
  return Number(p.fps)
}
