/**
 * 工具探测模块：类型定义 types.ts
 * 职责：定义“软件内置工具”的统一描述结构与探测结果结构。
 *
 * 设计说明：
 *   - 一个工具 = bin 根目录下的一个子目录（如 FFmpeg），由探测逻辑自动扫描发现；
 *   - 一个工具内含若干可执行组件（如 ffmpeg / ffprobe / ffplay）；
 *   - 已登记规范的工具按 registry.ts 定义探测，未登记的工具自动以目录下 .exe 枚举组件；
 *   - 后续新增工具只需把文件夹放进 bin，必要时在 registry.ts 追加规范即可。
 */

/** 单个可执行组件的静态描述（定义于注册表规范，或未登记工具自动枚举生成） */
export interface ToolExecutableDef {
  /** 组件关键字（如 'ffmpeg'），渲染端作 row-key */
  key: string
  /** 组件显示名（如 'FFmpeg'） */
  label: string
  /** 可执行文件名（如 'ffmpeg.exe'） */
  filename: string
  /** 组件简介（工具面板展开后展示，未登记工具自动给默认文案） */
  desc?: string
  /** 探测命令行参数（默认 ['-version']） */
  versionArgs?: string[]
}

/** 单个工具的静态描述（由 bin 目录扫描自动发现生成） */
export interface ToolDef {
  /** 工具唯一 id（对应 bin 子目录名，同时用作 Splash 任务 id） */
  id: string
  /** 工具显示名 */
  label: string
  /** 相对 bin 根目录的子目录名（如 'FFmpeg'） */
  dir: string
  /** 该工具包含的可执行组件列表 */
  executables: ToolExecutableDef[]
}

/** 单个可执行组件的探测结果 */
export interface ToolExecutableInfo {
  /** 组件关键字（透传自静态定义） */
  key: string
  /** 组件显示名 */
  label: string
  /** 组件简介（透传自静态定义；未登记组件为默认文案） */
  desc: string
  /** 可执行文件绝对路径 */
  path: string
  /** 文件是否存在 */
  exists: boolean
  /** 版本号（-version 首行解析），探测失败或缺失时为 null */
  version: string | null
}

/** 单个工具的探测结果 */
export interface ToolProbeResult extends ToolDef {
  /** 工具目录绝对路径 */
  dirPath: string
  /** 各可执行组件的探测结果 */
  executables: ToolExecutableInfo[]
}