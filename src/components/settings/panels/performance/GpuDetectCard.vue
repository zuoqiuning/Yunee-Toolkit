<!--
  显卡检测卡片 GpuDetectCard
  职责：在「性能」设置面板中展示主进程检测到的显卡信息：
        检测状态 → 显卡表格（品牌 / 型号 / 数量）→ 推荐 / 已自动设置的加速方案提示。
  设计：
    - 使用 Arco 表格（带网格线 + 醒目表头）逐行列出显卡，比卡片并排更整齐直观；
    - 品牌列用品牌色标签（a-tag）标识，数量列在同型号多卡时显示 ×N；
    - 表格下方的辅助提示文字说明推荐 / 已自动选中的加速方案。
  说明：纯展示组件；数据来自 hardware store（启动阶段已检测完毕，进入即得）；
        无 emoji，状态图标使用内联 SVG。
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { TableColumnData } from '@arco-design/web-vue'
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

/** 显卡表格列定义：品牌 / 型号 / 数量 */
const gpuColumns: TableColumnData[] = [
  { title: '显卡品牌', dataIndex: 'brand', slotName: 'brand', width: 130 },
  { title: '显卡型号', dataIndex: 'name', slotName: 'name' },
  { title: '数量', dataIndex: 'count', slotName: 'count', width: 90 },
]

/** 表格行数据：附加唯一行序号（Arco 表格要求每行有唯一 key） */
const gpuRows = computed(() => hardware.gpus.map((g, i) => ({ ...g, _key: i })))

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

    <!-- 有显卡信息：表格 + 推荐提示 -->
    <div v-else>
      <!-- 显卡信息表格（网格线 + 醒目表头） -->
      <a-table
        class="gpu-detect__table"
        :data="gpuRows"
        :columns="gpuColumns"
        row-key="_key"
        :pagination="false"
        :bordered="{ wrapper: true, cell: true }"
        size="small"
      >
        <!-- 品牌列：品牌色标签 -->
        <template #brand="{ record }">
          <a-tag :color="brandMeta[record.brand]?.color" class="gpu-detect__tag">
            {{ brandMeta[record.brand]?.label ?? '未知' }}
          </a-tag>
        </template>

        <!-- 型号列：显卡型号（含同型号数量标记） -->
        <template #name="{ record }">
          <span class="gpu-detect__name">{{ record.name }}</span>
        </template>

        <!-- 数量列：同型号多卡显示 ×N -->
        <template #count="{ record }">
          <span v-if="record.count > 1" class="gpu-detect__x">×{{ record.count }}</span>
          <span v-else class="gpu-detect__one">1</span>
        </template>
      </a-table>

      <!-- 表格下方的辅助提示 -->
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

/* 显卡信息表格：铺满可用宽度 */
.gpu-detect__table {
  width: 100%;
}

/* 品牌标签：品牌色填充，字号略小更内敛 */
.gpu-detect__tag {
  font-weight: 500;
}

/* 型号文本：左对齐、可折行 */
.gpu-detect__name {
  font-size: 13px;
  color: var(--color-text-1);
  line-height: 1.5;
  word-break: break-all;
}

/* 同型号数量标记（如：交火双卡 → ×2） */
.gpu-detect__x {
  font-weight: 600;
  color: var(--color-text-2);
}

/* 单卡数量：弱化显示 */
.gpu-detect__one {
  color: var(--color-text-3);
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

/* 推荐 / 自动设置提示（位于表格下方） */
.gpu-detect__tip {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-text-3);
}
</style>
