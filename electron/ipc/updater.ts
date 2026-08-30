/**
 * 自动更新类 IPC 处理器 updater.ts
 * 职责：向渲染进程提供自动更新能力：
 *   - update:check   触发一次更新检查（manual=true 手动检查，失败/无更新会提示）
 *   - update:install 立即重启并安装已下载的更新
 *   - update:apply-proxy 应用「更新代理」配置（开关 + 代理地址），影响后续检查/下载
 * 事件推送：检查/下载/安装等状态由主进程 updater.ts 通过 update:* 通道主动推送给渲染进程。
 */
import { ipcMain } from 'electron'
import { applyUpdateProxy, checkForUpdates, installUpdate } from '../main/updater'

/** 注册自动更新相关 IPC 处理器 */
export function registerUpdaterIpc(): void {
  // 触发一次更新检查（manual=true 为用户手动触发，会在无更新/出错时给出提示）
  ipcMain.handle('update:check', (_e, manual: unknown) => {
    checkForUpdates(manual === true)
    return true
  })

  // 立即重启并安装已下载的更新
  ipcMain.handle('update:install', () => {
    installUpdate()
    return true
  })

  // 应用更新代理（enabled=开关，url=代理地址，如 http://127.0.0.1:7890）
  ipcMain.handle('update:apply-proxy', (_e, enabled: unknown, url: unknown) => {
    applyUpdateProxy(enabled === true, typeof url === 'string' ? url : '')
    return true
  })
}
