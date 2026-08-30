/**
 * Electron 主进程入口
 * 职责（严守主进程边界）：
 *   1. 应用生命周期控制（窗口创建/关闭/退出）
 *   2. 创建主窗口并加载渲染页面
 *   3. 注册 IPC 处理器（与渲染进程通信的唯一通道）
 *
 * 注意：CPU 密集型任务（如 FFmpeg 转码）一律放在主进程通过子进程调用，
 *       不阻塞 UI 线程。
 */
import { app, BrowserWindow, screen, nativeTheme } from 'electron'
import path from 'node:path'
import { registerIpcHandlers } from '../ipc'
import { getDefaultLogDir } from '../ipc/settings'
import { initWindowControls } from '../ipc/window'
import { redirectUserDataInDev } from './dataDir'
import { readUserTheme } from './userTheme'
import { createSplashWindow, closeSplashWindow, pushTaskStatus } from './splash'
import { runStartupTasks } from './startup'
import { destroyTray, getCloseBehavior, initTray } from './tray'
import { initUpdater } from './updater'
import { setLogDir, info as logInfo, closeSession } from './logger'
import { taskQueue } from './queue/manager'

// 记录主窗口实例，防止被垃圾回收
let mainWindow: BrowserWindow | null = null

/**
 * 是否为开发环境
 * 开发环境由 cross-env 注入 NODE_ENV=development。
 */
const isDev = process.env.NODE_ENV === 'development'

// 开发环境：将用户数据重定向到项目 data 目录（须在 app ready 前调用）
redirectUserDataInDev()

// —— 单实例锁：防止多开 ——
// 二次启动时，若已获得锁则直接退出；否则监听 second-instance 聚焦已有窗口。
// 注意：必须在 app ready 之前调用，才能真正起到防多开作用。
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 已有一个实例在运行：还原最小化并聚焦主窗口
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

/**
 * 创建应用主窗口
 * 严格遵循安全配置：开启上下文隔离、沙箱，关闭 nodeIntegration。
 * 窗口规范：无边框自定义标题栏；不透明纯直角窗口（roundedCorners: false 禁用系统圆角），阴影由系统绘制。
 */
function createMainWindow(): void {
  // 窗口底色跟随“用户设置”的颜色系统（与 Splash 一致）：
  // 开启「跟随系统」时取系统深浅色，否则取手动主题；无记录（首次启动）回退系统主题。
  const userTheme = readUserTheme()
  const isDark = userTheme
    ? userTheme.themeFollowSystem
      ? nativeTheme.shouldUseDarkColors
      : userTheme.theme === 'dark'
    : nativeTheme.shouldUseDarkColors
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'Yunee Toolkit',
    autoHideMenuBar: true,
    // 不透明窗口：外观由系统绘制，渲染层直接铺满，天然单层无套壳
    // 先隐藏，待页面渲染完成（ready-to-show）再显示，避免白屏闪烁
    show: false,
    // 窗口底色跟随用户设置主题：页面首帧渲染前即呈现正确底色，
    // 与渲染层同步设置主题配合，彻底消除“先系统色后用户色”的闪烁
    backgroundColor: isDark ? '#1e1f22' : '#f4f6f9',
    // —— 自绘窗口标题栏相关 ——
    frame: false,          // 无边框：由渲染进程 TitleBar 接管标题栏
    roundedCorners: false, // 禁用系统窗口圆角（Electron 支持 Windows）：纯直角外观，风格简洁统一
    // 开发态窗口/任务栏图标（打包后由 exe 自带图标接管，无需运行时资源路径）
    ...(isDev ? { icon: path.join(__dirname, '../../resources/icon.ico') } : {}),
    webPreferences: {
      // —— 核心安全配置（不可妥协）——
      contextIsolation: true, // 隔离渲染进程与预加载脚本上下文
      nodeIntegration: false, // 禁止渲染进程直接访问 Node.js
      sandbox: true,          // 启用操作系统级沙箱
      // 预加载脚本：安全的 IPC 桥接通道
      preload: path.join(__dirname, '../preload/index.js'),
    },
  })

  // 记录主窗口创建与当前显示环境（屏幕分辨率便于核对多显示器/缩放场景）
  const primary = screen.getPrimaryDisplay()
  logInfo(
    'window',
    `主窗口创建：1280×820（最小 1024×680）· 主屏 ${primary.size.width}×${primary.size.height} · 缩放 ${primary.scaleFactor}x`,
  )

  // 主窗口渲染就绪后再显示，并销毁启动加载窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    logInfo('window', '主窗口已显示')
    closeSplashWindow()
  })

  // 安全加固：渲染进程禁止通过 window.open / 新窗口打开任意页面（本应用无外链需求）
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // 安全加固：拦截页内导航，仅放行开发服务器 / 本地构建产物，其余一律阻止
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:5173') : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  // 绑定窗口控制（最小化/最大化/关闭）并监听最大化状态
  initWindowControls(mainWindow)

  // 关闭窗口行为：设为「最小化到托盘」时拦截 close 改为隐藏窗口，应用不退出
  mainWindow.on('close', (event) => {
    if (getCloseBehavior() === 'tray') {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // 开发环境加载 Vite 开发服务器；生产环境加载构建产物
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  // 窗口关闭后释放引用
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * 应用就绪后启动
 * 流程：注册 IPC → 显示启动加载小窗口（Splash）→ 并行预加载数据至缓存 →
 *      创建主窗口（就绪后显示并关闭 Splash）。
 * 预加载含总超时兜底，保证任何异常情况下都能进入主界面。
 */
app.whenReady().then(async () => {
  // 初始化日志系统：先落在默认日志目录（渲染进程载入后会按用户自定义目录热切换）
  setLogDir(getDefaultLogDir(), { retainDays: 7, maxFiles: 50 })
  logInfo('main', '应用已就绪（app.whenReady），开始启动流程')

  // 注册所有 IPC 处理器（主进程与渲染进程的通信通道）
  registerIpcHandlers()

  // 显示启动加载小窗口，并执行数据预加载（存储统计 / FFmpeg / 显卡）
  logInfo('main', '显示启动加载窗口（Splash），开始并行预加载数据')
  createSplashWindow()
  await Promise.race([
    runStartupTasks((task) => pushTaskStatus(task)),
    // 兜底超时：预加载异常卡死时不再等待，直接进入主窗口
    new Promise((resolve) => setTimeout(resolve, 12000)),
  ])

  createMainWindow()
  logInfo('main', '主窗口创建完成，应用启动流程结束')

  // 创建系统托盘（绑定主窗口：托盘菜单“显示/设置”与“最小化到托盘”均依赖该引用）
  if (mainWindow) initTray(mainWindow)

  // 初始化自动更新（绑定主窗口获取器，把更新状态事件推送给界面）
  initUpdater(() => mainWindow)

  // macOS 习惯：点击 Dock 图标时若无窗口则重建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

// 非 macOS 平台：所有窗口关闭即退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前：中止运行中的转换任务、销毁托盘（避免残留图标），并写入「会话结束」标记
app.on('before-quit', () => {
  taskQueue.shutdown()
  destroyTray()
  closeSession('应用退出')
})