<!--
  公共组件：Arco 图标
  职责：按名称字符串渲染对应的 Arco Design 图标。
  设计说明：
    - 集中维护“名称 -> Arco 图标组件”的映射，供导航/首页等按配置项动态出图。
    - 采用显式按需引入，避免动态 import 造成的打包不确定性与体积膨胀。
-->
<script setup lang="ts">
import type { Component } from 'vue'
import { computed } from 'vue'
import IconApps from '@arco-design/web-vue/es/icon/icon-apps'
import IconCopy from '@arco-design/web-vue/es/icon/icon-copy'
import IconFile from '@arco-design/web-vue/es/icon/icon-file'
import IconFileAudio from '@arco-design/web-vue/es/icon/icon-file-audio'
import IconFileVideo from '@arco-design/web-vue/es/icon/icon-file-video'
import IconFolder from '@arco-design/web-vue/es/icon/icon-folder'
import IconHome from '@arco-design/web-vue/es/icon/icon-home'
import IconImage from '@arco-design/web-vue/es/icon/icon-image'
import IconInfoCircle from '@arco-design/web-vue/es/icon/icon-info-circle'
import IconLock from '@arco-design/web-vue/es/icon/icon-lock'
import IconLoop from '@arco-design/web-vue/es/icon/icon-loop'
import IconMusic from '@arco-design/web-vue/es/icon/icon-music'
import IconRight from '@arco-design/web-vue/es/icon/icon-right'
import IconSettings from '@arco-design/web-vue/es/icon/icon-settings'
import IconMenuFold from '@arco-design/web-vue/es/icon/icon-menu-fold'
import IconMenuUnfold from '@arco-design/web-vue/es/icon/icon-menu-unfold'
import IconClose from '@arco-design/web-vue/es/icon/icon-close'
import IconRefresh from '@arco-design/web-vue/es/icon/icon-refresh'

/** 名称 -> Arco 图标组件 映射表 */
const iconMap: Record<string, Component> = {
  home: IconHome,
  apps: IconApps,
  'file-video': IconFileVideo,
  'file-audio': IconFileAudio,
  image: IconImage,
  file: IconFile,
  loop: IconLoop,
  copy: IconCopy,
  music: IconMusic,
  lock: IconLock,
  'info-circle': IconInfoCircle,
  'chevron-right': IconRight,
  settings: IconSettings,
  'menu-fold': IconMenuFold,
  'menu-unfold': IconMenuUnfold,
  close: IconClose,
  refresh: IconRefresh,
}

/** props 定义 */
const props = withDefaults(
  defineProps<{
    /** 图标名称（对应 iconMap 的 key） */
    name: string
    /** 图标尺寸（px 或数字） */
    size?: string | number
  }>(),
  { size: 16 },
)

// 根据名称取对应图标组件，未知名称回退为文件夹图标
const comp = computed(() => iconMap[props.name] || IconFolder)
</script>

<template>
  <component :is="comp" :size="size" class="y-icon" />
</template>