/**
 * IPC 处理器：窗口控制
 * 职责：为渲染进程的自绘标题栏提供最小化/最大化（还原）/关闭能力，
 *       并主动推送窗口最大化状态变化，供标题栏切换“最大化/还原”图标。
 *
 * 设计说明：
 *   - 通过 event.sender 反查所属窗口，无需持有全局窗口引用，低耦合。
 *   - initWindowControls 由主进程在创建窗口后调用，负责状态事件推送。
 */
import { ipcMain, BrowserWindow } from 'electron'
import { setCloseBehavior, type CloseBehavior } from '../main/tray'

/**
 * 注册窗口控制 IPC 处理器（应用就绪时与其余处理器一并注册）。
 * 说明：channel 均为 invoke 双向请求。
 */
export function registerWindowControls(): void {
  // 最小化窗口
  ipcMain.handle('win:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  // 最大化 / 还原切换
  ipcMain.handle('win:maximize-toggle', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  // 关闭窗口
  ipcMain.handle('win:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  // 同步「关闭窗口行为」（退出 / 最小化到托盘），供主窗口 close 事件判断是否拦截
  ipcMain.handle('app:set-close-behavior', (_e, behavior: unknown) => {
    if (behavior !== 'exit' && behavior !== 'tray') return false
    setCloseBehavior(behavior as CloseBehavior)
    return true
  })
}

/**
 * 绑定单个窗口的窗口控制状态推送。
 * 窗口最大化/还原时，向渲染进程广播状态，供自定义标题栏刷新图标。
 * @param win 目标 BrowserWindow
 */
export function initWindowControls(win: BrowserWindow): void {
  win.on('maximize', () => win.webContents.send('window:maximized-changed', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized-changed', false))
}