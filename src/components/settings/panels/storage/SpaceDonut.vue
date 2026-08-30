<!--
  存储空间环形图 SpaceDonut
  职责：纯 SVG 自绘「磁盘占用环形图」（替代原 ECharts 饼图），展示各分区占用占比，
        支持分区悬浮高亮与中央信息切换；无任何第三方图表依赖，体积小、风格统一。

  设计说明：
    - 用圆环 stroke-dasharray + stroke-dashoffset 分段：每个分区一个 <circle>，
      整个 <svg> 旋转 -90° 使分段从顶部开始；
    - 中央信息用 HTML 覆盖层呈现（悬浮时显示分区大小/占比，否则显示总量），
      文本颜色走 Arco 主题变量，浅色/深色主题自适应；
    - 悬浮某段时该段增粗加亮，形成清晰聚焦；未勾选（visibleKeys 不含）的分区整段透明，
      但仍占位保持圆环比例；
    - 纯实现、无任何 emoji，分区色固定为 品牌蓝 / 青 / 橙（与旧图一致）。
-->
<script setup lang="ts">
import { computed, ref } from 'vue'

/** 单个分区的展示数据 */
export interface DonutSegment {
  /** 分区唯一标识（与图例/明细折叠项对应） */
  key: string
  /** 分区显示名（如“软件本身”） */
  name: string
  /** 分区主色（十六进制） */
  color: string
  /** 占用字节数 */
  value: number
}

/** 分区数据与可见集合（未勾选的分区透明隐藏但不改变分段比例） */
const props = withDefaults(
  defineProps<{
    /** 分区数据（value=0 的分区不渲染可见段） */
    segments: DonutSegment[]
    /** 处于「可见」状态的分区 key 集合 */
    visibleKeys?: string[]
  }>(),
  { visibleKeys: () => [] },
)

/** 当前悬浮的分区下标（-1 表示未悬浮，中央显示总量） */
const hoverIndex = ref(-1)

/** 全部分区总量（字节） */
const total = computed(() => props.segments.reduce((s, x) => s + x.value, 0))

/** 单分区占比（0-100，总量为 0 时返回 0） */
function percentOf(seg: DonutSegment): number {
  return total.value > 0 ? (seg.value / total.value) * 100 : 0
}

/** 字节 → 可读大小（B/KB/MB/GB，保留 1 位小数） */
function fmtSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const v = bytes / 1024 ** i
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

/**
 * 各分段的几何参数：pct=占比、start=起始占比（用于 dashoffset 错位）。
 * 累加计算起点，保证分段首尾相接。
 */
const arcs = computed(() => {
  let acc = 0
  return props.segments.map((seg) => {
    const pct = percentOf(seg)
    const start = acc
    acc += pct
    return { seg, pct, start }
  })
})

/** 圆环几何常量（viewBox 220×220，圆心 110,110，半径 78） */
const R = 78
const C = 2 * Math.PI * R

/** 中央展示内容：悬浮时显示分区信息，否则显示总量摘要 */
const center = computed(() => {
  const hov = hoverIndex.value >= 0 ? props.segments[hoverIndex.value] : null
  if (hov) {
    return {
      title: hov.name,
      value: fmtSize(hov.value),
      percent: `${percentOf(hov).toFixed(1)}%`,
    }
  }
  return { title: '占用磁盘', value: fmtSize(total.value), percent: '' }
})
</script>

<template>
  <!-- 环形图容器：鼠标移出整体时清除悬浮选中 -->
  <div class="donut" @mouseleave="hoverIndex = -1">
    <!-- 整图旋转 -90°：让分段从 12 点方向开始（中央信息为 HTML 覆盖层，不受旋转影响） -->
    <svg class="donut__svg" viewBox="0 0 220 220" aria-hidden="true">
      <!-- 轨道底环：浅灰细环占位，保证空数据时仍有环形轮廓 -->
      <circle class="donut__track" :cx="110" :cy="110" :r="R" />

      <!-- 分区段：一个 <circle> 一段，offset 累加实现首尾相接 -->
      <circle
        v-for="(a, i) in arcs"
        :key="a.seg.key"
        class="donut__seg"
        :class="{
          'donut__seg--hidden': !visibleKeys.includes(a.seg.key) || a.seg.value <= 0,
          'donut__seg--active': hoverIndex === i,
        }"
        :cx="110"
        :cy="110"
        :r="R"
        :stroke="a.seg.color"
        :stroke-dasharray="`${(a.pct / 100) * C} ${C}`"
        :stroke-dashoffset="-(a.start / 100) * C"
        @mouseenter="hoverIndex = i"
      />
    </svg>

    <!-- 中央信息覆盖层：悬浮分区（名称/大小/占比）或磁盘总量 -->
    <div class="donut__center">
      <div class="donut__center-title">{{ center.title }}</div>
      <div class="donut__center-value">{{ center.value }}</div>
      <div v-if="center.percent" class="donut__center-pct">{{ center.percent }}</div>
    </div>
  </div>
</template>

<style scoped>
/* 容器：相对定位撑起视觉区域，中央信息绝对居中 */
.donut {
  position: relative;
  width: 240px;
  height: 240px;
  margin: 0 auto;
}

/* SVG 环形：整图旋转 -90° 使分段从顶部开始 */
.donut__svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

/* 轨道底环：极浅的灰环，占位呈现环形轮廓 */
.donut__track {
  fill: none;
  stroke: var(--color-fill-3);
  stroke-width: 30;
  opacity: 0.45;
}

/* 分区段：填充式粗描边；宽度/透明度/亮度均做过渡，悬浮或入场时细腻变化 */
.donut__seg {
  fill: none;
  stroke-width: 30;
  transition:
    stroke-width 0.2s ease,
    opacity 0.2s ease,
    filter 0.2s ease;
}

/* 未勾选 / 零占比分区：透明隐藏（仍占位保持圆环比例） */
.donut__seg--hidden {
  opacity: 0;
  pointer-events: none;
}

/* 悬浮中的分区：增粗 + 提亮，形成清晰的视觉聚焦 */
.donut__seg--active {
  stroke-width: 40;
  filter: brightness(1.08);
  opacity: 1;
}

/* 圆形描边默认 round 会造成相邻分段重叠，这里用平头保证分段边缘干净 */
.donut__seg {
  stroke-linecap: butt;
}

/* 中央信息：绝对居中，pointer-events 放行给下层兄弟无关 */
.donut__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-align: center;
  pointer-events: none;
  user-select: none;
}

/* 中央标题：分区名 / “占用磁盘”，弱化处理 */
.donut__center-title {
  font-size: 13px;
  color: var(--color-text-3);
}

/* 中央主数值：等宽数字，醒目 */
.donut__center-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-1);
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

/* 中央占比：随主题弱化 */
.donut__center-pct {
  font-size: 12px;
  color: var(--color-text-3);
  font-variant-numeric: tabular-nums;
}
</style>