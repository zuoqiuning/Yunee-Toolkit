/**
 * 设置类 IPC 处理器
 * 职责：为“设置”抽屉提供主进程能力：
 *   - 目录选择对话框（默认输出目录、临时目录等）
 *   - 开机自启读写（写入系统登录项）
 *   - 存储统计（工具 bin 目录占用）与临时文件清理
 *   - 用户数据目录信息
 * 注：工具组件探测已迁移至通用模块 electron/main/tools/，IPC 见 ipc/tools.ts。
 */
import { ipcMain, app, dialog, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getBinRootPath } from '../main/ffmpeg/paths'
import { getDataDir, isUsingCustomDataDir, getAppBaseDir } from '../main/dataDir'
import { startupCache } from '../main/cache'
import { info as logInfo, warn as logWarn } from '../main/logger'

/**
 * 计算并确保默认日志目录存在并返回。
 * 生产环境：文档目录下的 YuneeToolkit/log；开发环境：项目根目录/log。
 */
export function getDefaultLogDir(): string {
  const baseDir = app.isPackaged
    ? path.join(app.getPath('documents'), 'YuneeToolkit')
    : app.getAppPath()
  const logDir = path.join(baseDir, 'log')
  try {
    fs.mkdirSync(logDir, { recursive: true })
  } catch {
    // 创建失败（如目录只读）则仍返回路径，交由上层兜底
  }
  return logDir
}

/**
 * 异步递归统计目录占用字节数（用于“存储”概览与启动预加载），不阻塞主进程。
 * 性能与健壮性：
 *   - 目录内条目并发统计（并发上限 32），显著加速海量小文件目录（如 node_modules）；
 *   - 跳过符号链接，避免递归进 pnpm 的 node_modules/.pnpm store 或遇到循环链；
 *   - 深度超过 32 层即停止，防止 Windows 目录 junction 造成无限递归；
 *   - 单个条目的读取/stat 失败不会中断整体统计，跳过继续。
 */
export async function dirSizeAsync(dir: string, depth = 0): Promise<number> {
  if (depth > 32) return 0
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    // 目录不存在或无权限读取时返回 0
    return 0
  }
  let index = 0
  // 并发窗口：每个 worker 依次取一个条目统计，限制同时进行的文件操作数量
  const workers = Math.min(32, entries.length)
  const runWorker = async (): Promise<number> => {
    // 关键：每个 worker 用【独立】子计数累积（subtotal），最后统一求和。
    // 切勿改为多个 worker 直接共享 total——并发下 `total += await …` 会因
    // 各 worker 读到旧值后互相覆盖（丢失写入）导致结果严重偏小（实测 -99%）。
    let subtotal = 0
    for (;;) {
      const i = index++
      if (i >= entries.length) return subtotal
      const entry = entries[i]
      const full = path.join(dir, entry.name)
      try {
        if (entry.isSymbolicLink()) continue // 跳过符号链接
        if (entry.isDirectory()) subtotal += await dirSizeAsync(full, depth + 1)
        else if (entry.isFile()) subtotal += (await fs.promises.stat(full)).size
      } catch {
        // 忽略单条目错误，继续统计其余
      }
    }
  }
  // 汇总各 worker 的子计数：worker 本地累积天然无并发写竞争，结果精确
  const subtotals = await Promise.all(Array.from({ length: workers }, () => runWorker()))
  return subtotals.reduce((a, b) => a + b, 0)
}

/**
 * 是否为受保护的目录根：盘符根目录或系统关键目录。
 * “清理临时文件”校验用，避免误删系统目录内容。
 */
function isProtectedDir(abs: string): boolean {
  const root = path.parse(abs).root
  if (abs.toLowerCase() === root.toLowerCase()) return true
  const candidates = [
    process.env.WINDIR,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    os.homedir(),
    os.tmpdir(),
  ].filter((d): d is string => typeof d === 'string' && d.length > 0)
  return candidates.some((d) => abs.toLowerCase() === path.resolve(d).toLowerCase())
}

/**
 * 判断 child 路径是否位于 parent 目录内部（用于“软件本身”扣除重叠占用）。
 * 允许嵌套：bin / 默认输出目录都可能在应用目录内部；外部目录（如文档/自定义）
 * 不在应用总量内，不应参与扣除，否则会让“软件本身”被多扣成 0。
 */
function isPathInside(child: string, parent: string): boolean {
  try {
    const rel = path.relative(path.resolve(parent), path.resolve(child))
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
  } catch {
    return false
  }
}

/**
 * 注册设置相关 IPC 处理器
 */
export function registerSettingsIpc(): void {
  // 返回默认输出/临时目录，并在不存在时自动创建
  ipcMain.handle('app:get-default-dirs', () => {
    // 开发环境：以项目根目录为基底（app.getAppPath() 即项目根），便于开发测试；
    // 生产环境：安装目录（如 Program Files）通常无写权限，改用“文档”目录下的应用子目录，
    // installDir 仍返回安装目录，仅作为“软件本身”占用/路径展示使用。
    const installDir = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
    const baseDir = app.isPackaged
      ? path.join(app.getPath('documents'), 'YuneeToolkit')
      : app.getAppPath()
    const outputDir = path.join(baseDir, 'output')
    const tempDir = path.join(baseDir, 'tempfiles')
    const logDir = getDefaultLogDir()
    try {
      fs.mkdirSync(outputDir, { recursive: true })
      fs.mkdirSync(tempDir, { recursive: true })
      fs.mkdirSync(logDir, { recursive: true })
    } catch {
      // 创建失败（如目录只读）则仍返回路径，交由上层兜底
    }
    return { installDir, outputDir, tempDir, logDir }
  })

  // 目录选择对话框：返回选中目录，取消返回 null
  // 通过触发本次调用的 event.sender 反查所属 BrowserWindow，作为对话框父窗口
  ipcMain.handle('dialog:select-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      title: '选择目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    const picked = res.canceled || !res.filePaths.length ? null : res.filePaths[0]
    logInfo('ipc', `目录选择${picked ? `：${picked}` : '已取消'}`)
    return picked
  })

  // 返回“用户数据目录”及其是否使用自定义（项目内）位置
  ipcMain.handle('app:get-data-dir', () => ({
    path: getDataDir(),
    isCustom: isUsingCustomDataDir(),
  }))

  // 在系统文件管理器中打开指定目录；路径非法或不存在时返回 false
  ipcMain.handle('app:open-directory', async (_e, dir: unknown) => {
    if (typeof dir !== 'string' || !dir.trim() || !fs.existsSync(dir)) return false
    try {
      const err = await shell.openPath(dir)
      if (!err) logInfo('ipc', `在资源管理器中打开目录: ${dir}`)
      return err ? false : true
    } catch {
      return false
    }
  })

  // 读取开机自启状态
  ipcMain.handle('app:get-autostart', () => app.getLoginItemSettings().openAtLogin)

  // 设置开机自启
  ipcMain.handle('app:set-autostart', (_e, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return false
    app.setLoginItemSettings({ openAtLogin: enabled })
    logInfo('ipc', `开机自启已${enabled ? '开启' : '关闭'}`)
    return true
  })

  // 返回工具总目录（bin 根目录）及其占用字节数；优先使用启动预加载缓存
  ipcMain.handle('storage:get-ffmpeg-stat', async () => {
    const dir = getBinRootPath()
    const sizeBytes = startupCache.toolsSize ?? (await dirSizeAsync(dir))
    return { path: dir, sizeBytes }
  })

  // 返回“存储”饼图所需的三块占用：软件本身 / 工具目录 / 输出目录
  // 输出目录由渲染进程传入（对应设置“默认输出目录”）；软件本身 = 应用基底目录总量
  // 减去其中与工具/输出重叠的部分（重叠才扣），使三块独立不重复、且不会因外部目录被多扣成 0。
  // 开发环境的应用基底即整个项目根目录，数据含义与开发时见到的文件一致，并非刻意缩水。
  // 性能：应用基底/工具目录占用优先读启动预加载缓存（省去最慢的遍历），输出目录现场统计；
  //       force=true（用户点“刷新”）时三块全部重算并回写缓存。
  ipcMain.handle('storage:get-space-stat', async (_e, outputDir: unknown, forceRefresh: unknown) => {
    const outputPath = typeof outputDir === 'string' ? outputDir : ''
    const toolsDir = getBinRootPath()
    const appBase = getAppBaseDir()
    const force = forceRefresh === true
    if (
      !force &&
      startupCache.appTotalSize !== null &&
      startupCache.toolsSize !== null
    ) {
      const outputSize = await dirSizeAsync(outputPath)
      const outputOverlap = isPathInside(outputPath, appBase) ? outputSize : 0
      const appSize = Math.max(0, startupCache.appTotalSize - startupCache.toolsSize - outputOverlap)
      return { appSize, toolsSize: startupCache.toolsSize, outputSize }
    }
    const [appTotal, toolsSize, outputSize] = await Promise.all([
      dirSizeAsync(appBase),
      dirSizeAsync(toolsDir),
      dirSizeAsync(outputPath),
    ])
    startupCache.appTotalSize = appTotal
    startupCache.toolsSize = toolsSize
    const outputOverlap = isPathInside(outputPath, appBase) ? outputSize : 0
    const appSize = Math.max(0, appTotal - toolsSize - outputOverlap)
    return { appSize, toolsSize, outputSize }
  })

  // 清理指定临时目录（用于“存储 > 立即清理”）
  // 安全校验：仅允许清理「存在且非系统目录」的目录内容，防止误删任意路径。
  ipcMain.handle('storage:clean-temp', async (_e, tempDir: unknown) => {
    if (typeof tempDir !== 'string' || !tempDir.trim()) return false
    const abs = path.resolve(tempDir.trim())
    let st: fs.Stats
    try {
      st = fs.statSync(abs)
    } catch {
      return false
    }
    if (!st.isDirectory() || isProtectedDir(abs)) {
      logWarn('ipc', `拒绝清理受保护目录: ${abs}`)
      return false
    }
    try {
      const entries = await fs.promises.readdir(abs)
      await Promise.all(
        entries.map((name) =>
          fs.promises
            .rm(path.join(abs, name), { recursive: true, force: true })
            .catch(() => {
              // 单条目清理失败不中断整体清理
            }),
        ),
      )
      logInfo('ipc', `已清理临时目录（${entries.length} 个条目）: ${abs}`)
    } catch {
      return false
    }
    return true
  })
}