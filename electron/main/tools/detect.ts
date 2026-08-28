/**
 * 工具探测模块：核心探测逻辑 detect.ts
 * 职责：
 *   - 【自动发现】扫描 bin 根目录下的子目录，动态构建全部工具定义；
 *   - 对每个已发现工具并发执行“存在性 + 版本”探测。
 *
 * 设计说明（目录即工具）：
 *   - 工具本体 = bin 根目录下的一个子目录（如 FFmpeg）；
 *   - 已登记规范（registry.ts）的目录：按其组件清单探测（可定制显示名 / 探测参数）；
 *   - 未登记的目录：自动识别，目录名作为工具名，目录下全部 .exe 文件作为组件；
 *   - 新增工具只需把文件夹放进 bin，必要时在 registry.ts 追加规范即可。
 *
 * 性能与健壮性：
 *   - 每个可执行组件独立启动进程探测，各组件之间并发执行；
 *   - windowsHide 隐藏控制台窗口，timeout 防止损坏文件长时间卡死；
 *   - 任一组件探测失败仅置 version=null，不影响其余组件与整体结果；
 *   - bin 目录缺失 / 无权限读取时返回空列表，不会抛出异常。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getToolsRootPath, getToolDirPath } from './paths'
import { findToolSpec, TOOL_SPECS } from './registry'
import type { ToolDef, ToolExecutableDef, ToolExecutableInfo, ToolProbeResult } from './types'

const execFileP = promisify(execFile)

/** 从 -version 输出首行中提取纯净版本号，忽略其后跟随的英文/构建描述 */
function extractVersion(firstLine: string): string | null {
  if (!firstLine) return null
  // 兼容常见构建格式：ffmpeg version 6.1.1-full_build-... / n5.1.4 / 4.4-essentials_build
  // 优先取“version/ffprobe version”之后的数字段；找不到则取首个 x.y(.z) 版本段
  const afterKeyword = firstLine.match(/version\s+(\d+\.\d+(?:\.\d+)?)/i)
  if (afterKeyword) return afterKeyword[1]
  const anyVersion = firstLine.match(/(\d+\.\d+(?:\.\d+)?)/)
  return anyVersion ? anyVersion[1] : null
}

/**
 * 自动枚举目录下的 .exe 文件作为组件定义（用于未登记工具）。
 * 生成规则：文件名去扩展名 → 小写作 key、原样作显示名、完整文件名用于探测。
 */
function autoBuildExecutables(dirPath: string): ToolExecutableDef[] {
  let files: fs.Dirent[] = []
  try {
    files = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.exe$/i.test(e.name))
  } catch {
    return [] // 目录缺失或无权限：视为无组件
  }
  return files
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => {
      const base = path.basename(f.name, path.extname(f.name))
      return { key: base.toLowerCase(), label: base, filename: f.name }
    })
}

/**
 * 扫描 bin 根目录，动态构建全部工具定义。
 * 顺序：已登记规范的工具按注册表顺序输出，未登记的按目录名排序追加。
 */
export function discoverToolDefs(): ToolDef[] {
  const root = getToolsRootPath()
  let dirNames: string[] = []
  try {
    dirNames = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return [] // bin 目录缺失 / 无权限：视为无工具
  }

  const tools: ToolDef[] = []
  // 第一遍：按注册表顺序输出“已登记规范”的工具（目录存在才输出）
  for (const spec of TOOL_SPECS) {
    if (dirNames.some((n) => n.toLowerCase() === spec.dir.toLowerCase())) {
      tools.push({ id: spec.dir, label: spec.label, dir: spec.dir, executables: spec.executables })
    }
  }
  // 第二遍：未登记的目录自动识别（目录名作工具名，目录下 .exe 作组件）
  for (const name of dirNames.sort((a, b) => a.localeCompare(b))) {
    if (findToolSpec(name)) continue
    const executables = autoBuildExecutables(path.join(root, name))
    if (executables.length === 0) continue // 目录内无 .exe：无可探测组件，跳过
    tools.push({ id: name, label: name, dir: name, executables })
  }
  return tools
}

/** 探测单个可执行组件：先判存在，再执行版本命令；失败置 null */
async function probeExecutable(
  filePath: string,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout } = await execFileP(filePath, args, {
      windowsHide: true, // Windows 下不弹黑色控制台窗口
      timeout: 8000, // 损坏 / 卡死的可执行文件 8 秒后放弃
    })
    const firstLine = (stdout.split(/\r?\n/)[0] ?? '').trim()
    return extractVersion(firstLine)
  } catch {
    return null
  }
}

/** 探测单个工具的目录与组件信息 */
async function probeTool(tool: ToolDef): Promise<ToolProbeResult> {
  const dirPath = getToolDirPath(tool)
  const executables: ToolExecutableInfo[] = await Promise.all(
    tool.executables.map(async (exe): Promise<ToolExecutableInfo> => {
      const filePath = path.join(dirPath, exe.filename)
      let exists = false
      try {
        exists = fs.existsSync(filePath)
      } catch {
        exists = false
      }
      const args = exe.versionArgs ?? ['-version']
      return {
        key: exe.key,
        label: exe.label,
        // 组件简介透传自登记规范；未登记（自动枚举）的组件无简介，渲染端隐藏该行
        desc: exe.desc ?? '',
        path: filePath,
        exists,
        version: exists ? await probeExecutable(filePath, args) : null,
      }
    }),
  )
  return { ...tool, dirPath, executables }
}

/** 探测全部已发现工具（目录即工具，工具之间并发执行） */
export async function probeTools(): Promise<ToolProbeResult[]> {
  return await Promise.all(discoverToolDefs().map(probeTool))
}

/** 已发现工具的展示摘要（如 “FFmpeg / Node”），供 Splash 等场景的文案使用 */
export function getToolsSummaryLabel(): string {
  const tools = discoverToolDefs()
  if (!tools.length) return '（无）'
  return tools.map((t) => t.label).join(' / ')
}