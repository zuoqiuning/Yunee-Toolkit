/**
 * 用户主题持久化（userTheme.ts）
 * 职责：在“用户数据目录”下落盘用户的主题设置（手动主题 + 是否跟随系统），
 *       供启动阶段（Splash 加载窗口、主窗口背景色）读取，
 *       使这些启动窗口与用户在软件内选择的颜色系统保持一致。
 *
 * 说明：
 *   - 渲染进程在启动及主题变更时通过 IPC（settings:sync-user-theme）写入本文件；
 *   - 主进程启动时渲染层尚未加载，通过本模块读取文件确定窗口底色，
 *     避免“先系统配色、后用户配色”导致的首帧闪烁。
 */
import fs from 'node:fs'
import path from 'node:path'
import { getDataDir } from './dataDir'

/** 用户主题设置结构 */
export interface UserTheme {
  /** 手动选择的主题 */
  theme: 'light' | 'dark'
  /** 是否跟随系统深浅色（开启后以系统偏好为准） */
  themeFollowSystem: boolean
}

/** 主题设置持久化文件名 */
const THEME_FILE = 'theme.json'

/** 主题配置文件绝对路径 */
function themeFilePath(): string {
  return path.join(getDataDir(), THEME_FILE)
}

/**
 * 写入用户主题设置（渲染进程启动 / 主题变更时调用，供下次启动使用）。
 * 写入失败静默处理，不影响主流程；缺失时由读取方回退系统主题。
 */
export function writeUserTheme(theme: UserTheme): void {
  try {
    fs.writeFileSync(themeFilePath(), JSON.stringify(theme), 'utf-8')
  } catch {
    // 写入失败（如目录只读）则跳过
  }
}

/**
 * 读取用户主题设置；无记录或解析失败返回 null（由调用方回退系统主题）。
 */
export function readUserTheme(): UserTheme | null {
  try {
    const raw = fs.readFileSync(themeFilePath(), 'utf-8')
    const cfg = JSON.parse(raw) as Partial<UserTheme>
    return {
      theme: cfg.theme === 'dark' ? 'dark' : 'light',
      themeFollowSystem: cfg.themeFollowSystem === true,
    }
  } catch {
    return null
  }
}
