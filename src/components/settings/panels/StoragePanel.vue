<!--
  设置面板：存储（磁盘占用概览）
  职责：用简约圆饼图展示“软件本身 / 工具目录 / 输出目录”占比，下方用折叠面板列出各占用明细。
  设计：
    - 与其他设置面板一致：卡片框架，标题栏 + 右上角“重新检测”按钮；
    - 卡片内为居中的圆饼图（加载时显示 Arco Spin 骨架），图表文字/提示框颜色随主题深浅适配；
    - 饼图图例由 Arco 复选框自绘：取消勾选即关闭该项占比（整块透明隐藏，仍占位保持圆环比例）；
    - 下部 Arco 折叠面板默认全部折叠，标题行显示各项占比百分比，展开后显示占用大小与所在路径（路径可点击打开）。
    - 数据来自主进程 storage:get-space-stat（递归统计目录占用）。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'

// 按需注册 ECharts 模块（仅饼图 + Canvas 渲染器 + 提示；图例改由 Arco 复选框自绘，不再注册 LegendComponent）
use([CanvasRenderer, PieChart, TooltipComponent])

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

/**
 * 当前生效主题是否深色（与 App.vue 规则一致）：
 * 「跟随系统」时取系统偏好，否则取手动主题。用于给 ECharts 内部文字/提示框配色，
 * 避免深色模式下图表介绍文字颜色对比不足而看不清。
 */
const isDark = computed(() =>
  settings.themeFollowSystem
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
    : settings.theme === 'dark',
)

/** 三个占用分类的静态元信息（key 同时作为复选框值与折叠面板项的标识） */
const pieKeys = [
  { key: 'app', name: '软件本身', color: '#165dff' },
  { key: 'tools', name: '工具目录', color: '#14c9c9' },
  { key: 'output', name: '输出目录', color: '#ff7d00' },
]

/** 饼图中被「勾选显示」的分类；取消勾选即关闭该项占比（Arco 复选框组自绘图例） */
const visibleKeys = ref<string[]>(['app', 'tools', 'output'])

/** 分类 key → 占用字节 的映射，供饼图与明细行统一取数 */
const sizeMap = computed<Record<string, number>>(() => ({
  app: appSize.value,
  tools: toolsSize.value,
  output: outputSize.value,
}))

/** 全部占用字节总和（用于计算占比） */
const totalBytes = computed(() => appSize.value + toolsSize.value + outputSize.value)

/** 某项占用占总量的百分比（基于全部三项，客观占比，不随图表显隐变化） */
function percentOf(bytes: number): string {
  return totalBytes.value > 0 ? `${((bytes / totalBytes.value) * 100).toFixed(1)}%` : '0.0%'
}

/** 各块字节数是否全为 0（未取到数据） */
const isEmpty = computed(
  () => appSize.value === 0 && toolsSize.value === 0 && outputSize.value === 0,
)

/** 饼图配置：随占用数据与主题响应式更新；简约样式，无轮廓线，图例由 Arco 复选框自绘 */
const option = computed(() => ({
  tooltip: {
    trigger: 'item',
    // 深色模式下提示框使用深底浅字，保证可读性
    backgroundColor: isDark.value ? '#1d2129' : '#ffffff',
    borderColor: isDark.value ? 'rgba(229,230,235,0.2)' : '#e5e6eb',
    textStyle: { color: isDark.value ? '#e5e6eb' : '#4e5969' },
    formatter: (p: { name: string; value: number; percent: string }) =>
      `${p.name}：${fmtSize(Number(p.value))}（${p.percent}%）`,
  },
  series: [
    {
      name: '磁盘占用',
      type: 'pie',
      radius: ['40%', '66%'],
      // 三个数据项对应 Arco 主题色：蓝 / 青 / 橙
      color: ['#165dff', '#14c9c9', '#ff7d00'],
      // 标签文字与引导线颜色随主题适配：深色用浅色、浅色用深色，避免深色下看不清
      label: {
        formatter: '{b}\n{d}%',
        color: isDark.value ? '#e5e6eb' : '#4e5969',
      },
      labelLine: {
        length: 14,
        length2: 10,
        lineStyle: { color: isDark.value ? 'rgba(229,230,235,0.45)' : '#a9aeb8' },
      },
      data: pieKeys.map((it) => {
        const visible = visibleKeys.value.includes(it.key)
        return {
          value: sizeMap.value[it.key],
          name: it.name,
          // 取消勾选的项整块透明隐藏（仍占位保持圆环比例），标签/引导线/提示一并关闭
          itemStyle: { opacity: visible ? 1 : 0 },
          label: { show: visible },
          labelLine: { show: visible },
          tooltip: { show: visible },
        }
      }),
    },
  ],
}))

/** 折叠面板明细数据：汇总三块占用，响应式更新（含占比 / 大小 / 路径） */
const rows = computed(() =>
  pieKeys.map((it) => ({
    key: it.key,
    name: it.name,
    color: it.color,
    size: fmtSize(sizeMap.value[it.key]),
    percent: percentOf(sizeMap.value[it.key]),
    path:
      it.key === 'app' ? appDir.value : it.key === 'tools' ? toolsDir.value : outputDir.value,
    pathHint: it.key === 'output' ? '未设置输出目录' : '未获取到路径',
  })),
)

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
  <!-- 与其他设置面板一致的卡片框架：外层包裹卡片 + 内容区 -->
  <a-form class="panel__form" layout="horizontal" :model="{}">
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>磁盘占用概览</template>
      <template #extra>
        <a-button :loading="loading" size="small" @click="fetchStat(true)">重新检测</a-button>
      </template>

      <div class="storage">
        <!-- 中部：圆饼图 + 底部“占比显示开关”（Arco 复选框自绘图例，替代 ECharts 原生图例） -->
        <div class="storage__chart">
          <!-- 加载中：仅显示加载提示 -->
          <a-spin v-if="loading" class="storage__spin" tip="正在统计占用…" />
          <template v-else>
            <!-- 加载完成且有数据 -->
            <VChart v-if="!isEmpty" class="storage__echart" :option="option" autoresize />
            <!-- 加载完成但无数据 -->
            <div v-else class="storage__empty">暂无占用数据，点击右上角「重新检测」重试。</div>
            <!-- 底部：复选框控制各项占比显隐（有数据时才显示） -->
            <a-checkbox-group v-if="!isEmpty" v-model="visibleKeys" class="storage__legend">
              <a-checkbox v-for="it in pieKeys" :key="it.key" :value="it.key">
                <span class="storage__legend-item">
                  <span class="storage__dot" :style="{ background: it.color }" />
                  {{ it.name }}
                </span>
              </a-checkbox>
            </a-checkbox-group>
          </template>
        </div>

        <!-- 下部：明细折叠面板（默认全部折叠；标题行显示占比，展开显示大小与路径） -->
        <a-collapse class="storage__collapse" :default-active-key="[]">
          <a-collapse-item v-for="row in rows" :key="row.key" :name="row.key">
            <template #header>
              <span class="storage__cell-name">
                <span class="storage__dot" :style="{ background: row.color }" />
                {{ row.name }}
                <span class="storage__pct">{{ row.percent }}</span>
              </span>
            </template>
            <div class="storage__detail">
              <div class="storage__detail-row">
                <span class="storage__detail-label">占用大小</span>
                <span class="storage__detail-value">{{ row.size }}（{{ row.percent }}）</span>
              </div>
              <div class="storage__detail-row">
                <span class="storage__detail-label">所在路径</span>
                <span v-if="row.path" class="storage__link" @click="openDir(row.path)">
                  {{ row.path }}
                </span>
                <span v-else class="storage__muted">{{ row.pathHint }}</span>
              </div>
            </div>
          </a-collapse-item>
        </a-collapse>
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

/* 中部：圆饼图纵向排列 —— 上方图表 + 底部“占比显示开关”复选框 */
.storage__chart {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 300px;
}

.storage__spin {
  display: flex;
  justify-content: center;
}

.storage__echart {
  width: 300px;
  height: 240px;
}

/* 无数据占位 */
.storage__empty {
  padding: 80px 0;
  text-align: center;
  color: var(--color-text-3);
}

/* 底部复选框（自绘图例）：水平居中、与饼图留白 */
.storage__legend {
  margin-top: 4px;
}

.storage__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 下部：明细折叠面板（默认全部折叠） */
.storage__collapse {
  margin-top: 4px;
}

/* 折叠面板标题行：色点 + 名称 + 占比，左对齐 */
.storage__cell-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-1);
}

/* 占比百分比：灰色弱化，等宽数字对齐 */
.storage__pct {
  margin-left: 2px;
  color: var(--color-text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.storage__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 展开详情：标签 + 值 两行式布局 */
.storage__detail {
  padding: 2px 0 4px;
}

.storage__detail-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.storage__detail-label {
  flex-shrink: 0;
  width: 72px;
  color: var(--color-text-3);
  font-size: 13px;
}

.storage__detail-value {
  color: var(--color-text-1);
  font-variant-numeric: tabular-nums;
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