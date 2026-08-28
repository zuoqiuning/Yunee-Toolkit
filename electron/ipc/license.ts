/**
 * IPC 处理器：开源协议文本读取 license.ts
 * 职责：安全地读取项目根 licenses 目录下指定开源项目的协议文本，供“关于”界面弹窗展示。
 * 安全：仅允许向已登记的开源项目映射到固定文件名，杜绝任意路径读取（路径穿越防护）。
 * 说明：licenses 目录位于项目根（开发环境 app.getAppPath() 即项目根）；
 *       打包时需将 licenses 一并打入应用资源，后续打包配置需跟随验证。
 */
import { ipcMain, app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { info as logInfo, warn as logWarn } from '../main/logger'

/**
 * 开源项目标识 → 协议文件名映射（不含目录，仅固定文件名）。
 * 后续新增依赖的开源组件时，把协议 txt 放进 licenses 目录并在此登记一行即可。
 */
const LICENSE_FILES: Record<string, string> = {
  ffmpeg: 'FFmpeg-LGPLv2.1.txt',
}

/** 注册协议读取相关 IPC 处理器 */
export function registerLicenseIpc(): void {
  // 读取指定开源项目的协议文本；未登记的项目返回 null（前端展示友好提示）
  ipcMain.handle('license:get', async (_e, key: unknown) => {
    const name = typeof key === 'string' ? key.trim().toLowerCase() : ''
    const file = LICENSE_FILES[name]
    if (!file) return null

    try {
      const dir = normalize(join(app.getAppPath(), 'licenses'))
      const target = normalize(join(dir, file))
      // 路径穿越防护：最终路径必须仍位于 licenses 目录内
      if (!target.startsWith(dir)) {
        logWarn('license', `拒绝读取 licenses 目录之外的路径：${file}`)
        return null
      }
      const text = await readFile(target, 'utf-8')
      logInfo('license', `读取开源协议成功：${file}`)
      return text
    } catch (err) {
      logWarn('license', `读取开源协议失败：${file}（${(err as Error).message}）`)
      return null
    }
  })
}