/**
 * 主布局 MainLayout
 * 职责：搭建应用整体外壳 —— 左侧导航栏 + 右侧内容区。
 *
 * UI：完全使用 Arco Design 默认导航组件与默认样式，不做额外自定义覆盖：
 *   - a-layout-sider 收左侧导航（自带可折叠，collapsible + v-model:collapsed）。
 *   - a-menu + a-sub-menu 分组，菜单折叠状态与 sider 联动。
 *   - 图标：功能条目用 ToolIcon（SVG），首页/分组/关于/设置用 ArcoIcon。
 */
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ArcoIcon from '@/components/common/ArcoIcon.vue'
import ToolIcon from '@/components/common/ToolIcon.vue'
import SettingsModal from '@/components/settings/SettingsModal.vue'
import { navGroups } from '@/config/navigation'

const route = useRoute()
const router = useRouter()

// 侧边栏/菜单折叠状态（Arco 默认交互）
const collapsed = ref(false)

// 设置模态框显隐
const settingsVisible = ref(false)

// 托盘菜单「打开设置」事件的取消订阅函数（卸载时释放）
let disposeOpenSettings: (() => void) | null = null

// 默认展开所有分组的子菜单
const expandedGroups = navGroups.map((g) => g.title)

// 当前选中的菜单值（同步路由路径，实现高亮跟随）
const activeMenu = ref(route.path)

watch(
  () => route.path,
  (path) => {
    activeMenu.value = path
  },
)

// 监听托盘菜单「打开设置」：显示主窗口后由主进程推送此事件，打开设置模态框
onMounted(() => {
  disposeOpenSettings =
    window.yuneeAPI?.onMainEvent('open-settings', () => {
      settingsVisible.value = true
    }) ?? null
})

onBeforeUnmount(() => {
  disposeOpenSettings?.()
})

/** 点击菜单项：设置打开模态框；其余按路由跳转 */
function onMenuClick(key: string | number) {
  if (key === 'settings') {
    window.yuneeAPI?.logEvent('ui', '打开设置', '打开设置抽屉')
    settingsVisible.value = true
    return
  }
  router.push(String(key))
}
</script>

<template>
  <a-layout class="layout">
    <!-- 左侧导航：Arco 默认 a-layout-sider + a-menu，
         内部用 flex 纵向：功能菜单占满中部可滚动，底部固定放“关于/设置”，折叠按钮贴底 -->
    <a-layout-sider
      collapsible
      v-model:collapsed="collapsed"
      :width="200"
      class="sider"
    >
      <div class="sider__body">
        <!-- 功能菜单（占满剩余高度，超高可滚动） -->
        <a-menu
          class="sider__features"
          :collapsed="collapsed"
          :selected-keys="[activeMenu]"
          :default-open-keys="expandedGroups"
          @menu-item-click="onMenuClick"
        >
          <!-- 首页 -->
          <a-menu-item key="/">
            <template #icon><ArcoIcon name="home" /></template>
            首页
          </a-menu-item>

          <!-- 按功能分组渲染子菜单 -->
          <a-sub-menu v-for="group in navGroups" :key="group.title">
            <template #icon><ArcoIcon :name="group.icon" /></template>
            <template #title>{{ group.title }}</template>
            <a-menu-item v-for="item in group.items" :key="item.path">
              <template #icon><ToolIcon :name="item.icon" /></template>
              {{ item.label }}
            </a-menu-item>
          </a-sub-menu>
        </a-menu>

        <!-- 底部固定区：关于、设置（紧贴折叠/展开按钮上方） -->
        <a-menu
          class="sider__bottom"
          :collapsed="collapsed"
          :selected-keys="[activeMenu]"
          @menu-item-click="onMenuClick"
        >
          <a-menu-item key="/about">
            <template #icon><ArcoIcon name="info-circle" /></template>
            关于
          </a-menu-item>
          <a-menu-item key="settings">
            <template #icon><ArcoIcon name="settings" /></template>
            设置
          </a-menu-item>
        </a-menu>
      </div>
    </a-layout-sider>

    <!-- 右侧内容区：路由切换带淡入过渡（page-fade 样式见全局 index.css） -->
    <a-layout-content class="layout__main">
      <router-view v-slot="{ Component }">
        <transition name="page-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </a-layout-content>

    <!-- 设置模态框 -->
    <SettingsModal v-model:visible="settingsVisible" />
  </a-layout>
</template>

<style scoped>
/* 整体行布局：占满剩余高度 */
.layout {
  height: 100%;
  overflow: hidden;
}

/* 内容区：独立纵向滚动，背景由主题变量决定（见全局样式） */
.layout__main {
  overflow-y: auto;
  overflow-x: hidden;
}

/* 侧边栏：纵向 flex，内容撑满，折叠按钮（Arco 自动生成）自然贴在底部。
   注意：Arco 默认会给 has-trigger 预留 padding-bottom，需清零，否则折叠按钮下方会空出一行。 */
.sider {
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}

/* Arco 会自动包一层 sider-children，需让它也参与纵向布局，否则底部区无法贴底 */
.sider :deep(.arco-layout-sider-children) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 内容容器：占满 sider 高度，内部纵向布局 */
.sider__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 功能菜单：占满剩余空间，超高时独立纵向滚动（避免挤压底部区） */
.sider__features {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 底部固定区（关于/设置）：不缩放，通过顶部分隔线与功能区分隔 */
.sider__bottom {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border-2);
}
</style>