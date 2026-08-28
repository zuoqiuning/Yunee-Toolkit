/**
 * 启动加载窗口（Splash）splash.ts
 * 职责：创建并管理应用启动前的独立小窗口，展示预加载进度；
 *       数据加载完成、主窗口就绪后由主进程销毁。
 *
 * 设计说明：
 *   - 安全配置与主窗口一致：contextIsolation + sandbox，无 nodeIntegration；
 *   - 页面为纯内联 HTML/CSS/JS 静态文件（resources/splash/index.html），
 *     复用同一份 preload，仅通过白名单事件通道接收主进程推送的进度。
 */
import { BrowserWindow } from 'electron'
import path from 'node:path'
import type { StartupTaskStatus } from './startup'
import { info as logInfo } from './logger'

/** 当前 Splash 窗口实例（防止被垃圾回收） */
let splashWindow: BrowserWindow | null = null

/**
 * 创建并显示 Splash 窗口：居中、无边框、不可缩放、不占任务栏、置顶显示进度。
 * loadFile 加载本地静态页；ready-to-show 后再显示，避免白屏闪烁。
 */
export function createSplashWindow(): BrowserWindow {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 350,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // 透明背景：圆角 + 阴影由加载页自绘（shell 容器），与主窗口一致
    roundedCorners: false,
    backgroundColor: '#00000000',
    transparent: true,
    // 与主窗口一致：显式关闭系统阴影，避免透明窗口出现独立的直角阴影框
    hasShadow: false,
    title: 'Yunee Toolkit',
    webPreferences: {
      // —— 与主窗口一致的核心安全配置 ——
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  })

  // 加载本地加载页（开发与打包后资源均位于 resources 目录）
  splashWindow.loadFile(path.join(__dirname, '../../resources/splash/index.html'))

  splashWindow.once('ready-to-show', () => {
    splashWindow?.show()
  })

  splashWindow.on('closed', () => {
    splashWindow = null
  })

  return splashWindow
}

/** 向 Splash 页面推送某个预加载任务的状态更新 */
export function pushTaskStatus(status: StartupTaskStatus): void {
  splashWindow?.webContents.send('splash:task', status)
}

/** 关闭并销毁 Splash 窗口（主窗口就绪后调用） */
export function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy()
  }
  splashWindow = null
  logInfo('splash', '启动加载窗口已关闭（主窗口就绪）')
}