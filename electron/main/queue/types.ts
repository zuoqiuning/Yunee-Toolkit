/**
 * 转换任务队列：类型定义 types.ts
 * 职责：定义「转换任务」的统一数据结构与转换参数类型，
 *       供参数构造（args）、子进程运行（runner）与队列管理（manager）共同引用。
 *
 * 设计说明：
 *   - 任务 = 输入文件 + 输出文件 + 转换类型（kind）+ 转换参数（options）+ 运行状态；
 *   - 状态机：queued → running → completed / failed / aborted；
 *   - options 与「界面 UI 状态」解耦，由 args.ts 统一翻译成 ffmpeg 命令行参数。
 */

/** 转换类型（决定 ffmpeg 参数构造方式） */
export type TaskKind = 'video' | 'audio' | 'image' | 'container'

/** 任务状态 */
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'aborted'

/** 任务优先级（决定排队顺序） */
export type TaskPriority = 'low' | 'normal' | 'high'

/** 转换参数（与界面状态一一对应，由 args.ts 翻译为 ffmpeg 参数） */
export interface ConversionOptions {
  /** 目标封装格式（如 mp4 / mkv / avi / mov / webm） */
  format: string
  /** 视频编码器（copy=流复制不改编码） */
  videoCodec?: 'copy' | 'h264' | 'hevc' | 'vp9' | 'av1'
  /** 画质档位（CRF，数值越小越清晰） */
  crf?: number
  /** 分辨率目标（width/height 留空表示不缩放） */
  resolution?: { width?: number; height?: number } | null
  /** 输出帧率（null 表示保持源帧率） */
  fps?: number | null
  /** 音频编码器（copy=流复制） */
  audioCodec?: 'copy' | 'aac' | 'mp3' | 'opus' | 'vorbis'
  /** 音频码率（如 192k） */
  audioBitrate?: string
  /** 硬件加速偏好（决定编解码器变体） */
  hwaccel?: 'none' | 'nvidia' | 'intel' | 'amd'
  /** 编码线程数（>0 时透传给 ffmpeg；0/缺省由 ffmpeg 自动决定） */
  threads?: number
}

/** 转换进度（ffmpeg -progress 解析结果） */
export interface TaskProgress {
  /** 完成百分比 0-100（未知时长时为 0） */
  percent: number
  /** 实时速度（如 1.5x） */
  speed: string
  /** 实时帧率 */
  fps: number
  /** 实时码率（如 1234kbits/s） */
  bitrate: string
  /** 已处理时长（毫秒） */
  outTimeMs: number
}

/** 单个转换任务（对外暴露给渲染进程的完整结构） */
export interface ConversionTask {
  /** 任务唯一 id */
  id: string
  /** 转换类型 */
  kind: TaskKind
  /** 当前状态 */
  status: TaskStatus
  /** 输入文件绝对路径 */
  input: string
  /** 输出文件绝对路径 */
  output: string
  /** 转换参数 */
  options: ConversionOptions
  /** 进度（未开始为空对象） */
  progress: TaskProgress
  /** 失败原因（failed 状态时非空） */
  error: string | null
  /** 任务优先级 */
  priority: TaskPriority
  /** 创建时间（毫秒时间戳） */
  createdAt: number
  /** 开始时间（未开始为 null） */
  startedAt: number | null
  /** 结束时间（未结束为 null） */
  finishedAt: number | null
}
