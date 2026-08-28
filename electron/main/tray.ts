/**
 * 系统托盘模块 tray.ts
 * 职责：创建系统托盘图标与菜单，提供「最小化到托盘」能力（配合「关闭窗口行为」设置）。
 *
 * 设计说明：
 *   - Electron 内置 Tray 组件即可实现托盘（跨平台），无需额外 Windows 原生 API；
 *   - 托盘图标复用应用图标 resources/icon.ico（统一取 app.getAppPath()，生产环境 Electron 可从 asar 自动解包读取）；
 *   - 托盘菜单：显示主界面 / 打开设置 / 退出；
 *   - 关闭窗口行为由渲染进程「通用」设置项同步到本模块（app:set-close-behavior）；
 *     「最小化到托盘」时主窗口 close 事件被拦截并改为隐藏窗口，应用不退出。
 */
import { Tray, Menu, app, BrowserWindow } from 'electron'
import path from 'node:path'
import { info as logInfo } from './logger'

/** 关闭窗口行为：退出 / 最小化到托盘 */
export type CloseBehavior = 'exit' | 'tray'

/** 当前关闭窗口行为（默认「退出」，与改造前行为保持一致） */
let closeBehavior: CloseBehavior = 'exit'

/** 托盘实例（必须保持引用，防止被垃圾回收导致图标消失） */
let tray: Tray | null = null

/** 主窗口引用（由 initTray 注入，用于显示/聚焦） */
let mainWindow: BrowserWindow | null = null

/** 读取当前关闭窗口行为（供主窗口 close 事件判断是否拦截） */
export function getCloseBehavior(): CloseBehavior {
  return closeBehavior
}

/** 更新关闭窗口行为（由渲染进程「通用」设置同步；非法值忽略） */
export function setCloseBehavior(behavior: CloseBehavior): void {
  if (behavior !== 'exit' && behavior !== 'tray') return
  closeBehavior = behavior
  logInfo('tray', `关闭窗口行为已设为「${behavior === 'tray' ? '最小化到托盘' : '退出'}」`)
}

/** 托盘图标路径：开发环境为项目根 resources；生产环境为 app.asar 内（Electron 自动解包） */
function getTrayIconPath(): string {
  return path.join(app.getAppPath(), 'resources', 'icon.ico')
}

/** 显示并聚焦主窗口（最小化则先还原；隐藏状态则恢复显示） */
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** 打开设置：先显示主窗口，再通知渲染进程打开「设置」模态框 */
function openSettings(): void {
  showMainWindow()
  mainWindow?.webContents.send('open-settings')
}

/** 构建托盘右键菜单 */
function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: '显示主界面', click: () => showMainWindow() },
    { label: '打开设置', click: () => openSettings() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])
}

/**
 * 初始化系统托盘（绑定主窗口引用后创建图标与菜单）。
 * 仅创建一次：多次调用（如开发热重载）幂等处理。
 */
export function initTray(win: BrowserWindow): void {
  mainWindow = win
  if (tray) return
  try {
    tray = new Tray(getTrayIconPath())
    tray.setToolTip('Yunee Toolkit · 屿宁工具箱')
    tray.setContextMenu(buildMenu())
    // 单击托盘图标：显示 / 隐藏主窗口切换（Windows 常见交互）
    tray.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        showMainWindow()
      }
    })
    logInfo('tray', '系统托盘已创建')
  } catch (err) {
    // 托盘创建失败（如资源缺失）不应阻断应用，仅记录日志
    logInfo('tray', `系统托盘创建失败：${String(err)}`)
    tray = null
  }
}

/** 销毁托盘（应用退出前调用） */
export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
