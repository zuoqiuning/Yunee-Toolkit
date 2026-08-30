<!--
  视频转换：任务面板 VideoTaskPanel
  职责：展示本模块的视频转换任务（来自全局任务 Store），含状态标签、进度、实时速度与取消/打开输出等操作。
  UI：采用「标题栏 + 内容区」卡片框架；任务按创建顺序展示（串行队列，正在执行的在最上方）。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { Notification } from '@arco-design/web-vue'
import { useTasksStore } from '@/stores/tasks'

const tasks = useTasksStore()

/** 只展示视频转换任务 */
const videoTasks = computed(() =>
  tasks.tasks.filter((t) => t.kind === 'video').sort((a, b) => a.createdAt - b.createdAt),
)

/** 状态 → 标签文案与颜色 */
const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'arcoblue' },
  running: { label: '转换中', color: 'gold' },
  completed: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
  aborted: { label: '已取消', color: 'gray' },
}

/** 从路径提取文件名 */
function baseName(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** 取消任务 */
async function onCancel(id: string) {
  const ok = await tasks.cancel(id)
  if (!ok) Notification.warning({ content: '该任务已结束，无法取消。' })
}

/** 打开已完成任务的输出目录 */
async function onOpenOutput(output: string) {
  const parts = output.split(/[\\/]/)
  parts.pop()
  const dir = parts.join('\\') || output
  const ok = await window.yuneeAPI?.openDirectory(dir)
  if (!ok) Notification.warning({ content: '无法打开输出目录，请检查文件是否仍存在。' })
}

/** 清理全部已结束任务 */
async function onClear() {
  const n = await tasks.clearFinished()
  if (n) Notification.success({ content: `已清理 ${n} 个已结束任务。` })
  else Notification.warning({ content: '当前没有可清理的已结束任务。' })
}

/** 运行中的实时信息文案 */
function runningInfo(t: ConversionTask): string {
  const parts: string[] = []
  if (t.progress.speed) parts.push(t.progress.speed)
  if (t.progress.fps > 0) parts.push(`${t.progress.fps} fps`)
  if (t.progress.bitrate) parts.push(t.progress.bitrate)
  return parts.join(' · ')
}
</script>

<template>
  <a-card class="panel__card" :bordered="true" size="small">
    <template #title>转换任务</template>
    <template #extra>
      <a-button size="mini" @click="onClear">清理已结束</a-button>
    </template>

    <!-- 空状态 -->
    <div v-if="!videoTasks.length" class="vtask__empty">暂无转换任务，选择文件后点击「开始转换」即可加入队列。</div>

    <!-- 任务列表 -->
    <div v-else class="vtask__list">
      <div v-for="t in videoTasks" :key="t.id" class="vtask__item" :class="{ 'vtask__item--running': t.status === 'running' }">
        <!-- 首行：输入 → 输出 + 状态标签 + 操作 -->
        <div class="vtask__head">
          <div class="vtask__name" :title="`${t.input} → ${t.output}`">
            <span class="vtask__in">{{ baseName(t.input) }}</span>
            <span class="vtask__arrow">→</span>
            <span class="vtask__out">{{ baseName(t.output) }}</span>
          </div>
          <div class="vtask__side">
            <a-tag :color="STATUS_META[t.status].color" size="small">{{ STATUS_META[t.status].label }}</a-tag>
            <a-button
              v-if="t.status === 'running' || t.status === 'queued'"
              size="mini"
              status="danger"
              @click="onCancel(t.id)"
            >
              取消
            </a-button>
            <a-button v-else-if="t.status === 'completed'" size="mini" @click="onOpenOutput(t.output)">
              打开输出
            </a-button>
            <a-tooltip v-else-if="t.status === 'failed' && t.error" :content="t.error" position="top">
              <a-button size="mini">查看原因</a-button>
            </a-tooltip>
          </div>
        </div>

        <!-- 进度条 + 实时信息 -->
        <div v-if="t.status === 'running' || t.status === 'queued'" class="vtask__progress">
          <a-progress
            :percent="t.status === 'running' ? Math.round(t.progress.percent) : 0"
            :status="t.status === 'running' ? 'normal' : undefined"
            style="flex: 1"
          />
          <span v-if="runningInfo(t)" class="vtask__info">{{ runningInfo(t) }}</span>
          <span v-else-if="t.status === 'running'" class="vtask__info">处理中…</span>
        </div>
      </div>
    </div>
  </a-card>
</template>

<style scoped>
.vtask__empty {
  padding: 24px 8px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-4);
}

.vtask__item {
  padding: 12px 4px;
  border-radius: 6px;
  /* 普通状态下的左侧描边隐藏，运行中才显形（避免宽度跳动） */
  border-left: 3px solid transparent;
  transition: background-color 0.25s ease, border-color 0.25s ease;
}

/* 运行中的任务：主色左边条 + 浅色底，突出「正在转换」的视觉重心 */
.vtask__item--running {
  border-left-color: var(--color-primary-6);
  background: var(--color-primary-1);
}

.vtask__item + .vtask__item {
  border-top: 1px solid var(--color-border-2);
}

.vtask__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.vtask__name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-2);
  overflow: hidden;
}

.vtask__in,
.vtask__out {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vtask__out {
  color: var(--color-text-1);
  font-weight: 500;
}

.vtask__arrow {
  flex-shrink: 0;
  color: var(--color-text-4);
}

.vtask__side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.vtask__progress {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.vtask__info {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-3);
  white-space: nowrap;
}
</style>
