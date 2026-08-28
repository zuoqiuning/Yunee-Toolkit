/**
 * 工具探测模块：工具规范注册表 registry.ts
 * 职责：为 bin 目录下【自动发现】的工具提供补充规范（显示名 / 组件清单）。
 *
 * 设计说明：
 *   - 工具本体 = bin 根目录下的子目录，由探测逻辑动态扫描发现；
 *   - 已登记规范的工具按其组件清单探测（可指定组件显示名与探测参数）；
 *   - 未登记的工具自动识别：目录名作为工具名，目录下的 .exe 作为组件；
 *   - 新增工具只需把文件夹放进 bin，必要时在此追加规范即可。
 */
import type { ToolExecutableDef } from './types'

/** 单个工具的补充规范 */
export interface ToolSpec {
  /** 匹配 bin 下的目录名（不区分大小写） */
  dir: string
  /** 覆盖目录名的显示名 */
  label: string
  /** 组件清单：覆盖自动枚举（指定组件显示名 / 探测参数） */
  executables: ToolExecutableDef[]
}

/** 已登记的工具规范（可扩展：后续新增工具在此追加） */
export const TOOL_SPECS: ToolSpec[] = [
  {
    dir: 'FFmpeg',
    label: 'FFmpeg',
    executables: [
      {
        key: 'ffmpeg',
        label: 'FFmpeg',
        filename: 'ffmpeg.exe',
        desc: '音视频编解码核心引擎，支持格式转换、音频提取与多轨封装处理',
      },
      {
        key: 'ffprobe',
        label: 'FFprobe',
        filename: 'ffprobe.exe',
        desc: '媒体信息分析工具，可精准读取音视频流的编码、码率与时长等参数',
      },
      {
        key: 'ffplay',
        label: 'FFplay',
        filename: 'ffplay.exe',
        desc: 'FFmpeg 套件的轻量视频播放器，用于快速预览与检查媒体文件',
      },
    ],
  },
]

/** 按目录名查找补充规范（不区分大小写），未登记返回 undefined */
export function findToolSpec(dirName: string): ToolSpec | undefined {
  return TOOL_SPECS.find((s) => s.dir.toLowerCase() === dirName.toLowerCase())
}