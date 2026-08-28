/**
 * Electron 预加载脚本
 * 职责：通过 contextBridge 向渲染进程安全地暴露受控 API。
 *
 * 安全准则：
 *   - 只暴露经过封装的方法，绝不暴露 ipcRenderer 或任意对象本身
 *   - 渲染进程通过 window.yuneeAPI 调用，能力边界由本文件严格控制
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

/**
 * 对外暴露的渲染进程 API 类型（供前端 src/types/electron.d.ts 引用）
 */
export interface WindowControlsApi {
  /** 最小化窗口 */
  minimize: () => Promise<void>
  /** 最大化 / 还原切换 */
  toggleMaximize: () => Promise<void>
  /** 关闭窗口 */
  close: () => Promise<void>
}

/** 工具探测结果与组件信息（与 electron/main/tools/types.ts 保持一致） */
export type { ToolProbeResult, ToolExecutableInfo } from '../main/tools/types'

/** 存储统计结果 */
export interface FfmpegStorageStat {
  path: string
  sizeBytes: number
}

/** 安装目录下的默认输出/临时目录 */
export interface DefaultDirs {
  installDir: string
  outputDir: string
  tempDir: string
}

/** 用户数据目录信息 */
export interface DataDirInfo {
  path: string
  /** 是否使用自定义（项目内）位置（开发环境为 true） */
  isCustom: boolean
}

/** 显卡品牌 */
export type GpuBrand = 'nvidia' | 'amd' | 'intel' | 'unknown'

/** 单张显卡信息 */
export interface GpuInfo {
  brand: GpuBrand
  name: string
  /** 同型号显卡数量（交火 / 重复枚举合并后：1 或 N） */
  count: number
}

/** 显卡检测结果（含推荐加速品牌） */
export interface GpuDetectResult {
  gpus: GpuInfo[]
  best: GpuBrand
}

/** 本机 CPU 信息 */
export interface CpuInfo {
  /** CPU 型号 */
  model: string
  /** 物理核心数 */
  physicalCores: number
  /** 逻辑核心数（线程数） */
  logicalCores: number
}

/** 日志清理统计结果 */
export interface LogCleanResult {
  /** 本次移除的日志文件数 */
  removed: number
  /** 清理后剩余日志文件数 */
  remaining: number
}

/** 日志系统配置（目录 + 清理规则） */
export interface LogConfig {
  dir: string
  retainDays: number
  maxFiles: number
}

export interface YuneeApi {
  /** 获取应用版本信息 */
  getAppVersion: () => Promise<string>
  /** 获取 FFmpeg 三个可执行文件所在的目录 */
  getFfmpegBinPath: () => Promise<string>
  /** 自绘标题栏的窗口控制 */
  windowControl: WindowControlsApi
  /**
   * 订阅主进程推送的事件（如转换进度）
   * 返回一个取消订阅函数，避免内存泄漏
   */
  onMainEvent: (channel: string, handler: (payload: unknown) => void) => () => void
  /** 探测全部内置工具（注册表驱动，当前含 FFmpeg）；启动阶段已缓存，force=true 强制重新探测 */
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

// 校验 channel 白名单，仅允许注册在主进程的事件通道
const MAIN_EVENT_CHANNELS = new Set([
  'conversion-progress', // 转换进度
  'conversion-complete', // 转换完成
  'conversion-error',    // 转换失败
  'window:maximized-changed', // 窗口最大化状态变化
  'splash:task',         // 启动加载窗口：预加载任务状态
])

// 通过 contextBridge 暴露安全 API
const api: YuneeApi = {
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getFfmpegBinPath: () => ipcRenderer.invoke('ffmpeg:get-bin-path'),
  getTools: (force) => ipcRenderer.invoke('tools:get', force),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  getAutoStart: () => ipcRenderer.invoke('app:get-autostart'),
  setAutoStart: (enabled) => ipcRenderer.invoke('app:set-autostart', enabled),
  getFfmpegStorageStat: () => ipcRenderer.invoke('storage:get-ffmpeg-stat'),
  cleanTempDir: (tempDir) => ipcRenderer.invoke('storage:clean-temp', tempDir),
  getDefaultDirs: () => ipcRenderer.invoke('app:get-default-dirs'),
  getDataDir: () => ipcRenderer.invoke('app:get-data-dir'),
  openDirectory: (dir) => ipcRenderer.invoke('app:open-directory', dir),
  getSpaceStat: (outputDir, force) => ipcRenderer.invoke('storage:get-space-stat', outputDir, force),
  getGpuInfo: () => ipcRenderer.invoke('hardware:get-gpu-info'),
  getCpuInfo: () => ipcRenderer.invoke('cpu:get-info'),
  initLogger: (dir, retainDays, maxFiles) =>
    ipcRenderer.invoke('log:init', dir, retainDays, maxFiles),
  logEvent: (scope, action, message) =>
    ipcRenderer.invoke('log:event', scope, action, message),
  cleanLogs: (retainDays, maxFiles) =>
    ipcRenderer.invoke('log:clean', retainDays, maxFiles),
  getLogConfig: () => ipcRenderer.invoke('log:get-config'),
  getLicenseText: (key) => ipcRenderer.invoke('license:get', key),

  // 自绘标题栏：窗口控制
  windowControl: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:maximize-toggle'),
    close: () => ipcRenderer.invoke('win:close'),
  },

  onMainEvent: (channel, handler) => {
    // 通道与回调双重校验：防未授权通道订阅 / 防非函数回调导致运行时异常
    if (typeof handler !== 'function') {
      console.warn('[preload] 订阅主事件需提供回调函数')
      return () => {}
    }
    if (!MAIN_EVENT_CHANNELS.has(channel)) {
      console.warn(`[preload] 阻止订阅未授权的通道: ${channel}`)
      return () => {}
    }
    // 包装回调：只透传 payload，隔离 IpcRendererEvent 内部对象
    const listener = (_event: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on(channel, listener)
    // 返回取消订阅函数
    return () => ipcRenderer.removeListener(channel, listener)
  },
}

contextBridge.exposeInMainWorld('yuneeAPI', api)