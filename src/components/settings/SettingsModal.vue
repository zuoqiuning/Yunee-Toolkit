<!--
  设置模态框 SettingsModal
  职责：侧边栏“设置”按钮打开的设置界面（Arco Modal，居中弹窗，尺寸固定）。
  设计说明：
    - 外观与「查看协议」模态框同款：顶部左侧标题“设置”，右侧为默认关闭 X；
      底部操作栏最右侧为「关闭」按钮（左侧为「恢复默认」）。
    - 标题栏下方是选项卡导航（Arco Tabs，type=card-gutter）。
    - 选项卡整体作为「外框架」自动填满内容区（600px 高）：页签栏固定顶部，
      面板内容置于各 tab-pane 内，仅在框架内容区内部滚动，页签与弹窗尺寸保持不动。
    - 页签容器使用浅灰衬底（fill-2），无底部横线，直角风格。
  结构：
    [ 设置                              × ]
  [ 通用 | 个性化 | 输出 | 性能 | 声音 | 日志 | 存储 | 工具 | 更新 ]  ← 页签固定
  [           面板内容（框架内可滚动）            ]
  [        恢复默认                   关闭 ]
-->
<script setup lang="ts">
import { ref } from 'vue'
import { Modal, Notification } from '@arco-design/web-vue'
import GeneralPanel from './panels/GeneralPanel.vue'
import PersonalizationPanel from './panels/PersonalizationPanel.vue'
import OutputPanel from './panels/OutputPanel.vue'
import PerformancePanel from './panels/PerformancePanel.vue'
import SoundPanel from './panels/SoundPanel.vue'
import LogPanel from './panels/LogPanel.vue'
import StoragePanel from './panels/StoragePanel.vue'
import ToolsPanel from './panels/ToolsPanel.vue'
import UpdatePanel from './panels/UpdatePanel.vue'
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
    :mask-closable="true"
    :align-center="true"
    :esc-to-close="true"
    :body-style="{ padding: '0', height: '600px' }"
    @cancel="close"
    @close="close"
  >
    <!-- 固定高度的内容区：选项卡外框架填满，页签固定、面板内容在框架内滚动 -->
    <div class="modal__body">
      <a-tabs
        v-model:active-key="activeTab"
        type="card-gutter"
        class="modal__tabs"
        :destroy-on-hide="false"
      >
        <a-tab-pane key="general" title="通用" lazy-load>
          <GeneralPanel />
        </a-tab-pane>
        <a-tab-pane key="personalization" title="个性化" lazy-load>
          <PersonalizationPanel />
        </a-tab-pane>
        <a-tab-pane key="output" title="输出" lazy-load>
          <OutputPanel />
        </a-tab-pane>
        <a-tab-pane key="performance" title="性能" lazy-load>
          <PerformancePanel />
        </a-tab-pane>
        <a-tab-pane key="sound" title="声音" lazy-load>
          <SoundPanel />
        </a-tab-pane>
        <a-tab-pane key="log" title="日志" lazy-load>
          <LogPanel />
        </a-tab-pane>
        <a-tab-pane key="storage" title="存储" lazy-load>
          <StoragePanel />
        </a-tab-pane>
        <a-tab-pane key="tools" title="工具" lazy-load>
          <ToolsPanel />
        </a-tab-pane>
        <a-tab-pane key="update" title="更新" lazy-load>
          <UpdatePanel />
        </a-tab-pane>
      </a-tabs>
    </div>

    <!-- 底部操作栏：左侧恢复默认，右侧关闭（与「查看协议」模态框同款布局） -->
    <template #footer>
      <div class="modal__footer">
        <a-button type="secondary" @click="onReset">恢复默认</a-button>
        <a-button type="primary" @click="close">关闭</a-button>
      </div>
    </template>
  </a-modal>
</template>

<style scoped>
/* 固定高度内容区（600px），由选项卡外框架整体填满 */
.modal__body {
  height: 600px;
}

/* 选项卡作为整体包裹框架：填满内容区，纵向布局（页签在上、内容在下） */
.modal__tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 页签栏：固定顶部，不随内容滚动；顶部留白作为外框架边缘 */
.modal__tabs :deep(.arco-tabs-header) {
  flex-shrink: 0;
  padding: 12px 16px 0;
}

/* 页签容器（外框架衬底）：浅灰背景、直角，移除页签下方横线 */
.modal__tabs :deep(.arco-tabs-header-nav) {
  background-color: var(--color-fill-2);
  border-bottom: none;
  box-shadow: none;
  border-radius: 0;
}

/* 页签本身保持直角 */
.modal__tabs :deep(.arco-tabs-tab) {
  border-radius: 0;
}

/* 内容区：占满剩余高度，与选项卡选中态同色（bg-1），仅面板内容在内部滚动 */
.modal__tabs :deep(.arco-tabs-content) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px 8px;
  background-color: var(--color-bg-1);
}

/* 设置面板统一：设置项名称与右侧控件「垂直居中」对齐，
   Arco 默认 flex-start 顶部对齐会导致名称相对控件偏上（实测最多偏差约 7px）；
   居中后普通项偏差归零，带提示卡项仅余约 1-2px 可接受偏差 */
.modal__tabs :deep(.panel__form .arco-form-item) {
  align-items: center;
}

/* 底部操作栏：恢复默认在左，关闭在右（与「查看协议」模态框底部对齐一致） */
.modal__footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
</style>