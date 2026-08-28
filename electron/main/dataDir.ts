/**
 * 用户数据目录
 * 职责：统一解析“用户数据”存放位置，并提供开发环境重定向。
 *
 * 说明：
 *   - 生产环境：数据存于系统默认用户数据目录（Windows 即 C 盘用户目录）。
 *   - 开发环境：为方便调试/测试，重定向到项目根目录下的 data 文件夹，
 *     使 localStorage、各类参数设置等全部落在项目内，便于查看与清理。
 */
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

/** 是否为开发环境（由 cross-env 注入 NODE_ENV=development） */
const isDev = process.env.NODE_ENV === 'development'

/**
 * 计算并确保“用户数据目录”存在，返回其绝对路径。
 * 开发环境为 <项目根>/data，生产环境为系统默认 userData。
 */
export function getDataDir(): string {
  const base = isDev ? app.getAppPath() : app.getPath('userData')
  const dir = isDev ? path.join(base, 'data') : base
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // 目录创建失败（如只读）则仍返回路径，交由上层兜底
  }
  return dir
}

/**
 * 开发环境：把 Electron 的用户数据目录整体重定向到项目 data 文件夹。
 * 必须在 app ready 之前调用；生产环境保持系统默认位置，不重定向。
 */
export function redirectUserDataInDev(): void {
  if (isDev) {
    app.setPath('userData', getDataDir())
  }
}

/** 当前是否使用自定义（项目内）数据目录（即开发环境） */
export function isUsingCustomDataDir(): boolean {
  return isDev
}

/**
 * 应用安装根目录：开发环境为项目根（app.getAppPath()），生产环境为安装目录（exe 所在目录）。
 * 用于“存储”饼图统计“软件本身”占用。
 */
export function getAppBaseDir(): string {
  return isDev ? app.getAppPath() : path.dirname(app.getPath('exe'))
}