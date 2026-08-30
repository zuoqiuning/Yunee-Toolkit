<!--
  通用文字提示 HintText
  职责：统一「设置项 / 功能项下方的文字提示」，以纯文字呈现（无边框、无背景、无图标），
        视觉更轻、更克制，贴合「简约清晰」的界面风格。
  用法：<template #extra><HintText>提示文字</HintText></template>
        必须配合 a-form-item 的 #extra 插槽使用：Arco 会把插槽内容渲染到
        .arco-form-item-extra 块中，天然位于字段内容正下方，无需任何布局 hack。
  说明：颜色使用 Arco 主题变量，自动适配浅色 / 深色主题。
-->
<template>
  <p class="hint-text" :class="`hint-text--${type}`"><slot /></p>
</template>

<script setup lang="ts">
/** 提示类型：仅影响文字颜色（info 灰色 / warning 警示色等），不再呈现卡片样式 */
withDefaults(
  defineProps<{
    type?: 'info' | 'success' | 'warning' | 'error'
  }>(),
  { type: 'info' },
)
</script>

<style scoped>
/* 位置：位于设置项下方。父级 .arco-form-item-extra 已提供 4px 上间距与 12px 字号，
   这里保持常规行高与无外边距即可。 */
.hint-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}
/* 各类型仅改文字颜色（Arco 主题变量，浅/深色均适配） */
.hint-text--info {
  color: var(--color-text-3);
}
.hint-text--success {
  color: var(--color-success-6);
}
.hint-text--warning {
  color: var(--color-warning-6);
}
.hint-text--error {
  color: var(--color-danger-6);
}
</style>