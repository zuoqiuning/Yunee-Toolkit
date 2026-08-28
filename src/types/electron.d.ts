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
  /** 日志系统：初始化/切换日志目录并应用清理规则，返回生效配置 */
  initLogger: (dir: string, retainDays: number, maxFiles: number) => Promise<LogConfig>
  /** 日志系统：上报一条用户操作记录（scope=来源模块、action=动作、message=说明） */
  logEvent: (scope: string, action: string, message: string) => Promise<boolean>
  /** 日志系统：按规则立即清理过期日志，返回移除/剩余统计 */
  cleanLogs: (retainDays: number, maxFiles: number) => Promise<LogCleanResult>
  /** 日志系统：查询当前日志目录与清理规则 */
  getLogConfig: () => Promise<LogConfig>
  /** 开源协议：读取指定开源项目的协议文本（未登记/读取失败返回 null） */
  getLicenseText: (key: string) => Promise<string | null>
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
}

export {}