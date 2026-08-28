<!--
  设置面板：存储（磁盘占用概览）
  职责：用简约圆饼图展示“软件本身 / 工具目录 / 输出目录”占比，下方用表格列出各占用明细。
  设计：
    - 与其他设置面板一致：卡片框架，标题栏 + 右上角“重新检测”按钮；
    - 卡片内为居中的圆饼图（加载时显示 Arco Spin 骨架）+ 明细表格；
    - 下部 Arco Table 展示各项大小与路径（路径可点击打开）。
    - 数据来自主进程 storage:get-space-stat（递归统计目录占用）。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'

// 按需注册 ECharts 模块（仅饼图 + Canvas 渲染器 + 提示/图例）
use([CanvasRenderer, PieChart, TooltipComponent, LegendComponent])

const settings = useSettingsStore()

// 三块占用（字节）
const appSize = ref(0)
const toolsSize = ref(0)
const outputSize = ref(0)
// 明细路径
const appDir = ref('')
const toolsDir = ref('')
const outputDir = ref('')
// 首次加载中
const loading = ref(true)

/** 格式化字节为可读大小 */
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/** 各块字节数是否全为 0（未取到数据） */
const isEmpty = computed(
  () => appSize.value === 0 && toolsSize.value === 0 && outputSize.value === 0,
)

/** 饼图配置：随占用数据响应式更新；简约样式，无轮廓线 */
const option = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (p: { name: string; value: number; percent: string }) =>
      `${p.name}：${fmtSize(Number(p.value))}（${p.percent}%）`,
  },
  legend: { bottom: 0, icon: 'circle', itemWidth: 10, itemHeight: 10 },
  series: [
    {
      name: '磁盘占用',
      type: 'pie',
      radius: ['40%', '66%'],
      // 三个数据项对应 Arco 主题色：蓝 / 青 / 橙
      color: ['#165dff', '#14c9c9', '#ff7d00'],
      label: { formatter: '{b}\n{d}%' },
      labelLine: { length: 14, length2: 10 },
      data: [
        { value: appSize.value, name: '软件本身' },
        { value: toolsSize.value, name: '工具目录' },
        { value: outputSize.value, name: '输出目录' },
      ],
    },
  ],
}))

/** 表格数据：汇总三块占用，响应式更新 */
const rows = computed(() => [
  { key: 'app', name: '软件本身', color: '#165dff', size: fmtSize(appSize.value), path: appDir.value },
  { key: 'tools', name: '工具目录', color: '#14c9c9', size: fmtSize(toolsSize.value), path: toolsDir.value },
  { key: 'output', name: '输出目录', color: '#ff7d00', size: fmtSize(outputSize.value), path: outputDir.value },
])

/**
 * 拉取占用与明细数据
 * 性能：数据在软件启动阶段已预加载进主进程缓存，进入本面板即可秒开；
 *       force=true（点“重新检测”）时强制重算，保证数据最新。
 */
async function fetchStat(force = false) {
  loading.value = true
  if (force) {
    window.yuneeAPI?.logEvent('storage', '重新检测占用统计', '用户手动重新检测磁盘占用')
  }
  try {
    const dirs = await window.yuneeAPI?.getDefaultDirs()
    const toolStat = await window.yuneeAPI?.getFfmpegStorageStat()
    appDir.value = dirs?.installDir ?? ''
    outputDir.value = dirs?.outputDir ?? ''
    toolsDir.value = toolStat?.path ?? ''
    const stat = await window.yuneeAPI?.getSpaceStat(settings.outputDir ?? '', force)
    if (stat) {
      appSize.value = stat.appSize
      toolsSize.value = stat.toolsSize
      outputSize.value = stat.outputSize
    }
    // 用户手动“重新检测”成功后给出反馈；首次进入面板（force=false）不打扰
    if (force) {
      Notification.success({ content: '磁盘占用统计已更新。' })
    }
  } catch {
    Notification.error({ content: '读取磁盘占用时发生异常。' })
  } finally {
    loading.value = false
  }
}

/** 在系统文件管理器中打开指定目录 */
async function openDir(dir: string) {
  if (!dir) {
    Notification.warning({ content: '该目录尚未设置，暂无可打开的位置。' })
    return
  }
  const ok = await window.yuneeAPI?.openDirectory(dir)
  if (!ok) Notification.warning({ content: '无法打开该目录，请检查是否仍存在。' })
}

onMounted(() => fetchStat())
</script>

<template>
  <!-- 与其他设置面板一致的卡片框架：标题栏 + 内容区 -->
  <a-form class="panel__form" layout="horizontal" :model="{}">
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>磁盘占用概览</template>
      <template #extra>
        <a-button :loading="loading" size="small" @click="fetchStat(true)">重新检测</a-button>
      </template>

      <div class="storage">
        <!-- 中部：圆饼图（三态互斥：加载中 / 有数据 / 无数据，不会出现两层提示） -->
        <div class="storage__chart">
          <!-- 加载中：仅显示加载提示 -->
          <a-spin v-if="loading" class="storage__spin" tip="正在统计占用…" />
          <!-- 加载完成且有数据 -->
          <VChart v-else-if="!isEmpty" class="storage__echart" :option="option" autoresize />
          <!-- 加载完成但无数据 -->
          <div v-else class="storage__empty">暂无占用数据，点击右上角「重新检测」重试。</div>
        </div>

        <!-- 下部：明细表格 -->
        <a-table
          class="storage__table"
          :data="rows"
          :columns="[
            { title: '分类', slotName: 'category' },
            { title: '占用大小', slotName: 'size' },
            { title: '所在路径', slotName: 'path' },
          ]"
          :pagination="false"
          :bordered="false"
          size="small"
        >
          <template #category="{ record }">
            <span class="storage__cell-name">
              <span class="storage__dot" :style="{ background: record.color }" />
              {{ record.name }}
            </span>
          </template>
          <template #size="{ record }">
            <span class="storage__cell-size">{{ record.size }}</span>
          </template>
          <template #path="{ record }">
            <span v-if="record.path" class="storage__link" @click="openDir(record.path)">
              {{ record.path }}
            </span>
            <span v-else class="storage__muted">{{ record.key === 'output' ? '未设置输出目录' : '未获取到路径' }}</span>
          </template>
        </a-table>
      </div>
    </a-card>
  </a-form>
</template>

<style scoped>
/* 卡片内边距：与其他设置面板保持一致（标题栏 + 内容留白） */
.panel__card :deep(.arco-card-body) {
  padding: 12px 12px 8px;
}

.storage {
  width: 100%;
}

/* 中部：圆饼图居中、略靠上 */
.storage__chart {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 280px;
}

.storage__spin {
  display: flex;
  justify-content: center;
}

.storage__echart {
  width: 300px;
  height: 260px;
}

/* 无数据占位 */
.storage__empty {
  padding: 90px 0;
  text-align: center;
  color: var(--color-text-3);
}

/* 下部：表格 */
.storage__table {
  margin-top: 8px;
}

.storage__cell-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.storage__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.storage__cell-size {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-1);
}

.storage__link {
  color: var(--color-text-3);
  word-break: break-all;
  cursor: pointer;
}

.storage__link:hover {
  color: var(--color-link);
  text-decoration: underline;
}

.storage__muted {
  color: var(--color-text-4);
}
</style>