/**
 * 根组件
 * 职责：应用最外层容器，使用 Arco Layout 布局 —— 顶部 a-layout-header 收自绘标题栏，
 *       下方内容区通过路由渲染主布局（MainLayout）。
 * 布局：a-layout 纵向铺满；header 固定高度承载标题栏，剩余区域由路由渲染 MainLayout 填充。
 */
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import TitleBar from '@/components/common/TitleBar.vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useHardwareStore } from '@/stores/hardware'

const settings = useSettingsStore()
const appStore = useAppStore()
const hardware = useHardwareStore()

// 窗口最大化状态：最大化时收起圆角/阴影，让内容铺满屏幕
const isMaximized = ref(false)
let disposeMaximizeListener: (() => void) | null | undefined = null

// 主题同步：浅色/深色 → 切换 <body> 的 arco-theme 属性
watchEffect(() => {
  document.body.setAttribute('arco-theme', settings.theme)
})

/**
 * 同步日志系统：把渲染进程的日志目录与清理规则发给主进程。
 * 目录为空时主进程自动使用默认日志目录（用户“恢复默认”后即可切回）。
 */
async function syncLogger() {
  await window.yuneeAPI?.initLogger(settings.logDir, settings.logRetainDays, settings.logMaxFiles)
}

// 日志目录或清理规则变化时实时同步
watch(
  [() => settings.logDir, () => settings.logRetainDays, () => settings.logMaxFiles],
  syncLogger,
)

// 应用启动后：
//  - 拉取主进程元信息（版本号统一为 beta 展示），并将默认输出/临时目录回填（不覆盖自定义）；
//  - 读取显卡检测结果（启动阶段已预加载），并执行「首次运行」自动设置加速方案；
//  - 初始化日志系统（目录 + 清理规则），开启本次会话的记录。
onMounted(async () => {
  appStore.fetchAppMeta()
  await settings.applyDefaultDirs()
  hardware.init()
  await syncLogger()
  // 订阅窗口最大化状态，切换圆角/阴影（TitleBar 也订阅了同一事件，互不影响）
  disposeMaximizeListener = window.yuneeAPI?.onMainEvent('window:maximized-changed', (payload) => {
    isMaximized.value = Boolean(payload)
  })
  // 主界面就绪留痕：渲染进程已完成挂载，可开始交互
  window.yuneeAPI?.logEvent('ui', '界面就绪', '渲染进程挂载完成，进入主界面')
})

// 组件卸载时取消订阅，避免泄漏
onBeforeUnmount(() => {
  disposeMaximizeListener?.()
})
</script>

<template>
  <!-- app-shell：透明窗口的圆角/阴影外壳，最大化时收起（--maximized 类） -->
  <div class="app-shell" :class="{ 'app-shell--maximized': isMaximized }">
    <a-layout class="app-layout">
      <!-- 顶部：自绘窗口标题栏（Arco a-layout-header 承载） -->
      <a-layout-header class="app-header">
        <TitleBar />
      </a-layout-header>
      <!-- 主体：由路由渲染主布局（侧边栏 + 内容区） -->
      <router-view class="app-body" />
    </a-layout>
  </div>
</template>

<style scoped>
/* 圆角外壳：四周留边 + 圆角 + 自绘阴影（弧度与 Arco 模态框一致）；最大化时铺满无圆角 */
.app-shell {
  height: calc(100vh - 16px);
  margin: 8px;
  border-radius: var(--border-radius-medium);
  overflow: hidden;
  /* 沿用原 body 的全局背景色，保持窗口整体观感不变 */
  background: var(--color-fill-2);
  box-shadow:
    0 6px 24px rgba(15, 23, 42, 0.14),
    0 2px 8px rgba(15, 23, 42, 0.08);
  transition:
    margin 0.18s ease,
    border-radius 0.18s ease,
    box-shadow 0.18s ease;
}

/* 最大化：铺满屏幕，收起圆角与阴影 */
.app-shell--maximized {
  height: 100vh;
  margin: 0;
  border-radius: 0;
  box-shadow: none;
}

/* 整体外壳：纵向铺满，header 固定高度承载标题栏 */
.app-layout {
  height: 100%;
  overflow: hidden;
}

/* header 覆盖 Arco 默认高度/行高，交还给 TitleBar 自控高度 */
.app-header {
  height: auto;
  line-height: normal;
  padding: 0;
  background: transparent;
}

/* 主体占满 header 之外剩余高度 */
.app-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>