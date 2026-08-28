/**
 * 工具探测 IPC 处理器 tools.ts
 * 职责：向渲染进程返回全部已注册工具的探测结果（目录 / 组件存在性 / 版本）。
 * 说明：结果来自启动预加载缓存（startupCache.tools），force=true 强制重新探测并回写；
 *       工具为自动扫描 bin 目录发现（目录即工具），本通道自动返回，无需改动。
 */
import { ipcMain } from 'electron'
import { startupCache } from '../main/cache'
import { probeTools } from '../main/tools/detect'
import { info as logInfo } from '../main/logger'

/** 注册工具相关 IPC 处理器 */
export function registerToolsIpc(): void {
  // 返回工具探测结果；启动阶段（Splash 期间）已生成，可即时返回
  ipcMain.handle('tools:get', async (_e, force: unknown) => {
    if (!force && startupCache.tools) return startupCache.tools
    const tools = await probeTools()
    startupCache.tools = tools
    logInfo('tools', `重新探测工具完成，共 ${tools.length} 个工具`)
    return tools
  })
}