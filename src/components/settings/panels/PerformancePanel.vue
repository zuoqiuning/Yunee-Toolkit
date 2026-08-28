<!--
  设置面板：性能（转码资源）
  职责：硬件加速、编码线程、任务优先级。
  设计：
    - 使用 Arco Form + Card，分“硬件加速 / 资源占用”两张卡片；
    - 「硬件加速」卡片内嵌显卡检测区（GpuDetectCard）：
      检测到显卡后，不支持当前品牌的加速方案会灰置（如 NVIDIA 显卡下 AMD 置灰）；
      若当前选中的方案恰好被灰置，自动回退到推荐方案并提示。
  说明：这些是全局资源策略，不含各功能页具体的转换参数；日志级别已迁移到独立“日志”面板。
-->
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore, type HwAccel } from '@/stores/settings'
import { useHardwareStore } from '@/stores/hardware'
import { useCpuStore } from '@/stores/cpu'
import { highlight } from '@/utils/notify'
import { fitNumberInputWidth } from '@/utils/numberWidth'
import CardResetButton from '../common/CardResetButton.vue'
import GpuDetectCard from './performance/GpuDetectCard.vue'

const settings = useSettingsStore()
const hardware = useHardwareStore()
const cpu = useCpuStore()

// 进入面板时拉取启动阶段缓存的 CPU 信息（几乎即时返回）
onMounted(() => {
  cpu.fetch()
})

/** 值 → 显示文案 映射 */
const hwLabels: Record<string, string> = {
  auto: '自动',
  nvidia: 'NVIDIA',
  intel: 'Intel',
  amd: 'AMD',
  cpu: 'CPU',
}
const priorityLabels: Record<string, string> = {
  low: '低',
  normal: '普通',
  high: '高',
}

/**
 * 加速方案互斥灰置：
 * 仅当「已检测到显卡」时才启用限制 —— 检测出的品牌集合里没有某个品牌，则该品牌加速不可选；
 * 检测失败 / 无显卡信息时不做任何限制，保证纯 CPU 环境可用。
 */
const gpuDisabled = computed<Record<HwAccel, boolean>>(() => {
  const brands = new Set(hardware.gpus.map((g) => g.brand))
  const detected = hardware.loaded && hardware.gpus.length > 0
  return {
    auto: false,
    cpu: false,
    nvidia: detected && !brands.has('nvidia'),
    amd: detected && !brands.has('amd'),
    intel: detected && !brands.has('intel'),
  }
})

/**
 * 修正被灰置的当前选择：
 * 当显卡信息就绪且当前 hwAccel 恰好不可用时，自动回退为推荐方案并提示。
 * （回退后 hwAccel 变为可用值，不会再次触发，避免死循环）
 */
watch(
  () => [settings.hwAccel, hardware.loaded, hardware.gpus.length] as const,
  () => {
    if (gpuDisabled.value[settings.hwAccel as HwAccel]) {
      const target = hardware.recommended
      settings.hwAccel = target
      Notification.warning({
        content: highlight(`当前显卡不支持所选加速，已自动切换为「${hwLabels[target]}」。`),
      })
    }
  },
)

/** 加速方案卡片的辅助说明文案（随显卡检测结果动态变化） */
const hwExtra = computed(() => {
  if (!hardware.loaded || !hardware.gpus.length) return '优先使用的编码加速；纯 CPU 最稳定通用'
  const disabled = gpuDisabled.value
  const parts: string[] = []
  if (disabled.nvidia) parts.push('NVIDIA')
  if (disabled.amd) parts.push('AMD')
  if (disabled.intel) parts.push('Intel')
  if (parts.length) return `当前显卡不支持${parts.join(' / ')}加速，相关选项已置灰`
  return '检测到显卡，支持对应品牌的硬件加速'
})

/** 硬件加速方案变更反馈 */
function onHwChange(value: string | number | boolean) {
  Notification.success({
    content: highlight(`硬件加速已设为「${hwLabels[String(value)] ?? String(value)}」。`),
  })
}

/** 编码线程数变更反馈（空值 / 越界值自动归整） */
function onThreadsChange(value: number | undefined) {
  const n = normalizeThreads(value)
  settings.threadCount = n
  Notification.success({
    content: highlight(n === 0 ? '编码线程已设为「自动」。' : `编码线程已设为「${n}」核。`),
  })
}

/**
 * 编码线程数归一化：
 * a-input-number 清空时会回调 undefined，这里统一归 0（自动）；越界（负数/超过核数）收敛到合法区间。
 */
function normalizeThreads(value: number | undefined): number {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 0
  return Math.min(Math.max(Math.trunc(Number(value)), 0), cpu.maxThreads)
}

/** 兜底：输入框被清空时（v-model 回写 undefined）立即归 0，避免设置项变成非法值 */
watch(
  () => settings.threadCount,
  (v) => {
    if (v === undefined || v === null || Number.isNaN(Number(v))) {
      settings.threadCount = 0
    }
  },
)

/** 本机 CPU 展示文案（用于“编码线程数”辅助说明） */
const cpuDesc = computed(() => {
  const info = cpu.info
  if (!info) return ''
  return `${info.model} · ${info.physicalCores} 核 ${info.logicalCores} 线程`
})

/** “编码线程数”辅助说明：检测到 CPU 时给出型号与上限，否则保持通用文案 */
const threadExtra = computed(() =>
  cpu.info
    ? `本机 CPU：${cpuDesc.value}；0 表示自动，最大 ${cpu.maxThreads} 线程`
    : '0 表示由 FFmpeg 自动决定（推荐）',
)

/** 任务优先级变更反馈 */
function onPriorityChange(value: string | number | boolean) {
  Notification.success({
    content: highlight(`任务优先级已设为「${priorityLabels[String(value)] ?? String(value)}」。`),
  })
}

/** 复位“硬件加速”设置 */
function onResetHw() {
  settings.resetFields(['hwAccel'])
}

/** 复位“资源占用”设置 */
function onResetResources() {
  settings.resetFields(['threadCount', 'taskPriority'])
}
</script>

<template>
  <a-form class="panel__form" layout="horizontal" :model="settings">
    <!-- 硬件加速 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>硬件加速</template>
      <template #extra><CardResetButton name="硬件加速" @reset="onResetHw" /></template>

      <!-- 显卡检测区（性能面板顶部，启动阶段已检测完毕） -->
      <a-form-item label="显卡检测" extra="启动时自动探测，用于推荐加速方案">
        <GpuDetectCard />
      </a-form-item>

      <a-form-item label="加速方案" :extra="hwExtra">
        <a-space wrap>
          <a-radio-group v-model="settings.hwAccel" type="button" @change="onHwChange">
            <a-radio value="auto">自动</a-radio>
            <a-radio value="nvidia" :disabled="gpuDisabled.nvidia">NVIDIA</a-radio>
            <a-radio value="intel" :disabled="gpuDisabled.intel">Intel</a-radio>
            <a-radio value="amd" :disabled="gpuDisabled.amd">AMD</a-radio>
            <a-radio value="cpu">CPU</a-radio>
          </a-radio-group>
        </a-space>
      </a-form-item>
    </a-card>

    <!-- 资源占用 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>资源占用</template>
      <template #extra><CardResetButton name="资源占用" @reset="onResetResources" /></template>
      <a-form-item label="编码线程数" :extra="threadExtra">
        <a-input-number
          v-model="settings.threadCount"
          :min="0"
          :max="cpu.maxThreads"
          mode="button"
          :style="{ width: fitNumberInputWidth(settings.threadCount) }"
          @change="onThreadsChange"
        />
        <span class="threads__unit">核</span>
      </a-form-item>

      <a-form-item label="任务优先级" extra="影响转码进程在系统中的调度优先级">
        <a-space wrap>
          <a-radio-group v-model="settings.taskPriority" type="button" @change="onPriorityChange">
            <a-radio value="low">低</a-radio>
            <a-radio value="normal">普通</a-radio>
            <a-radio value="high">高</a-radio>
          </a-radio-group>
        </a-space>
      </a-form-item>
    </a-card>
  </a-form>
</template>

<style scoped>
.panel__card + .panel__card {
  margin-top: 12px;
}

.panel__card :deep(.arco-card-body) {
  padding: 8px 8px 0;
}

/* 编码线程数单位：置于输入框外侧，与其它面板（天/个）保持一致 */
.threads__unit {
  margin-left: 8px;
  color: var(--color-text-3);
}
</style>