/**
 * 自动更新模块 updater.ts
 * 职责：基于 electron-updater 实现应用自动更新（仅生产环境真正生效）。
 *
 * 设计说明：
 *   - 更新源：GitHub Releases（由 package.json 的 build.publish 配置 owner/repo）；
 *   - 仅打包后（app.isPackaged）才实际检查更新；开发环境手动检查时提示“不可用”；
 *   - 检查分为「启动自动检查（静默）」与「用户手动检查（有提示）」两类，通过 manual 标记区分；
 *   - 新版本在后台自动下载（autoDownload = true），下载完成后由渲染进程提示用户确认重启安装；
 *   - 全部事件经 getMainWindow 转发到渲染进程（App.vue 统一订阅展示通知）。
 */
import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { info as logInfo, warn as logWarn } from './logger'

/** 主窗口获取器（由 index.ts 注入，用于把更新事件推送到界面） */
let getMainWindow: () => BrowserWindow | null = () => null
/** 最近一次检查是否由用户手动触发（决定「无更新 / 出错」时是否提示用户） */
let lastManual = false
/** 是否正在检查 / 下载中（避免重复触发） */
let isBusy = false

/** 向渲染进程推送更新事件（窗口未就绪时静默丢弃） */
function emit(channel: string, payload: unknown): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

/**
 * 初始化自动更新模块：绑定主窗口获取器并注册 electron-updater 事件监听。
 * 注意：electron-updater 在非打包环境调用 checkForUpdates 会直接报错，故统一在
 *       checkForUpdates 内做 isPackaged 拦截，事件监听本身可安全注册。
 */
export function initUpdater(winGetter: () => BrowserWindow | null): void {
  getMainWindow = winGetter
  autoUpdater.autoDownload = true // 发现新版本后后台自动下载
  autoUpdater.autoInstallOnAppQuit = true // 退出应用时自动完成安装（重启后生效）

  // 初始使用系统代理；若渲染进程配置了更新代理，会在面板挂载/变更时通过 IPC 覆盖
  applyUpdateProxy(false, '')

  autoUpdater.on('checking-for-update', () => {
    logInfo('updater', '正在检查更新…')
    emit('update:checking', { manual: lastManual })
  })

  autoUpdater.on('update-available', (info) => {
    const version = info.version ?? ''
    logInfo('updater', `发现新版本 v${version}，开始后台下载`)
    emit('update:available', { manual: lastManual, version })
  })

  autoUpdater.on('update-not-available', () => {
    logInfo('updater', '当前已是最新版本')
    emit('update:not-available', { manual: lastManual })
    isBusy = false
  })

  autoUpdater.on('download-progress', (p) => {
    emit('update:downloading', {
      percent: Math.round(p.percent * 10) / 10,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    const version = info.version ?? ''
    logInfo('updater', `新版本 v${version} 下载完成，等待用户重启安装`)
    emit('update:downloaded', { version })
    isBusy = false
  })

  autoUpdater.on('error', (err, message) => {
    // 常见场景：未打包环境 / 更新源不可达。开发环境或启动静默检查时仅记日志；
    // 用户手动检查时额外提示（由渲染进程根据 manual 决定是否弹窗）。
    logWarn('updater', `更新失败：${message ?? err.message ?? String(err)}`)
    emit('update:error', { manual: lastManual, message: message ?? err.message ?? String(err) })
    isBusy = false
  })
}

/**
 * 检查更新（manual=true 为用户手动触发，失败/无更新时提示；false 为启动静默检查）。
 * 非打包环境：手动检查时提示不可用，启动静默检查直接忽略。
 */
export function checkForUpdates(manual: boolean): void {
  if (!app.isPackaged) {
    logInfo('updater', '开发环境不执行更新检查')
    if (manual) emit('update:error', { manual: true, message: '开发环境不支持检查更新，请打包后测试。' })
    return
  }
  if (isBusy) return
  isBusy = true
  lastManual = manual
  autoUpdater.checkForUpdates().catch((err: unknown) => {
    // checkForUpdates 抛错（如网络异常）时兜底复位状态，避免卡在检查中
    logWarn('updater', `检查更新失败：${String(err)}`)
    emit('update:error', { manual, message: String(err) })
    isBusy = false
  })
}

/** 立即退出并安装已下载的更新（下载完成后由用户点击触发） */
export function installUpdate(): void {
  if (!app.isPackaged) return
  logInfo('updater', '用户确认重启安装更新')
  autoUpdater.quitAndInstall(false, true)
}

/**
 * 校验代理地址是否为合法格式。
 * 支持 http/https/socks4/socks5 前缀，如 http://127.0.0.1:7890、socks5://127.0.0.1:1080。
 */
function isValidProxyUrl(url: string): boolean {
  return /^(https?|socks4|socks5):\/\/\S+$/i.test(url.trim())
}

/**
 * 应用更新代理（由渲染进程「更新设置」同步）。
 * 原理：electron-updater 的请求走 autoUpdater.netSession（Electron 会话），
 *       通过 setProxy 把该会话切到固定代理（fixed_servers）或恢复系统代理。
 * 说明：代理配置持久化在渲染进程设置中，主进程仅保存「本次运行」的状态；
 *       渲染进程在面板挂载 / 设置变更时都会调用本函数，保证每次检查都使用最新配置。
 */
export function applyUpdateProxy(enabled: boolean, url: string): void {
  const proxyUrl = (url ?? '').trim()
  try {
    if (enabled && proxyUrl && isValidProxyUrl(proxyUrl)) {
      autoUpdater.netSession.setProxy({
        mode: 'fixed_servers', // 固定代理：所有更新请求走该代理
        proxyRules: proxyUrl,
      })
      logInfo('updater', `更新代理已启用：${proxyUrl}`)
    } else {
      // 未启用 / 地址非法：恢复系统代理（Electron 默认），保证正常网络下可用
      autoUpdater.netSession.setProxy({ mode: 'system' })
      logInfo('updater', '更新代理未启用，使用系统代理')
    }
  } catch (err) {
    logWarn('updater', `应用更新代理失败：${String(err)}`)
  }
}
