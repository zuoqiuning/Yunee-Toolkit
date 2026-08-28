/**
 * 路由实例
 * 职责：创建并导出 Vue Router 实例，供应用挂载。
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from './routes'

/**
 * 使用 Hash 模式路由
 * 原因：Electron 生产环境以 file:// 加载本地文件，Hash 模式可避免页面历史路由刷新 404。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// 全局前置守卫：设置页面标题为对应模块名
router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · 屿宁工具箱` : '屿宁工具箱'
  // 页面访问日志：记录用户进入的功能页面（留痕排查）
  window.yuneeAPI?.logEvent('router', '访问页面', title ?? String(to.path))
})

export default router