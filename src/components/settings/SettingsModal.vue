<!--
  设置模态框 SettingsModal
  职责：侧边栏“设置”按钮打开的设置界面（Arco Modal，居中弹窗，尺寸固定）。
  设计说明：
    - 顶部为 Arco 模态框标准标题栏：左侧“设置”，右侧默认关闭 X。
    - 标题栏下方是选项卡导航（Arco Tabs），切换各设置面板。
    - 内容区高度固定，内部滚动，不同面板内容多寡都不会改变弹窗尺寸。
  结构：
    [ 设置                              × ]
  [ 通用 | 个性化 | 输出 | 性能 | 日志 | 存储 | 工具 ]
  [           面板内容（固定高度，可滚动）     ]
  [                 恢复默认                 ]
-->
<script setup lang="ts">
import { ref } from 'vue'
import { Modal, Notification } from '@arco-design/web-vue'
import GeneralPanel from './panels/GeneralPanel.vue'
import PersonalizationPanel from './panels/PersonalizationPanel.vue'
import OutputPanel from './panels/OutputPanel.vue'
import PerformancePanel from './panels/PerformancePanel.vue'
import LogPanel from './panels/LogPanel.vue'
import StoragePanel from './panels/StoragePanel.vue'
import ToolsPanel from './panels/ToolsPanel.vue'
import { useSettingsStore } from '@/stores/settings'

// 模态框显隐（由父组件控制）
const visible = defineModel<boolean>('visible', { default: false })

// 当前激活的选项卡 key
const activeTab = ref('general')

const settings = useSettingsStore()

/** 关闭模态框 */
function close() {
  visible.value = false
}

/** 恢复默认设置（二次确认 + 通知） */
function onReset() {
  Modal.confirm({
    title: '恢复默认设置',
    content: '确定要将所有设置恢复为默认值吗？',
    okText: '恢复',
    okButtonProps: { status: 'danger' },
    cancelText: '取消',
    onBeforeOk: () => {
      settings.reset()
      window.yuneeAPI?.logEvent('settings', '恢复默认设置', '全部设置项已恢复默认值')
      Notification.success({ content: '所有设置均已恢复为默认值。' })
    },
  })
}
</script>

<template>
  <a-modal
    :visible="visible"
    title="设置"
    :width="820"
    :footer="false"
    :mask-closable="true"
    :align-center="true"
    :esc-to-close="true"
    :body-style="{ padding: '0', height: '600px' }"
    @cancel="close"
    @close="close"
  >
    <!-- 固定高度的内容区：选项卡在上，面板在占满剩余空间并可滚动 -->
    <div class="modal__body">
      <!-- 选项卡导航 -->
      <a-tabs
        v-model:active-key="activeTab"
        type="line"
        class="modal__tabs"
        :destroy-on-hide="false"
      >
        <a-tab-pane key="general" title="通用" />
        <a-tab-pane key="personalization" title="个性化" />
        <a-tab-pane key="output" title="输出" />
        <a-tab-pane key="performance" title="性能" />
        <a-tab-pane key="log" title="日志" />
        <a-tab-pane key="storage" title="存储" />
        <a-tab-pane key="tools" title="工具" />
      </a-tabs>

      <!-- 面板容器（滚动） -->
      <div class="modal__scroll">
        <GeneralPanel v-if="activeTab === 'general'" />
        <PersonalizationPanel v-else-if="activeTab === 'personalization'" />
        <OutputPanel v-else-if="activeTab === 'output'" />
        <PerformancePanel v-else-if="activeTab === 'performance'" />
        <LogPanel v-else-if="activeTab === 'log'" />
        <StoragePanel v-else-if="activeTab === 'storage'" />
        <ToolsPanel v-else-if="activeTab === 'tools'" />
      </div>
    </div>

    <!-- 底部：恢复默认 -->
    <template #footer>
      <div class="modal__footer">
        <a-button type="secondary" @click="onReset">恢复默认</a-button>
      </div>
    </template>
  </a-modal>
</template>

<style scoped>
/* 固定高度内容区：flex 纵向，选项卡 + 面板 */
.modal__body {
  display: flex;
  flex-direction: column;
  height: 600px;
}

/* 选项卡固定在上部 */
.modal__tabs {
  flex-shrink: 0;
  padding: 0 16px;
}

.modal__tabs :deep(.arco-tabs-content) {
  display: none;
}

/* 面板容器：占满剩余高度，可滚动 */
.modal__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px 8px;
}

/* 底部右侧 */
.modal__footer {
  display: flex;
  justify-content: flex-end;
}
</style>