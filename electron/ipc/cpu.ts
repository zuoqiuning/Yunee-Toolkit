/**
 * CPU 信息 IPC 处理器 cpu.ts
 * 职责：向渲染进程返回启动阶段检测到的 CPU 信息（型号 / 物理核 / 逻辑核）。
 * 说明：结果来自启动预加载缓存（startupCache.cpu），未检测（如纯浏览器预览）时返回 null，
 *       渲染进程据此降级（线程上限回退为兜底值）。
 */
import { ipcMain } from 'electron'
import { startupCache } from '../main/cache'

/** 注册 CPU 相关 IPC 处理器 */
export function registerCpuIpc(): void {
  // 返回 CPU 检测结果；启动阶段（Splash 期间）已生成，可即时返回
  ipcMain.handle('cpu:get-info', () => startupCache.cpu)
}