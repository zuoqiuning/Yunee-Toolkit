/**
 * 启动预加载缓存容器 cache.ts
 * 职责：集中保存应用启动阶段（Splash 窗口期间）预加载到的“慢数据”，
 *       渲染进程进入对应设置界面时直接读取，避免重复等待。
 *
 * 设计说明：
 *   - 仅缓存耗时数据：目录占用统计、FFmpeg 组件版本探测、显卡检测结果；
 *   - 渲染进程“刷新”时传 force=true 强制重算并回写缓存，保证数据新鲜。
 */
import type { ToolProbeResult } from './tools/types'
import type { CpuInfo } from './cpu'
import type { GpuBrand, GpuInfo } from './hardware'

/** 显卡检测结果（显卡列表 + 推荐加速品牌） */
export interface GpuDetectResult {
  gpus: GpuInfo[]
  best: GpuBrand
}

/** 启动预加载缓存结构；null 表示该项尚未加载成功 */
export interface StartupCache {
  /** 应用基底目录总大小（字节）；开发环境为整个项目根目录 */
  appTotalSize: number | null
  /** 工具（bin 根）目录占用（字节） */
  toolsSize: number | null
  /** 全部已注册工具的探测结果（目录 / 组件存在性 / 版本） */
  tools: ToolProbeResult[] | null
  /** 显卡检测结果 */
  gpu: GpuDetectResult | null
  /** CPU 检测结果（型号 / 物理核 / 逻辑核） */
  cpu: CpuInfo | null
}

/** 全局唯一的启动缓存实例（Splash 阶段写入，渲染进程只读消费） */
export const startupCache: StartupCache = {
  appTotalSize: null,
  toolsSize: null,
  tools: null,
  gpu: null,
  cpu: null,
}