/**
 * 输出路径解析 output.ts
 * 职责：根据输入文件、目标格式、命名预设与输出目录，计算输出文件绝对路径，
 *       并按「文件重名策略」决定最终路径（自动改名 / 覆盖 / 询问时交由界面决策）。
 *
 * 设计说明：
 *   - 命名预设：keep（保持原文件名）/ time-suffix（追加时间戳）/ time-prefix（前置时间戳）；
 *   - 自动改名：目标已存在则追加「 (1)」「 (2)」直至不冲突；
 *   - 输出目录为空时与源文件同目录；
 *   - 本模块运行于主进程（可访问文件系统），渲染进程仅做展示与策略选择。
 */
import path from 'node:path'
import fs from 'node:fs'

/** 输出文件命名预设（与设置面板保持一致） */
export type FileNamePreset = 'keep' | 'time-suffix' | 'time-prefix'

/** 时间戳：YYYYMMDD-HHmmss（取自转换发起时刻） */
export function formatTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** 按命名预设给「不含扩展名」的文件名加时间戳 */
function applyPreset(base: string, preset: FileNamePreset, ts: string): string {
  if (preset === 'time-suffix') return `${base}_${ts}`
  if (preset === 'time-prefix') return `${ts}_${base}`
  return base
}

/** 输出路径解析结果（供界面预览 / 重名决策） */
export interface ResolveOutputResult {
  /** 直接输出路径（已应用命名预设，未去重） */
  path: string
  /** 自动改名后的不冲突路径（无冲突时等于 path） */
  uniquePath: string
  /** 直接路径是否已存在（供“每次询问”策略在界面弹窗） */
  exists: boolean
}

/**
 * 解析输出路径。
 * @param input 输入文件绝对路径
 * @param format 目标格式（扩展名，如 mp4；将统一去除前导点、转小写）
 * @param opts 命名预设 / 输出目录（目录为空时与源文件同目录）
 */
export function resolveOutputPath(
  input: string,
  format: string,
  opts: { preset?: FileNamePreset; outputDir?: string } = {},
): ResolveOutputResult {
  // 格式清洗：去除非法字符，兜底 mp4
  const ext = format.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8) || 'mp4'
  const dir = opts.outputDir && opts.outputDir.trim() ? opts.outputDir.trim() : path.dirname(input)
  const base = path.basename(input, path.extname(input))
  const preset = opts.preset ?? 'keep'
  const ts = formatTimestamp()
  const fileName = `${applyPreset(base, preset, ts)}.${ext}`
  const out = path.join(dir, fileName)

  // 自动改名：追加「 (1)」「 (2)」直到不冲突
  let unique = out
  let i = 1
  while (fs.existsSync(unique)) {
    unique = path.join(dir, `${applyPreset(base, preset, ts)} (${i}).${ext}`)
    i++
  }
  return { path: out, uniquePath: unique, exists: fs.existsSync(out) }
}
