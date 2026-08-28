<!--
  设置卡片表头“恢复默认”按钮
  职责：显示在设置卡片标题栏（#extra）最右侧的小按钮，点击后通知父组件复位。
  说明：仅负责“触发复位”的 UI 与反馈，具体复位哪些字段由父组件通过 @reset 传参决定。
-->
<script setup lang="ts">
import { Notification } from '@arco-design/web-vue'
import ArcoIcon from '@/components/common/ArcoIcon.vue'
import { highlight } from '@/utils/notify'

/** 复位目标中文名（用于反馈文案），例如“外观” */
const props = defineProps<{ name: string }>()

const emit = defineEmits<{ reset: [] }>()

/** 点击复位：通知 + 向外广播 */
function onReset() {
  Notification.success({
    content: highlight(`「${props.name}」设置已恢复为默认值。`),
  })
  emit('reset')
}
</script>

<template>
  <a-button type="secondary" size="mini" title="恢复默认" @click="onReset">
    <template #icon><ArcoIcon name="refresh" :size="14" /></template>
    <template #default>恢复默认</template>
  </a-button>
</template>