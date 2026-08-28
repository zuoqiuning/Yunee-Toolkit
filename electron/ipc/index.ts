/**
 * IPC 处理器统一注册入口
 * 职责：汇总所有 IPC channel 的处理器，在应用就绪时一次性注册。
 * 后续新增功能模块时，只需在此 import 并调用对应的 register 函数。
 */
import { ipcMain, app } from 'electron'
import { getBinDirPath } from '../main/ffmpeg/paths'
import { registerWindowControls } from './window'
import { registerSettingsIpc } from './settings'
import { registerHardwareIpc } from './hardware'
import { registerCpuIpc } from './cpu'
import { registerToolsIpc } from './tools'
import { registerLoggerIpc } from './logger'
import { registerLicenseIpc } from './license'
import { registerConversionIpc } from './conversion'
import { registerUpdaterIpc } from './updater'

/**
 * 注册所有主进程 IPC 处理器
 */
export function registerIpcHandlers(): void {
  // 自绘标题栏的窗口控制
  registerWindowControls()

  // 设置相关：组件探测 / 目录选择 / 开机自启 / 存储统计
  registerSettingsIpc()

  // 硬件相关：显卡检测结果读取（启动阶段已预加载）
  registerHardwareIpc()

  // CPU 相关：CPU 检测结果读取（启动阶段已预加载）
  registerCpuIpc()

  // 工具相关：全部内置工具探测结果读取（启动阶段已预加载）
  registerToolsIpc()

  // 日志相关：目录切换 / 用户操作上报 / 手动清理
  registerLoggerIpc()

  // 开源协议相关：协议文本读取（“关于”界面查看协议弹窗）
  registerLicenseIpc()

  // 转换任务相关：任务入队 / 取消 / 查询 / 清理（进度与结果由队列事件推送）
  registerConversionIpc()

  // 自动更新相关：检查更新 / 重启安装（状态由 update:* 事件推送）
  registerUpdaterIpc()

  // 基础信息类：返回应用版本
  ipcMain.handle('app:get-version', () => app.getVersion())

  // 基础信息类：返回 FFmpeg 工具目录
  ipcMain.handle('ffmpeg:get-bin-path', () => getBinDirPath())

  // —— 后续在此统一注册各功能模块的 IPC 处理器 ——
  // registerVideoIpc()
  // registerAudioIpc()
  // registerConversionIpc()
}