/**
 * 工具探测模块：目录定位 paths.ts
 * 职责：统一计算 bin 根目录及各工具子目录的路径（开发 / 生产两种环境）。
 *
 * 路径规则：
 *   - 开发环境：项目根目录 bin/
 *   - 生产环境：resources/app.asar.unpacked/bin/（electron-builder 已 asarUnpack 解包）
 */
import path from 'node:path'
import { app } from 'electron'
import type { ToolDef } from './types'

/** 定位 bin 根目录（可容纳多个工具文件夹：FFmpeg、后续新增工具） */
function getToolsRootPath(): string {
  if (process.env.NODE_ENV === 'development') {
    return path.join(app.getAppPath(), 'bin')
  }
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'bin')
}

/** 计算某个工具的目录绝对路径（bin 根 + 工具子目录） */
export function getToolDirPath(tool: ToolDef): string {
  return path.join(getToolsRootPath(), tool.dir)
}

/** bin 根目录路径（供“存储”统计工具占用等场景使用） */
export { getToolsRootPath }