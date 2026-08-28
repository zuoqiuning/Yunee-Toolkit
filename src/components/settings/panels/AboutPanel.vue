<!--
  设置面板：关于（应用信息）
  职责：应用品牌展示（图标 / 英文名 / 中文副标题 / 作者 / 版本）、软件介绍、依赖的开源工具致谢。
  设计：
    - 顶部 logo 图标居中放大，英文名称用渐变描边字 + 宽松字距，中文副标题紧随其后；
    - 作者与版本号横向排布居中（右侧为版本标签）；
    - 依赖的开源工具以 hoverable 卡片列出（当前仅 FFmpeg）；
    - 点击「查看协议」打开模态框，内容直接映射主进程读取的 licenses 目录协议 txt。
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

/** 开源工具卡片数据（后续新增工具时在此追加一项，主进程 license.ts 同步登记协议） */
const ossTools = [
  {
    key: 'ffmpeg',
    name: 'FFmpeg',
    initial: 'F',
    meta: 'LGPL v2.1 · 多媒体处理',
  },
]

// —— 协议查看模态框状态 ——
const licenseVisible = ref(false)
const licenseTitle = ref('')
const licenseText = ref('')
const licenseLoading = ref(false)

/**
 * 协议文本 → 段落数组（渲染排版用）。
 * 处理：按空行分段；段内硬换行合并为空格，避免 txt 天然换行导致的“一行一句”生硬观感。
 */
const licenseParagraphs = computed(() =>
  licenseText.value
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean),
)

/** 打开协议模态框并拉取协议文本（直接映射 licenses 目录下的 txt） */
async function onViewLicense(key: string, name: string) {
  licenseTitle.value = `${name} 开源协议`
  licenseVisible.value = true
  licenseLoading.value = true
  licenseText.value = ''
  window.yuneeAPI?.logEvent('about', '查看协议', `查看《${name}》开源协议`)
  try {
    const text = await window.yuneeAPI?.getLicenseText(key)
    licenseText.value = text ?? '未找到该开源项目的协议文件。'
  } catch {
    licenseText.value = '协议文本加载失败，请稍后重试。'
  } finally {
    licenseLoading.value = false
  }
}
</script>

<template>
  <div class="about">
    <!-- 品牌区：图标放大 + 英文名 + 中文副标题 -->
    <img class="about__logo" src="/icon.ico" alt="logo" />
    <div class="about__name">Yunee Toolkit</div>
    <div class="about__sub">屿宁工具箱</div>

    <!-- 作者 + 版本号（横向居中排布，版本放右侧） -->
    <div class="about__author-line">
      <span class="about__author">作者：左丘宁</span>
      <a-tag class="about__version" color="arcoblue" :bordered="false">
        {{ appStore.meta.version }}
      </a-tag>
    </div>

    <a-divider class="about__divider" />

    <!-- 软件介绍：专业定位 + 开放扩展（后续持续集成更多开源工具，不止 FFmpeg） -->
    <div class="about__desc">
      一款本地优先的专业多媒体工具箱，集成 FFmpeg 等开源处理引擎，
      能力持续扩展，全部处理均在本地完成，数据不离开设备。
    </div>

    <a-divider class="about__divider" />

    <!-- 依赖的开源工具：卡片致谢，可查看协议（后续新增工具自动加入列表） -->
    <div class="about__oss">
      <div class="about__oss-title">依赖的开源工具</div>
      <a-card
        v-for="tool in ossTools"
        :key="tool.key"
        hoverable
        class="oss-card"
        :style="{ width: '100%', maxWidth: '360px' }"
      >
        <div class="oss-card__row">
          <span class="oss-card__left">
            <a-avatar :size="40" :style="{ backgroundColor: '#165DFF' }">
              {{ tool.initial }}
            </a-avatar>
            <span class="oss-card__info">
              <span class="oss-card__name">{{ tool.name }}</span>
              <span class="oss-card__meta">{{ tool.meta }}</span>
            </span>
          </span>
          <a-button size="small" @click="onViewLicense(tool.key, tool.name)">
            查看协议
          </a-button>
        </div>
      </a-card>
    </div>
  </div>

  <!-- 协议文本模态框：内容直接来自 licenses 目录下的协议 txt，段落化渲染 -->
  <a-modal
    v-model:visible="licenseVisible"
    :title="licenseTitle"
    :width="760"
    unmount-on-close
    class="license-modal"
  >
    <div v-if="licenseLoading" class="license__loading">
      <a-spin />
    </div>
    <!-- 排版组件逐段渲染协议正文：宽度收敛居中 + 两端对齐，改善“整段靠左”的生硬观感 -->
    <a-typography v-else class="license__body">
      <a-paragraph
        v-for="(para, idx) in licenseParagraphs"
        :key="idx"
        :spacing="'extended'"
      >
        {{ para }}
      </a-paragraph>
    </a-typography>
    <template #footer>
      <a-button type="primary" @click="licenseVisible = false">知道了</a-button>
    </template>
  </a-modal>
</template>

<style scoped>
.about {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 8px 24px;
  text-align: center;
}

/* 中央图标：放大展示 */
.about__logo {
  width: 140px;
  height: 140px;
  object-fit: contain;
}

/* 英文名称：美观英文字体 + 主色实色（浅色/深色主题下都清晰可见） */
.about__name {
  margin-top: 6px;
  font-family: 'Century Gothic', 'Segoe UI', 'Avenir Next', 'Helvetica Neue', Arial, sans-serif;
  font-size: 38px;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 1.25;
  color: var(--color-primary-6);
}

/* 中文副标题 */
.about__sub {
  margin-top: 2px;
  font-size: 14px;
  color: var(--color-text-3);
}

/* 作者 + 版本：横向居中排布 */
.about__author-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.about__author {
  font-size: 13px;
  color: var(--color-text-2);
}

.about__version {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* 分隔线：左右留白适中 */
.about__divider {
  width: 420px;
  max-width: 100%;
  margin: 18px 0;
}

/* 软件介绍 */
.about__desc {
  max-width: 440px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--color-text-2);
}

/* 开源工具致谢区 */
.about__oss {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.about__oss-title {
  align-self: flex-start;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-1);
}

/* 多张工具卡片时的纵向间距 */
.oss-card + .oss-card {
  margin-top: 12px;
}

/* 卡片内：头像 + 名称信息 在左，操作按钮在右 */
.oss-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.oss-card__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.oss-card__info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.oss-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-1);
}

.oss-card__meta {
  font-size: 12px;
  color: var(--color-text-3);
}

/* 协议正文排版：宽度收敛居中 + 两端对齐 + 可滚动，观感规整 */
.license__loading {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

.license__body {
  max-width: 660px;
  margin: 0 auto;
  padding: 2px 8px;
  font-size: 13px;
  line-height: 1.9;
  text-align: justify;
  color: var(--color-text-2);
  max-height: 520px;
  overflow-y: auto;
}

/* 段落间距统一：最后一段贴底 */
.license__body :deep(.arco-typography) {
  margin: 0 0 14px;
}

.license__body :deep(.arco-typography:last-child) {
  margin-bottom: 0;
}
</style>