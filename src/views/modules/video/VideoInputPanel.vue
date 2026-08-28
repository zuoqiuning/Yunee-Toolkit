<!--
  视频转换：输入文件面板 VideoInputPanel
  职责：选择输入视频（文件对话框 / 拖拽），探测媒体信息并上抛给父级。
  UI：采用「标题栏 + 内容区」卡片框架；无文件时为拖拽选择区，选中后展示文件信息与操作按钮。
-->
<script setup lang="ts">
import { ref } from 'vue'
import { Notification } from '@arco-design/web-vue'
import { highlight } from '@/utils/notify'

/** 已选中的输入视频 */
export interface PickedVideo {
  /** 文件绝对路径 */
  path: string
  /** 媒体信息（探测失败为 null） */
  info: MediaInfo | null
}

/** 事件：输入变化（null 表示已移除） */
const emit = defineEmits<{ (e: 'change', video: PickedVideo | null): void }>()

/** 拖拽悬停高亮 */
const dragging = ref(false)
/** 媒体信息探测中 */
const probing = ref(false)
/** 当前选中的文件 */
const picked = ref<PickedVideo | null>(null)

/** 文件选择对话框过滤：常见视频格式 */
const VIDEO_FILTERS = [
  {
    name: '视频文件',
    extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'ts', 'flv', 'wmv', 'mpeg', 'mpg', '3gp'],
  },
]

/** 从路径中提取文件名（兼容 Windows 的 \ 与 / 分隔符） */
function baseName(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** 弹出文件选择对话框 */
async function pickFile() {
  try {
    const file = await window.yuneeAPI?.selectFile(VIDEO_FILTERS)
    if (file) await selectVideo(file)
  } catch {
    Notification.error({ content: '无法弹出文件选择窗口。' })
  }
}

/** 统一处理选中文件：探测媒体信息 → 校验含视频流 → 上抛 */
async function selectVideo(path: string) {
  probing.value = true
  try {
    const info = (await window.yuneeAPI?.probeMedia(path)) ?? null
    if (!info) {
      Notification.warning({ content: '无法识别该文件，可能不是有效的视频文件。' })
      return
    }
    if (!info.hasVideo) {
      Notification.warning({ content: '该文件不含视频流，无法进行视频转换。' })
      return
    }
    picked.value = { path, info }
    emit('change', picked.value)
  } catch {
    Notification.error({ content: '媒体信息探测失败，请重试。' })
  } finally {
    probing.value = false
  }
}

/** 拖拽进入（高亮） */
function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragging.value = true
}

/** 拖拽离开（取消高亮） */
function onDragLeave(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
}

/** 阻止默认行为，否则文件会由浏览器打开 */
function onDragOver(e: DragEvent) {
  e.preventDefault()
}

/** 松开拖拽：取第一个文件接入（Electron 的 File 对象带 path 绝对路径属性） */
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
  const file = e.dataTransfer?.files?.[0] as (File & { path?: string }) | undefined
  if (file?.path) void selectVideo(file.path)
}

/** 移除当前选择 */
function clear() {
  picked.value = null
  emit('change', null)
}

/** 格式化时长：秒 → mm:ss 或 h:mm:ss */
function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '未知'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(r).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

/** 媒体信息 → 分辨率文案（无视频流返回空串） */
function resolutionText(info: MediaInfo | null): string {
  if (!info || !info.hasVideo || !info.width || !info.height) return ''
  return `${info.width}×${info.height}`
}
</script>

<template>
  <a-card class="panel__card" :bordered="true" size="small">
    <template #title>输入文件</template>

    <!-- 未选中：拖拽选择区 -->
    <div
      v-if="!picked"
      class="vinput__drop"
      :class="{ 'vinput__drop--active': dragging }"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @dragover="onDragOver"
      @drop="onDrop"
    >
      <!-- 内联 SVG 上传图标（遵循无 emoji、纯 SVG 规范） -->
      <svg class="vinput__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </svg>
      <div class="vinput__drop-text">
        将视频文件拖拽到此处，或
        <a-button type="primary" size="small" :loading="probing" @click="pickFile">选择文件</a-button>
      </div>
      <div class="vinput__drop-hint">支持 MP4 / MKV / AVI / MOV / WebM 等常见格式</div>
    </div>

    <!-- 已选中：文件信息 -->
    <div v-else class="vinput__file">
      <!-- 文件图标 + 名称 -->
      <div class="vinput__file-main">
        <svg class="vinput__file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 2h8l4 4v16H6z" />
          <path d="M14 2v4h4" />
        </svg>
        <div class="vinput__file-name" :title="picked.path">{{ baseName(picked.path) }}</div>
      </div>

      <!-- 媒体信息标签 -->
      <div class="vinput__info">
        <a-tag v-if="picked.info" color="arcoblue">时长 {{ formatDuration(picked.info.durationSec) }}</a-tag>
        <a-tag v-if="resolutionText(picked.info)" color="arcoblue">{{ resolutionText(picked.info) }}</a-tag>
        <a-tag v-if="picked.info?.videoCodec" color="gray">{{ picked.info.videoCodec }}</a-tag>
        <a-tag v-if="picked.info?.audioCodec" color="gray">{{ picked.info.audioCodec }}</a-tag>
      </div>

      <!-- 操作 -->
      <div class="vinput__actions">
        <a-button size="small" :loading="probing" @click="pickFile">重新选择</a-button>
        <a-button size="small" status="danger" @click="clear">移除</a-button>
      </div>
    </div>
  </a-card>
</template>

<style scoped>
/* 拖拽选择区：虚线描边 + 悬停高亮 */
.vinput__drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 32px 16px;
  border: 1.5px dashed var(--color-border-3);
  border-radius: 10px;
  background: var(--color-fill-1);
  transition: border-color 0.2s ease, background-color 0.2s ease;
  cursor: pointer;
}

.vinput__drop--active {
  border-color: var(--color-primary-6);
  background: var(--color-primary-1);
}

.vinput__icon {
  width: 40px;
  height: 40px;
  color: var(--color-text-3);
}

.vinput__drop-text {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-2);
}

.vinput__drop-hint {
  font-size: 12px;
  color: var(--color-text-4);
}

/* 已选中：主信息行 + 信息标签 + 操作按钮 */
.vinput__file {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.vinput__file-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.vinput__file-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  color: var(--color-primary-6);
}

.vinput__file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vinput__info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.vinput__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
