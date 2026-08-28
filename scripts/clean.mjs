/**
 * 清理构建产物脚本（跨平台可用）
 * 作用：在正式打包前清空 dist / dist-electron / release 目录，避免残留文件。
 */
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const targets = ['dist', 'dist-electron', 'release']

for (const dir of targets) {
  rmSync(resolve(process.cwd(), dir), { recursive: true, force: true })
  console.log(`[clean] 已清空目录: ${dir}`)
}