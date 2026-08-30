/**
 * 清理构建产物脚本（跨平台可用）
 * 作用：在正式打包前清空 dist / dist-electron / release 目录，避免残留文件。
 */
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const targets = ['dist', 'dist-electron', 'release']

for (const dir of targets) {
  const target = resolve(process.cwd(), dir)
  // 失败重试：Windows 下系统安全软件（如 Defender）可能临时锁定文件导致删除失败，
  // 设置重试次数与间隔，等待扫描完成后再删除，避免打包流程中断。
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    console.log(`[clean] 已清空目录: ${dir}`)
  } catch (err) {
    // 若仍删除失败，给用户明确提示，便于人工介入
    console.error(`[clean] 清空目录失败: ${dir}（可能被其他进程占用）`)
    throw err
  }
}