<!--
  关于视图 AboutView
  职责：独立的“关于”页面（与首页同级的路由页面）。
  内容复用 AboutPanel（图标、名称、版本、简介、开源致谢），居中排版于内容区。
-->
<script setup lang="ts">
import AboutPanel from '@/components/settings/panels/AboutPanel.vue'
</script>

<template>
  <div class="about-page">
    <AboutPanel />
  </div>
</template>

<style scoped>
/* 页面容器：内容区居中排版 */
.about-page {
  display: flex;
  justify-content: center;
  padding: 48px 24px;
}
</style>