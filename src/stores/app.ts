/**
 * 全局应用状态 Store
 * 职责：管理与应用整体相关的状态，如应用元信息、侧边栏折叠等。
 * 版本说明：界面统一展示测试版号「beta x.y.z」，以主进程真实版本（package.json）为数据源，
 *           纯浏览器预览等无主进程场景降级为默认的 beta 0.1.0。
 */
import { defineStore } from 'pinia'

/** 应用元信息 */
interface AppMeta {
  /** 应用中文名 */
  name: string
  /** 应用英文名 / 品牌名 */
  brand: string
  /** 展示版本号（统一为「beta x.y.z」测试版格式） */
  version: string
}

/**
 * 全局 Store
 */
export const useAppStore = defineStore('app', {
  state: () => ({
    /** 应用元信息 */
    meta: {
      name: '屿宁工具箱',
      brand: 'Yunee Toolkit',
      version: 'beta 0.1.0',
    } as AppMeta,

    /** 侧边栏是否折叠 */
    sidebarCollapsed: false,
  }),

  actions: {
    /** 切换侧边栏折叠状态 */
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },

    /** 应用启动时拉取主进程元信息（真实版本），统一组装为 beta 展示格式，静默降级 */
    async fetchAppMeta() {
      try {
        const version = await window.yuneeAPI?.getAppVersion()
        if (!version) return
        // getAppVersion 返回 package.json 的裸版本号（如 0.1.0），补上 beta 前缀便于统一展示
        this.meta.version = version.startsWith('beta') ? version : `beta ${version}`
      } catch {
        // Electron 环境下正常；浏览器调试时忽略
      }
    },
  },
})