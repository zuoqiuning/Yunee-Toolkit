/**
 * 启动预加载任务编排 startup.ts
 * 职责：在 Splash 窗口展示期间，并发执行全部“慢数据”预加载任务，将结果写入
 *       startupCache，渲染进程各面板可即时读取，无需进入界面时现场等待。
 *
 * 任务清单（全部在启动阶段后台并行完成）：
 *   - 统计应用基底目录 / 工具目录占用（递归遍历，最慢的一项）；
 *   - 探测全部内置工具（注册表驱动，当前含 FFmpeg，后续可扩展）；
 *   - 检测显卡信息（拉起系统命令）；
 *   - 检测 CPU 信息（型号 / 物理核 / 逻辑核）。
 */
import {
  dirSizeAsync,
} from '../ipc/settings'
import { startupCache, type GpuDetectResult } from './cache'
import { detectCpu, type CpuInfo } from './cpu'
import { getAppBaseDir } from './dataDir'
import { getBinRootPath } from './ffmpeg/paths'
import { detectGpuWithBest, type GpuBrand, type GpuInfo } from './hardware'
import { getToolsSummaryLabel, probeTools } from './tools/detect'
import type { ToolProbeResult } from './tools/types'
import { info as logInfo } from './logger'

/** 字节 → 可读大小（B/KB/MB/GB，保留 1 位小数） */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const v = bytes / 1024 ** i
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

/** 显卡品牌 → 可读文案 */
function brandLabel(brand: GpuBrand): string {
  switch (brand) {
    case 'nvidia':
      return 'NVIDIA'
    case 'amd':
      return 'AMD'
    case 'intel':
      return 'Intel'
    default:
      return '无（使用 CPU 软解）'
  }
}

/** 生成工具探测结果的可读摘要：工具名 + 各组件版本 */
function toolsSummary(tools: ToolProbeResult[]): string {
  if (!tools.length) return '未发现任何工具'
  return tools
    .map((t) => {
      const comps = t.executables
        .map((e) => (e.exists ? `${e.label} v${e.version ?? '?'}` : `${e.label}（缺失）`))
        .join('、')
      return `${t.label}[${comps}]`
    })
    .join('；')
}

/** 任务状态：等待 / 进行中 / 完成 / 失败 */
export type StartupTaskState = 'pending' | 'running' | 'done' | 'error'

/** 单个预加载任务的标识与展示信息（推送给 Splash 页面） */
export interface StartupTaskStatus {
  /** 任务唯一定位符（Splash 页面用 data-task 对应） */
  id: 'storage' | 'tools' | 'gpu' | 'cpu'
  /** 任务显示名 */
  label: string
  /** 当前状态 */
  state: StartupTaskState
}

/** 预加载任务列表定义（splash 页面按此渲染占位，二处保持一致） */
export function getStartupTasks(): StartupTaskStatus[] {
  // 工具任务文案跟随注册表动态生成：当前为 “FFmpeg”，新增工具自动拼接
  const toolsLabel = `探测工具 · ${getToolsSummaryLabel()}`
  return [
    { id: 'storage', label: '统计磁盘占用', state: 'pending' },
    { id: 'tools', label: toolsLabel, state: 'pending' },
    { id: 'gpu', label: '检测显卡信息', state: 'pending' },
    { id: 'cpu', label: '检测 CPU 信息', state: 'pending' },
  ]
}

/** 执行所有预加载任务；每个任务状态变化时回调（用于推送进度给 Splash） */
export async function runStartupTasks(
  onStatus: (task: StartupTaskStatus) => void,
): Promise<void> {
  const tasks = getStartupTasks()

  /** 运行单个任务：置为进行中 → 执行 → 标记完成/失败 → 回调通知 */
  const run = async (
    task: StartupTaskStatus,
    job: () => Promise<void>,
  ): Promise<void> => {
    task.state = 'running'
    onStatus({ ...task })
    try {
      await job()
      task.state = 'done'
      logInfo('startup', `预加载任务完成: ${task.label}`)
    } catch (err) {
      task.state = 'error'
      logInfo('startup', `预加载任务失败: ${task.label} · ${String(err)}`)
    }
    onStatus({ ...task })
  }

  // 全部任务并行执行，互不等待
  await Promise.all([
    run(tasks[0], loadStorageStat),
    run(tasks[1], loadTools),
    run(tasks[2], loadGpuInfo),
    run(tasks[3], loadCpuInfo),
  ])

  // 预加载结束后：汇总“启动缓存就绪”状态，日志可快速核对哪些数据已温缓存
  const cached: string[] = []
  if (startupCache.appTotalSize !== null) cached.push(`存储占用（软件 ${formatBytes(startupCache.appTotalSize)}）`)
  if (startupCache.toolsSize !== null) cached.push(`工具目录（${formatBytes(startupCache.toolsSize)}）`)
  if (startupCache.tools) cached.push(`工具探测（${startupCache.tools.length} 个工具）`)
  if (startupCache.gpu) cached.push(`显卡检测（${startupCache.gpu.gpus.length} 张有效显卡）`)
  if (startupCache.cpu) cached.push('CPU 信息')
  logInfo('startup', `启动缓存已就绪：${cached.length ? cached.join(' | ') : '无，全部加载失败'}`)

  // 写入本机硬件配置综合摘要（CPU / GPU / 推荐加速，供日志快速核对用户环境）
  logSystemSummary()
}

/**
 * 预加载完成后输出「本机配置综合摘要」：
 * 汇总 CPU 型号与核心、显卡列表与推荐加速方案，构成一次启动的硬件快照。
 */
function logSystemSummary(): void {
  const cpu: CpuInfo | null = startupCache.cpu
  const gpu: GpuDetectResult | null = startupCache.gpu
  if (cpu) {
    logInfo(
      'system',
      `CPU 型号: ${cpu.model} · ${cpu.physicalCores} 物理核 / ${cpu.logicalCores} 线程`,
    )
  }
  if (gpu) {
    const gpuList = gpu.gpus.length
      ? gpu.gpus.map((g) => `${g.name}${g.count > 1 ? ` ×${g.count}` : ''}`).join('、')
      : '未检测到独立显卡'
    logInfo('system', `显卡列表: ${gpuList} · 推荐加速: ${brandLabel(gpu.best)}`)
  }
}

/** 预加载：统计应用基底目录与工具目录占用（供“存储”面板秒开） */
async function loadStorageStat(): Promise<void> {
  const [appTotalSize, toolsSize] = await Promise.all([
    dirSizeAsync(getAppBaseDir()),
    dirSizeAsync(getBinRootPath()),
  ])
  startupCache.appTotalSize = appTotalSize
  startupCache.toolsSize = toolsSize
  logInfo(
    'startup',
    `磁盘占用统计完成：应用目录 ${formatBytes(appTotalSize)} / 工具目录 ${formatBytes(toolsSize)}`,
  )
}

/** 预加载：探测全部已注册工具的存在性与版本（供“工具”面板秒开） */
async function loadTools(): Promise<void> {
  const tools = await probeTools()
  startupCache.tools = tools
  logInfo('startup', `工具探测完成：${toolsSummary(tools)}`)
}

/** 预加载：检测显卡（供“性能”面板秒开与首次自动选配） */
async function loadGpuInfo(): Promise<void> {
  const gpu = await detectGpuWithBest()
  startupCache.gpu = gpu
  const gpuList = gpu.gpus.length
    ? gpu.gpus.map((g: GpuInfo) => `${g.name}${g.count > 1 ? ` ×${g.count}` : ''}`).join('、')
    : '未检测到独立显卡'
  logInfo('startup', `显卡检测完成：${gpuList} · 推荐加速 ${brandLabel(gpu.best)}`)
}

/** 预加载：检测 CPU（供“性能”面板限定编码线程上限） */
async function loadCpuInfo(): Promise<void> {
  const cpu = await detectCpu()
  startupCache.cpu = cpu
  logInfo(
    'startup',
    `CPU 检测完成：${cpu.model} · ${cpu.physicalCores} 物理核 / ${cpu.logicalCores} 线程`,
  )
}