/**
 * 显卡检测 hardware.ts
 * 职责：跨平台检测用户电脑的显卡列表（品牌 + 型号），并推导“最优加速品牌”推荐。
 *
 * 平台实现（全部走系统自带命令，无任何第三方依赖）：
 *   - Windows：PowerShell 的 Win32_VideoController（WMI）；
 *   - macOS：system_profiler SPDisplaysDataType；
 *   - Linux：lspci 中的 VGA/3D 控制器描述。
 * 任一平台检测失败都静默降级为空列表，不影响软件正常使用。
 *
 * 结果清洗规则（核心逻辑）：
 *   - 过滤虚拟显卡驱动（如向日葵的 AskLink/OrayIddDriver、远程桌面、虚拟机显卡等）与品牌未知的显卡，
 *     只保留真实物理显卡，避免“未知”条目干扰加速方案自动选择；
 *   - 同型号显卡合并并计数：多 GPU 交火（CrossFire / SLI）或系统重复枚举同一张卡时，
 *     合并为一行并按数量标记（×N）；不同型号（如核显 + 独显）则全部保留。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** 显卡品牌（与渲染进程性能面板的加速方案互斥逻辑对应） */
export type GpuBrand = 'nvidia' | 'amd' | 'intel' | 'unknown'

/** 单张显卡信息 */
export interface GpuInfo {
  /** 推导出的品牌 */
  brand: GpuBrand
  /** 系统报告的显卡名称（型号） */
  name: string
  /** 同型号显卡数量（交火 / 重复枚举合并后：1 或 N） */
  count: number
}

/**
 * 已知虚拟显卡 / 占位驱动名称关键词（小写匹配）。
 * 命中任一关键词即视为“非真实物理显卡”，检测时直接剔除：
 *   - 向日葵/ToDesk 等远控软件的虚拟显卡：AskLinkIddDriver、OrayIddDriver；
 *   - 未安装驱动的系统占位：Microsoft Basic Display Adapter；
 *   - 远程桌面虚拟显示器：Microsoft Remote Display Adapter、RDPUDD；
 *   - 虚拟机显卡：VMware、VirtualBox、QEMU(QXL)、Parallels 半虚拟化显卡。
 */
const VIRTUAL_GPU_KEYWORDS = [
  'asklinkiddriver',
  'orayiddriver',
  'sunflower',
  'microsoft basic display adapter',
  'microsoft remote display adapter',
  'rdpudd',
  'vmware svga',
  'virtualbox',
  'qxl',
  'paravirtual',
]

/** 判断是否为虚拟显卡 / 占位驱动（命中关键词即视为虚拟） */
function isVirtualGpu(name: string): boolean {
  const n = name.toLowerCase()
  return VIRTUAL_GPU_KEYWORDS.some((k) => n.includes(k))
}

/** 生成“型号唯一键”：小写 + 去空白 + 忽略 (Secondary)/(Primary) 占位后缀 */
function modelKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\((?:secondary|primary)\)/g, '')
    .replace(/\s+/g, '')
}

/** 根据显卡名称匹配品牌（按关键词逐一判定） */
function brandOf(name: string): GpuBrand {
  const n = name.toLowerCase()
  if (/nvidia|geforce|rtx|gtx|quadro|tesla/.test(n)) return 'nvidia'
  if (/amd|radeon|firepro|\bati\b/.test(n)) return 'amd'
  if (/intel|uhd graphics|iris|hd graphics/.test(n)) return 'intel'
  return 'unknown'
}

/**
 * 统一清洗显卡列表（对所有平台生效）：
 * 1) 剔除虚拟显卡驱动与品牌未知的显卡（界面只显示真实物理显卡）；
 * 2) 同型号合并并计数：交火多卡 / 重复枚举 → 单行 ×N，不同型号全部保留。
 */
function cleanGpus(gpus: { name: string; brand: GpuBrand }[]): GpuInfo[] {
  const seen = new Map<string, GpuInfo>()
  for (const g of gpus) {
    if (isVirtualGpu(g.name)) continue
    if (g.brand === 'unknown') continue
    const key = modelKey(g.name)
    const exist = seen.get(key)
    if (exist) {
      // 同型号再次出现：计数 +1（交火多卡 / 系统重复枚举）
      exist.count += 1
      continue
    }
    seen.set(key, { name: g.name, brand: g.brand, count: 1 })
  }
  return [...seen.values()]
}

/**
 * 解析显卡名称列表（PowerShell / 系统命令输出）：
 * 兼容 JSON 数组、单个 JSON 字符串以及纯文本行三种输出形态，最后统一清洗。
 */
function parseNames(raw: string): GpuInfo[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  let names: string[] = []
  try {
    const parsed = JSON.parse(trimmed) as string | string[]
    names = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    // 非 JSON 输出（如竖杠分隔的文本）：按行拆分
    names = trimmed
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  // 先映射为 GpuInfo，再统一清洗（过滤虚拟驱动 + 同型号合并）
  return cleanGpus(
    names
      .filter(Boolean)
      .map((name) => ({ name, brand: brandOf(name) })),
  )
}

/** Windows：通过 WMI 查询全部显卡控制器名称 */
async function detectWindows(): Promise<GpuInfo[]> {
  // @(...) 强制输出为数组，避免单显卡时输出裸字符串导致解析歧义
  const script =
    '@(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) | ConvertTo-Json -Compress'
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], { windowsHide: true, timeout: 8000 })
  return parseNames(stdout)
}

/** macOS：通过 system_profiler 查询显卡信息 */
async function detectMac(): Promise<GpuInfo[]> {
  const { stdout } = await execFileAsync('system_profiler', ['SPDisplaysDataType', '-json'], {
    timeout: 8000,
  })
  const parsed = JSON.parse(stdout) as { SPDisplaysDataType?: Array<{ _name?: string; spdisplays_vendor?: string }> }
  const list = parsed.SPDisplaysDataType ?? []
  // vendor 字段直接就是 "NVIDIA"/"AMD"/"Intel" 等品牌名，交给 brandOf 再次归一化
  return list.map((d) => ({
    name: d._name ?? 'GPU',
    brand: brandOf(d.spdisplays_vendor ?? ''),
  }))
}

/** Linux：通过 lspci 解析 VGA / 3D 控制器 */
async function detectLinux(): Promise<GpuInfo[]> {
  const { stdout } = await execFileAsync('lspci', ['-mm'], { timeout: 5000 })
  // -mm 格式：每行引号包裹的字段，取 "... VGA compatible controller ..." / "3D controller" 行
  const names = stdout
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/"([^"]*)"\s+"([^"]*)"\s+"([^"]*)"/)
      if (!m) return ''
      const [, kind, vendor, device] = m
      const isGpu = /VGA|3D controller/i.test(kind)
      return isGpu ? `${vendor} ${device}`.trim() : ''
    })
    .filter(Boolean)
  return parseNames(names.join('\n'))
}

/**
 * 检测本机显卡列表；平台未知或命令缺失时返回空数组（不抛错）。
 * 出口统一再清洗一次，保证所有平台（含 macOS 对象形式）都过滤虚拟驱动并合并同型号。
 */
export async function detectGpu(): Promise<GpuInfo[]> {
  try {
    if (process.platform === 'win32') return cleanGpus(await detectWindows())
    if (process.platform === 'darwin') return cleanGpus(await detectMac())
    if (process.platform === 'linux') return cleanGpus(await detectLinux())
  } catch {
    // 检测失败（命令不存在 / 超时等）静默降级
  }
  return []
}

/**
 * 从显卡列表推导“最优加速品牌”：优先独立显卡（NVIDIA > AMD > Intel），
 * 只有核显或全部未知时为 unknown。
 */
export function bestBrand(gpus: GpuInfo[]): GpuBrand {
  const has = (b: GpuBrand) => gpus.some((g) => g.brand === b)
  if (has('nvidia')) return 'nvidia'
  if (has('amd')) return 'amd'
  if (has('intel')) return 'intel'
  return 'unknown'
}

/** 一次调用同时返回显卡列表与推荐品牌（供启动预加载 / IPC 使用） */
export async function detectGpuWithBest(): Promise<{ gpus: GpuInfo[]; best: GpuBrand }> {
  const gpus = await detectGpu()
  return { gpus, best: bestBrand(gpus) }
}