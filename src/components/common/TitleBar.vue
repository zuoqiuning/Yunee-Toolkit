<!--
  自绘窗口标题栏 TitleBar
  职责：替代操作系统默认标题栏 —— 展示应用图标/标题，并提供最小化/最大化（还原）/关闭按钮。
  设计说明：
    - 窗口为无边框（frame: false），本组件配合主进程 windowControl (IPC) 控制窗口。
    - 整条标题栏为可拖拽区域（-webkit-app-region: drag），按钮需标记 no-drag。
    - 双击标题栏触发最大化/还原；监听 window:maximized-changed 切换图标。
    - 非 Electron 环境（纯浏览器预览）时按钮静默失效，保证开发友好。
-->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const api = window.yuneeAPI
const isMaximized = ref(false)

/** 取消订阅函数（便于组件卸载时清理） */
let disposeMaximizeListener: (() => void) | null | undefined = null

/** 最小化窗口 */
function minimize() {
  api?.windowControl.minimize()
}

/** 最大化 / 还原切换 */
function toggleMaximize() {
  api?.windowControl.toggleMaximize()
}

/** 关闭窗口 */
function closeWindow() {
  api?.windowControl.close()
}

onMounted(() => {
  // 订阅窗口最大化状态变化，刷新“最大化/还原”图标
  disposeMaximizeListener = api?.onMainEvent('window:maximized-changed', (payload) => {
    isMaximized.value = Boolean(payload)
  })
})

onBeforeUnmount(() => {
  disposeMaximizeListener?.()
})
</script>

<template>
  <div class="titlebar" @dblclick="toggleMaximize">
    <!-- 左侧：应用图标与标题 -->
    <div class="titlebar__brand">
      <img class="titlebar__logo" src="/icon.ico" alt="logo" draggable="false" />
      <span class="titlebar__title">Yunee Toolkit</span>
    </div>

    <!-- 右侧：窗口控制按钮 -->
    <div class="titlebar__controls">
      <!-- 最小化 -->
      <button class="ctrl" title="最小化" @click="minimize">
        <svg class="ctrl__glyph" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>

      <!-- 最大化 / 还原 -->
      <button class="ctrl" :title="isMaximized ? '还原' : '最大化'" @click="toggleMaximize">
        <svg
          v-if="!isMaximized"
          class="ctrl__glyph"
          viewBox="0 0 16 16"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
        >
          <rect x="3" y="4" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3" />
          <path d="M6 4V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1" stroke="currentColor" stroke-width="1.3" />
        </svg>
        <svg
          v-else
          class="ctrl__glyph"
          viewBox="0 0 16 16"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
        >
          <rect x="3" y="6" width="9" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3" />
          <path d="M6.5 6v-.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5H10" stroke="currentColor" stroke-width="1.3" />
        </svg>
      </button>

      <!-- 关闭 -->
      <button class="ctrl ctrl--close" title="关闭" @click="closeWindow">
        <svg class="ctrl__glyph" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 标题栏：整条可拖拽（drag），按钮标记 no-drag */
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding-left: 12px;
  background: var(--color-bg-1);
  -webkit-app-region: drag;
  user-select: none;
  flex-shrink: 0;
  transition: background-color 0.25s ease;
}

/* 左侧品牌 */
.titlebar__brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.titlebar__logo {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  object-fit: contain;
}

.titlebar__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-1);
}

/* 右侧控制按钮组 */
.titlebar__controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

/* 单个窗口控制按钮（46px 宽的方形热区） */
.ctrl {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-2);
  cursor: pointer;
}
.ctrl:hover {
  background: var(--color-fill-2);
  color: var(--color-text-1);
}

/* 关闭按钮 hover 红色 */
.ctrl--close:hover {
  background: #e5484d;
  color: #ffffff;
}

/* 按钮内图形统一尺寸 */
.ctrl__glyph {
  width: 15px;
  height: 15px;
  display: block;
}
</style>