<!--
  显卡检测卡片 GpuDetectCard
  职责：在「性能」设置面板中展示主进程检测到的显卡信息：
        检测状态 → 显卡卡片列表（品牌 + 型号）→ 推荐/已自动设置的加速方案提示。
  设计：
    - 每张显卡使用一张 Arco 卡片（bordered=false + hoverable）：标题为品牌、右上角为品牌色标签、
      正文为显卡型号（含同型号数量标记），多卡并排展示；
    - 卡片下方的辅助提示文字说明推荐/已自动选中的加速方案。
  说明：纯展示组件；数据来自 hardware store（启动阶段已检测完毕，进入即得）；
        无 emoji，状态图标使用内联 SVG。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useHardwareStore } from '@/stores/hardware'
import { useSettingsStore } from '@/stores/settings'

const hardware = useHardwareStore()
const settings = useSettingsStore()

/** 品牌 → 展示文案与主题色 */
const brandMeta: Record<string, { label: string; color: string }> = {
  nvidia: { label: 'NVIDIA', color: '#76b900' },
  amd: { label: 'AMD', color: '#ed1c24' },
  intel: { label: 'Intel', color: '#0068b5' },
  unknown: { label: '未知', color: '#86909c' },
}

/** 加速方案文案（与设置面板保持一致） */
const hwLabel: Record<string, string> = {
  auto: '自动',
  nvidia: 'NVIDIA',
  intel: 'Intel',
  amd: 'AMD',
  cpu: 'CPU',
}

/** 是否显示「已自动选择」提示：检测到推荐品牌且当前方案正好是推荐值 */
const showAutoTip = computed(
  () =>
    hardware.loaded &&
    hardware.gpus.length > 0 &&
    hardware.recommended !== 'auto' &&
    settings.hwAccel === hardware.recommended,
)
</script>

<template>
  <div class="gpu-detect">
    <!-- 加载中 -->
    <a-spin v-if="hardware.loading" class="gpu-detect__spin" />

    <!-- 已加载但没有任何显卡信息 -->
    <div v-else-if="!hardware.gpus.length" class="gpu-detect__empty">
      <svg class="gpu-detect__chip gpu-detect__chip--muted" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1.5" y="5" width="13" height="6" rx="1.2" stroke="currentColor" stroke-width="1.2" />
        <rect x="5" y="7" width="6" height="2" fill="currentColor" />
        <path d="M4 3h2v2H4zM9.5 3h2v2h-2zM3.5 4.5h1v1h-1zM11 4.5h1v1h-1z" fill="currentColor" />
      </svg>
      <span>未能检测到显卡信息，加速方案保持「自动」。</span>
    </div>

    <!-- 有显卡信息：卡片列表 + 推荐提示 -->
    <div v-else>
      <!-- 显卡卡片区（浅灰底衬，突出卡片） -->
      <div class="gpu-detect__cards">
        <a-card
          v-for="(g, i) in hardware.gpus"
          :key="i"
          class="gpu-detect__card"
          :title="brandMeta[g.brand]?.label ?? '未知'"
          :bordered="false"
          hoverable
        >
          <template #extra>
            <span class="gpu-detect__brand" :style="{ color: brandMeta[g.brand]?.color }">
              {{ brandMeta[g.brand]?.label ?? '未知' }}
            </span>
          </template>
          <div class="gpu-detect__name">
            {{ g.name }}
            <template v-if="g.count > 1">
              <span class="gpu-detect__x"> ×{{ g.count }}</span>
            </template>
          </div>
        </a-card>
      </div>

      <!-- 卡片下方的辅助提示 -->
      <div class="gpu-detect__tip">
        <template v-if="showAutoTip">
          已根据你的显卡自动选择「{{ hwLabel[settings.hwAccel] }}」加速，可在下方修改。
        </template>
        <template v-else>
          检测到显卡，推荐使用「{{ hwLabel[hardware.recommended] }}」加速方案。
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gpu-detect {
  width: 100%;
}

.gpu-detect__spin {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

/* 无显卡信息占位 */
.gpu-detect__empty {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-3);
}

/* 显卡卡片区：浅灰底衬，卡片并排（超宽自动换行） */
.gpu-detect__cards {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  width: 100%;
  padding: 16px;
  box-sizing: border-box;
  background-color: var(--color-fill-2);
}

.gpu-detect__card {
  width: 300px;
  text-align: left;
}

.gpu-detect__card :deep(.arco-card-body) {
  padding: 12px 16px 16px;
}

/* 右上角品牌色标签 */
.gpu-detect__brand {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* 卡片正文：显卡型号 */
.gpu-detect__name {
  font-size: 14px;
  color: var(--color-text-1);
  line-height: 1.5;
  word-break: break-all;
}

/* 同型号数量标记（如：交火双卡 → ×2） */
.gpu-detect__x {
  font-weight: 600;
  color: var(--color-text-2);
}

.gpu-detect__chip {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--color-text-3);
}

.gpu-detect__chip--muted {
  color: var(--color-text-4);
}

/* 推荐 / 自动设置提示（位于卡片下方） */
.gpu-detect__tip {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-text-3);
}
</style>
