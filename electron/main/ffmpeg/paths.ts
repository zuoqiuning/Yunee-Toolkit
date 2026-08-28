/**
 * FFmpeg 可执行文件路径管理
 * 职责：统一提供 ffmpeg / ffplay / ffprobe 三个程序在开发与生产环境下的绝对路径。
 *
 * 路径规则：
 *   - 开发环境：项目根目录 bin/FFmpeg/
 *   - 生产环境：resources/app.asar.unpacked/bin/FFmpeg/
 *     （electron-builder 已通过 asarUnpack 将 bin 解包到该目录）
 */
import path from 'node:path'
import { app } from 'electron'

/**
 * 定位 bin 目录
 * 生产环境 FFmpeg 被 asarUnpack 解包到 resources/app.asar.unpacked/bin，故使用该路径。
 */
function getBinDir(): string {
  if (process.env.NODE_ENV === 'development') {
    // 开发环境：从应用根目录读取 bin
    return path.join(app.getAppPath(), 'bin', 'FFmpeg')
  }
  // 生产环境：解包后的资源目录
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'FFmpeg')
}

/**
 * 获取 ffmpeg 可执行文件完整路径
 */
export function getFfmpegPath(): string {
  return path.join(getBinDir(), 'ffmpeg.exe')
}

/**
 * 获取 ffplay 可执行文件完整路径（预览播放）
 */
export function getFfplayPath(): string {
  return path.join(getBinDir(), 'ffplay.exe')
}

/**
 * 获取 ffprobe 可执行文件完整路径（媒体信息分析）
 */
export function getFfprobePath(): string {
  return path.join(getBinDir(), 'ffprobe.exe')
}

/**
 * 获取整套工具所在的 bin 目录路径（供界面显示/调试）
 * 注意：此目录专用于 ffmpeg，后续新增的其他工具会各自独立文件夹。
 */
export function getBinDirPath(): string {
  return getBinDir()
}

/**
 * 获取“工具总目录”（bin 根目录，可容纳多个工具文件夹，如 FFmpeg、后续新增工具）
 * 用于“存储”饼图中统计全部工具占用的目录。
 * 实现已迁移至通用工具模块 electron/main/tools/paths.ts，此处仅转发保持调用方兼容。
 */
export { getToolsRootPath as getBinRootPath } from '../tools/paths'