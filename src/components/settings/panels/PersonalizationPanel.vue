<!--
  设置面板：个性化（外观）
  职责：深色主题、界面语言等外观显示类设置。
  设计：使用 Arco Form + Card。
  - 主题切换实时生效并通过 Notification 反馈（变量高亮「」）。
-->
<script setup lang="ts">
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'
import { highlight } from '@/utils/notify'
import CardResetButton from '../common/CardResetButton.vue'

const settings = useSettingsStore()

/** 切换主题并通知 */
function onThemeChange(value: string | number | boolean) {
  const dark = !!value
  settings.theme = dark ? 'dark' : 'light'
  Notification.success({
    content: highlight(dark ? '已切换为「深色主题」。' : '已切换为「浅色主题」。'),
  })
}

/** 复位“外观”设置（深色主题） */
function onResetAppearance() {
  settings.resetFields(['theme'])
}
</script>

<template>
  <a-form class="panel__form" layout="horizontal" :model="settings">
    <!-- 外观 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>外观</template>
      <template #extra><CardResetButton name="外观" @reset="onResetAppearance" /></template>
      <a-form-item label="深色主题" extra="切换软件的深色 / 浅色外观，即刻生效">
        <a-switch
          :model-value="settings.theme === 'dark'"
          @change="onThemeChange"
        />
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