<!--
  设置面板：个性化（外观）
  职责：深浅色主题、界面语言等外观显示类设置。
  设计：使用 Arco Form + Card。
  - 主题外观采用三态按钮单选组（跟随系统 / 浅色 / 深色），切换实时生效并通过 Notification 反馈（变量高亮「」）。
  - 「跟随系统」选中后，外观跟随系统深浅色偏好；实际生效主题由 App.vue 统一计算（跟随系统 / 手动值）。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'
import { highlight } from '@/utils/notify'
import CardResetButton from '../common/CardResetButton.vue'

const settings = useSettingsStore()

/** 主题模式（三态）：跟随系统 / 浅色 / 深色 —— 由「跟随系统开关 + 手动主题」派生，单选组据此高亮当前项 */
const themeMode = computed(() => (settings.themeFollowSystem ? 'follow' : settings.theme))

/** 单选组变更：选择「跟随系统」仅打开跟随开关；选择浅/深色则关闭跟随并写入手动主题，均即时生效并通知 */
function onThemeModeChange(value: string | number | boolean) {
  const mode = String(value)
  if (mode === 'follow') {
    settings.themeFollowSystem = true
    Notification.success({ content: highlight('已切换为「跟随系统」主题。') })
    return
  }
  settings.themeFollowSystem = false
  settings.theme = mode === 'dark' ? 'dark' : 'light'
  Notification.success({
    content: highlight(mode === 'dark' ? '已切换为「深色主题」。' : '已切换为「浅色主题」。'),
  })
}

/** 复位“外观”设置（深色主题 + 跟随系统） */
function onResetAppearance() {
  settings.resetFields(['theme', 'themeFollowSystem'])
}
</script>

<template>
  <a-form class="panel__form" layout="horizontal" :model="settings">
    <!-- 外观 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>外观</template>
      <template #extra><CardResetButton name="外观" @reset="onResetAppearance" /></template>
      <a-form-item
        label="主题外观"
        extra="选择软件外观：跟随系统深浅色，或手动指定浅色 / 深色，即刻生效"
      >
        <a-radio-group :model-value="themeMode" type="button" @change="onThemeModeChange">
          <a-radio value="follow">跟随系统</a-radio>
          <a-radio value="light">浅色</a-radio>
          <a-radio value="dark">深色</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item label="界面语言" extra="当前仅提供简体中文">
        <a-tag color="gray" :bordered="false">简体中文</a-tag>
      </a-form-item>
    </a-card>
  </a-form>
</template>

<style scoped>
.panel__card + .panel__card {
  margin-top: 16px;
}

.panel__card :deep(.arco-card-body) {
  padding: 8px 8px 0;
}
</style>
