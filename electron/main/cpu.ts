/**
 * CPU 检测 cpu.ts
 * 职责：跨平台检测 CPU 型号、物理核心数与逻辑核心数（线程数），
 *       供性能设置面板限制“编码线程数”输入上限并展示本机 CPU 信息。
 *
 * 实现说明：
 *   - 型号/线程数优先走 Node 自带 os.cpus()（零开销、全平台可用）；
 *   - 物理核心数按平台查询系统命令，失败时静默回退为逻辑核数，不影响主流程：
 *       Windows：PowerShell 的 Win32_Processor（NumberOfCores 支持多路 CPU 求和）；
 *       macOS：sysctl hw.physicalcpu；
 *       Linux：lscpu 的 Socket(s) × Core(s) per socket 乘积。
 */
import { execFile } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** 本机 CPU 信息 */
export interface CpuInfo {
  /** CPU 型号（尽量去掉无意义后缀，形如 “Intel(R) Core(TM) i7-12700H @ 2.70GHz”） */
  model: string
  /** 物理核心数 */
  physicalCores: number
  /** 逻辑核心数（线程数） */
  logicalCores: number
}

/** Windows：查询各物理 CPU 的核心数（多路 CPU 求和） */
async function physicalCoresWindows(): Promise<number> {
  const script =
    '(@(Get-CimInstance Win32_Processor | ForEach-Object { $_.NumberOfCores }) | Measure-Object -Sum).Sum'
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], { windowsHide: true, timeout: 8000 })
  const sum = Number(stdout.trim())
  if (!Number.isFinite(sum) || sum <= 0) throw new Error('invalid physical core count')
  return sum
}

/** macOS：通过 sysctl 查询物理核心数 */
async function physicalCoresMac(): Promise<number> {
  const { stdout } = await execFileAsync('sysctl', ['-n', 'hw.physicalcpu'], { timeout: 5000 })
  const n = Number(stdout.trim())
  if (!Number.isFinite(n) || n <= 0) throw new Error('invalid physical core count')
  return n
}

/** Linux：解析 lscpu 的 “Socket(s)” 与 “Core(s) per socket” 乘积 */
async function physicalCoresLinux(): Promise<number> {
  const { stdout } = await execFileAsync('lscpu', [], { timeout: 5000 })
  const socket = Number(stdout.match(/Socket\(s\):\s*(\d+)/)?.[1] ?? NaN)
  const corePerSocket = Number(stdout.match(/Core\(s\) per socket:\s*(\d+)/)?.[1] ?? NaN)
  const total = socket * corePerSocket
  if (!Number.isFinite(total) || total <= 0) throw new Error('invalid physical core count')
  return total
}

/** 探测物理核心数（按平台分发；任一失败抛错，由调用方降级） */
async function detectPhysicalCores(): Promise<number> {
  if (process.platform === 'win32') return physicalCoresWindows()
  if (process.platform === 'darwin') return physicalCoresMac()
  return physicalCoresLinux()
}

/**
 * 检测本机 CPU 信息（不抛错，失败时回退为 os.cpus() 可得的逻辑核数）。
 */
export async function detectCpu(): Promise<CpuInfo> {
  // 逻辑核数 = os.cpus() 长度；模型优先取首个逻辑核（避免多核重复，后面的全部同型号）
  const cpus = os.cpus()
  const logicalCores = cpus.length
  const model = (cpus[0]?.model ?? 'CPU').replace(/\s+@.*$/, '').trim() || 'CPU'

  // 物理核心数按平台查询；失败回退逻辑核数（限制上限时不会低估）
  let physicalCores = logicalCores
  try {
    physicalCores = await detectPhysicalCores()
  } catch {
    // 命令缺失 / 超时 / 解析失败：回退逻辑核数，仅影响“物理核”展示精度
  }

  return { model, physicalCores, logicalCores }
}