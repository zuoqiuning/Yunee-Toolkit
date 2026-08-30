/**
 * 渲染进程全局类型声明
 * 职责：为渲染进程补充 Vue SFC、静态资源及 Electron 预加载桥接的 TS 类型。
 */

// 让 .vue 文件被 TypeScript 识别为一个组件模块
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}

// 静态资源类型（图片等）
declare module '*.svg' {
  const content: string
  export default content
}

// 自绘标题栏的窗口控制 API 类型
interface WindowControlsApi {
  /** 最小化窗口 */
  minimize: () => Promise<void>
  /** 最大化 / 还原切换 */
  toggleMaximize: () => Promise<void>
  /** 关闭窗口 */
  close: () => Promise<void>
}

// 存储统计结果
interface FfmpegStorageStat {
  path: string
  sizeBytes: number
}

// 显卡品牌
type GpuBrand = 'nvidia' | 'amd' | 'intel' | 'unknown'

// 单张显卡信息
interface GpuInfo {
  brand: GpuBrand
  name: string
  /** 同型号显卡数量（交火 / 重复枚举合并后：1 或 N） */
  count: number
}

// 显卡检测结果（含推荐加速品牌）
interface GpuDetectResult {
  gpus: GpuInfo[]
  best: GpuBrand
}

// 本机 CPU 信息
interface CpuInfo {
  /** CPU 型号 */
  model: string
  /** 物理核心数 */
  physicalCores: number
  /** 逻辑核心数（线程数） */
  logicalCores: number
}

// 日志清理统计结果
interface LogCleanResult {
  /** 本次移除的日志文件数 */
  removed: number
  /** 清理后剩余日志文件数 */
  remaining: number
}

// 日志系统配置（目录 + 清理规则）
interface LogConfig {
  dir: string
  retainDays: number
  maxFiles: number
}

// 预加载脚本通过 contextBridge 暴露到 window 上的安全 API 类型
interface YuneeApi {
  /** 获取应用版本信息 */
  getAppVersion: () => Promise<string>
  /** 查询当前系统是否为深色模式（基于主进程 nativeTheme，比渲染层 matchMedia 更可靠） */
  getSystemDark: () => Promise<boolean>
  /** 获取 FFmpeg 三个可执行文件所在的目录 */
  getFfmpegBinPath: () => Promise<string>
  /** 自绘标题栏的窗口控制 */
  windowControl: WindowControlsApi
  /** 订阅主进程推送的事件，返回取消订阅函数 */
  onMainEvent: (channel: string, handler: (payload: unknown) => void) => () => void
  /** 探测全部内置工具的结果；启动阶段已缓存，force=true 强制重新探测 */
  getTools: (force?: boolean) => Promise<ToolProbeResult[]>
  /** 弹出目录选择对话框，取消返回 null */
  selectDirectory: () => Promise<string | null>
  /** 读取开机自启状态 */
  getAutoStart: () => Promise<boolean>
  /** 设置开机自启 */
  setAutoStart: (enabled: boolean) => Promise<boolean>
  /** 获取 FFmpeg 工具目录及占用 */
  getFfmpegStorageStat: () => Promise<FfmpegStorageStat>
  /** 清理指定临时目录 */
  cleanTempDir: (tempDir: string) => Promise<boolean>
  /** 获取安装目录下的默认输出/临时目录（自动创建） */
  getDefaultDirs: () => Promise<DefaultDirs>
  /** 获取用户数据目录 */
  getDataDir: () => Promise<DataDirInfo>
  /** 在系统文件管理器中打开指定目录 */
  openDirectory: (dir: string) => Promise<boolean>
  /** 获取“存储”饼图所需的三块占用（软件 / 工具 / 输出目录）；启动阶段已缓存，force=true 强制重算 */
  getSpaceStat: (outputDir: string, force?: boolean) => Promise<{ appSize: number; toolsSize: number; outputSize: number }>
  /** 获取启动阶段检测到的显卡信息（型号 / 品牌 / 推荐），未检测到返回 null */
  getGpuInfo: () => Promise<GpuDetectResult | null>
  /** 获取启动阶段检测到的 CPU 信息（型号 / 物理核 / 逻辑核），未检测到返回 null */
  getCpuInfo: () => Promise<CpuInfo | null>
  /** 设置关闭窗口行为：exit=退出，tray=最小化到托盘（同步到主进程托盘/关闭逻辑） */
  setCloseBehavior: (behavior: 'exit' | 'tray') => Promise<boolean>
  /** 日志系统：初始化/切换日志目录并应用清理规则，返回生效配置 */
  initLogger: (dir: string, retainDays: number, maxFiles: number) => Promise<LogConfig>
  /** 日志系统：上报一条用户操作记录（scope=来源模块、action=动作、message=说明） */
  logEvent: (scope: string, action: string, message: string) => Promise<boolean>
  /** 日志系统：按规则立即清理过期日志，返回移除/剩余统计 */
  cleanLogs: (retainDays: number, maxFiles: number) => Promise<LogCleanResult>
  /** 日志系统：查询当前日志目录与清理规则 */
  getLogConfig: () => Promise<LogConfig>
  /** 日志系统：列出日志目录下全部日志文件（在线查看列表，按日期倒序） */
  listLogs: () => Promise<LogFileInfo[]>
  /** 日志系统：读取指定日志文件内容（在线查看；非法文件名/读取失败返回 null） */
  readLog: (name: string) => Promise<string | null>
  /** 临时文件清理：上报自动清理配置（目录 + 开关 + 保留天数），主进程据此启动时按天清理残留，返回移除条目数 */
  syncTempClean: (tempDir: string, autoClean: boolean, retainDays: number) => Promise<number>
  /** 用户主题设置：同步到主进程（落盘供 Splash 加载窗口 / 主窗口背景色读取，与界面配色一致） */
  syncUserTheme: (theme: 'light' | 'dark', followSystem: boolean) => Promise<boolean>
  /** 自动更新：触发一次更新检查（manual=true 用户手动触发，无更新/出错会提示；false 启动静默检查） */
  checkForUpdates: (manual?: boolean) => Promise<boolean>
  /** 自动更新：立即重启并安装已下载的更新 */
  installUpdate: () => Promise<boolean>
  /** 自动更新：应用「更新代理」配置（enabled=开关，url=代理地址，如 http://127.0.0.1:7890） */
  applyUpdateProxy: (enabled: boolean, url: string) => Promise<boolean>
  /** 开源协议：读取指定开源项目的协议文本（未登记/读取失败返回 null） */
  getLicenseText: (key: string) => Promise<string | null>
  /** 弹出文件选择对话框（可按过滤器限定类型），取消返回 null */
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  /** 获取拖拽 File 对象的真实文件系统路径（Electron 官方安全 API，替代已移除的 File.path） */
  getPathForFile: (file: File) => string
  /** 转换任务：入队一个新任务，返回创建的任务（含 id/初始状态）；校验失败返回 null */
  startConversion: (payload: {
    kind: 'video' | 'audio' | 'image' | 'container'
    input: string
    output: string
    options?: ConversionOptions
    priority?: 'low' | 'normal' | 'high'
  }) => Promise<ConversionTask | null>
  /** 转换任务：取消（运行中中止+清理残留；排队中移除） */
  cancelConversion: (id: string) => Promise<boolean>
  /** 转换任务：查询全部任务 */
  getConversionTasks: () => Promise<ConversionTask[]>
  /** 转换任务：清理全部已结束任务，返回清理数量 */
  clearFinishedConversions: () => Promise<number>
  /** 媒体信息：探测输入文件（非媒体/不存在返回 null），供界面展示文件详情 */
  probeMedia: (input: string) => Promise<MediaInfo | null>
  /** 输出路径：输入文件 + 格式 + 命名预设 + 输出目录 → 输出路径（含重名策略所需的存在标记） */
  resolveOutput: (payload: {
    input: string
    format: string
    preset?: 'keep' | 'time-suffix' | 'time-prefix'
    outputDir?: string
  }) => Promise<ResolveOutputResult | null>
}

/** 安装目录下的默认输出/临时/日志目录 */
interface DefaultDirs {
  installDir: string
  outputDir: string
  tempDir: string
  logDir: string
}

/** 用户数据目录信息 */
interface DataDirInfo {
  path: string
  /** 是否使用自定义（项目内）位置（开发环境为 true） */
  isCustom: boolean
}

declare global {
  interface Window {
    // Electron 预加载暴露的安全桥接对象
    yuneeAPI?: YuneeApi
  }

  // 日志文件信息（在线查看列表展示）
  interface LogFileInfo {
    /** 文件名（YYYY-MM-DD.log） */
    name: string
    /** 日期键（YYYY-MM-DD） */
    date: string
    /** 文件大小（字节） */
    size: number
  }

  // 工具探测：单个可执行组件的信息
  interface ToolExecutableInfo {
    /** 组件关键字（如 'ffmpeg'），表格 row-key */
    key: string
    /** 组件显示名（如 'FFmpeg'） */
    label: string
    /** 组件简介（来自注册表规范；未登记组件为空字符串） */
    desc: string
    /** 可执行文件绝对路径 */
    path: string
    /** 文件是否存在 */
    exists: boolean
    /** 版本号（-version 首行解析），探测失败或缺失时为 null */
    version: string | null
  }

  // 工具探测：单个工具的探测结果（注册表驱动，后续新增工具自动出现在列表）
  interface ToolProbeResult {
    /** 工具唯一 id（对应 bin 子目录名） */
    id: string
    /** 工具显示名 */
    label: string
    /** 相对 bin 根目录的子目录名 */
    dir: string
    /** 工具目录绝对路径 */
    dirPath: string
    /** 各可执行组件的探测结果 */
    executables: ToolExecutableInfo[]
  }

  // 转换任务：类型（与主进程 queue/types 保持一致）
  type TaskKind = 'video' | 'audio' | 'image' | 'container'
  type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'aborted'
  type TaskPriority = 'low' | 'normal' | 'high'

  // 转换任务：参数
  interface ConversionOptions {
    format?: string
    videoCodec?: 'copy' | 'h264' | 'hevc' | 'vp9' | 'av1'
    crf?: number
    resolution?: { width?: number; height?: number } | null
    fps?: number | null
    audioCodec?: 'copy' | 'aac' | 'mp3' | 'opus' | 'vorbis'
    audioBitrate?: string
    hwaccel?: 'none' | 'nvidia' | 'intel' | 'amd'
    threads?: number
    deleteSource?: boolean
  }

  // 转换任务：进度
  interface TaskProgress {
    percent: number
    speed: string
    fps: number
    bitrate: string
    outTimeMs: number
  }

  // 转换任务：完整任务对象
  interface ConversionTask {
    id: string
    kind: TaskKind
    status: TaskStatus
    input: string
    output: string
    options: ConversionOptions
    progress: TaskProgress
    error: string | null
    priority: TaskPriority
    createdAt: number
    startedAt: number | null
    finishedAt: number | null
  }

  // 媒体基础信息（ffprobe 探测结果，供界面展示文件详情）
  interface MediaInfo {
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

  // 输出路径解析结果（主进程计算，供界面预览 / 重名决策）
  interface ResolveOutputResult {
    /** 直接输出路径（已应用命名预设，未去重） */
    path: string
    /** 自动改名后的不冲突路径（无冲突时等于 path） */
    uniquePath: string
    /** 直接路径是否已存在（供“每次询问”策略在界面弹窗） */
    exists: boolean
  }
}

export {}