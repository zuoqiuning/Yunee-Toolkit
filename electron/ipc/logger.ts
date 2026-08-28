/**
 * 日志类 IPC 处理器 logger.ts
 * 职责：向渲染进程提供日志系统的全部主进程能力：
 *   - log:init    初始化/切换日志目录（渲染进程启动时上报自定义目录与清理规则）
 *   - log:event   接收渲染进程上报的用户操作并写入日志
 *   - log:clean   手动触发一次自动清理（用户点“立即清理”或修改规则后调用）
 *   - log:get-config 查询当前日志目录与清理规则（供设置面板展示）
 * 安全：全部入参做类型/范围校验，非法值回退默认，防越权与脏数据。
 */
import { ipcMain } from 'electron'
import path from 'node:path'
import {
  setLogDir,
  logUserEvent,
  cleanNow,
  getLogDir,
  getCleanRules,
  listLogFiles,
  readLogFile,
} from '../main/logger'
import { getDefaultLogDir } from './settings'

/** 数值钳制到合法区间，非法输入回退默认值 */
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback
}

/** 归一化日志目录：非空路径按工艺解析；空/非法视为“使用默认日志目录”（便于恢复默认后自动切回） */
function normalizeDir(dir: unknown): string {
  if (typeof dir === 'string' && dir.trim()) return path.resolve(dir.trim())
  return getDefaultLogDir()
}

/** 注册日志相关 IPC 处理器 */
export function registerLoggerIpc(): void {
  // 初始化/切换日志目录（渲染进程启动时调用，携带用户自定义目录与清理规则）
  ipcMain.handle('log:init', (_e, dir: unknown, retainDays: unknown, maxFiles: unknown) => {
    setLogDir(normalizeDir(dir), {
      retainDays: clampInt(retainDays, 7, 1, 365),
      maxFiles: clampInt(maxFiles, 50, 10, 1000),
    })
    return { dir: getLogDir(), ...getCleanRules() }
  })

  // 渲染进程上报用户操作（scope/action/message 统一转字符串，防注入脏类型）
  ipcMain.handle('log:event', (_e, scope: unknown, action: unknown, message: unknown) => {
    const safeScope = String(scope ?? 'renderer').slice(0, 40)
    const safeAction = String(action ?? '').slice(0, 40)
    logUserEvent(safeScope, safeAction, String(message ?? ''))
    return true
  })

  // 手动触发一次清理（修改规则或点击“立即清理”）；返回删除统计
  ipcMain.handle('log:clean', async (_e, retainDays: unknown, maxFiles: unknown) => {
    setLogDir(getLogDir(), {
      retainDays: clampInt(retainDays, 7, 1, 365),
      maxFiles: clampInt(maxFiles, 50, 10, 1000),
    })
    return cleanNow()
  })

  // 查询当前日志目录与清理规则
  ipcMain.handle('log:get-config', () => ({
    dir: getLogDir(),
    ...getCleanRules(),
  }))

  // 在线查看：列出日志目录下全部日志文件（按日期倒序）
  ipcMain.handle('log:list', () => listLogFiles())

  // 在线查看：读取指定日志文件内容（仅允许日期命名文件；非法/读取失败返回 null）
  ipcMain.handle('log:read', (_e, name: unknown) => {
    if (typeof name !== 'string') return null
    return readLogFile(name)
  })
}