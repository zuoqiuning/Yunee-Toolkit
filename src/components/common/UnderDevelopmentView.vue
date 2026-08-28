<!--
  公共占位组件：正在开发
  职责：功能尚未实现时统一展示占位结果页，风格与整体白色主题一致。
  UI：Arco a-result + a-tag，图标经 ArcoIcon 渲染；内容置于白色圆角卡片中，规整居中。
-->
<script setup lang="ts">
import ArcoIcon from '@/components/common/ArcoIcon.vue'

/** props 定义 */
defineProps<{
  /** 模块名称 */
  title: string
  /** 模块功能描述 */
  desc?: string
}>()
</script>

<template>
  <div class="under-dev">
    <div class="under-dev__card">
      <a-result status="warning">
        <template #icon>
          <ArcoIcon name="apps" :size="52" />
        </template>
        <template #title>{{ title }}</template>
        <template #subtitle>{{ desc || '该功能正在开发中，敬请期待。' }}</template>
        <template #extra>
          <a-tag color="orange" size="medium">正在开发</a-tag>
        </template>
      </a-result>
    </div>
  </div>
</template>

<style scoped>
/* 占位页：垂直/水平居中，顶部留出与横幅一致的空间 */
.under-dev {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 64px 24px;
}

/* 卡片：随主题色变化的面板 + 细分隔线 + 浅阴影 */
.under-dev__card {
  width: 100%;
  max-width: 480px;
  padding: 48px 24px 40px;
  background: var(--color-bg-1);
  border: 1px solid var(--color-border-2);
  border-radius: 14px;
  box-shadow: 0 4px 20px var(--color-border-1);
}
</style>