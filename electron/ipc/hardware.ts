/**
 * 硬件信息 IPC 处理器 hardware.ts
 * 职责：向渲染进程返回启动阶段检测到的显卡信息（型号 / 品牌 / 推荐方案）。
 * 说明：结果来自启动预加载缓存（startupCache.gpu），未检测（如纯浏览器预览）时返回 null，
 *       渲染进程据此自行降级处理。
 */
import { ipcMain } from 'electron'
import { startupCache } from '../main/cache'

/** 注册硬件相关 IPC 处理器 */
export function registerHardwareIpc(): void {
  // 返回显卡检测结果；启动阶段（Splash 期间）已生成，可即时返回
  ipcMain.handle('hardware:get-gpu-info', () => startupCache.gpu)
}