<!--
  视频转换视图 VideoConvertView
  职责：视频格式与编码参数转换 —— 组合「输入 / 参数 / 输出 / 任务」四个面板，
       负责输出路径的实时解析（命名预设 + 输出目录）与任务入队（含重名策略决策）。
  UI：采用「标题栏 + 内容区」卡片框架，四张卡片纵向排列，底部为「开始转换」主操作。
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Modal, Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'
import { useTasksStore } from '@/stores/tasks'
import { highlight } from '@/utils/notify'
import VideoInputPanel, { type PickedVideo } from './VideoInputPanel.vue'
import VideoParamsPanel from './VideoParamsPanel.vue'
import VideoOutputPanel from './VideoOutputPanel.vue'
import VideoTaskPanel from './VideoTaskPanel.vue'
import { defaultVideoParams, toConversionOptions, type VideoParams } from './types'

const settings = useSettingsStore()
const tasks = useTasksStore()

/** 输入文件（路径 + 媒体信息） */
const input = ref<PickedVideo | null>(null)
/** 转换参数（硬件加速默认跟随设置面板） */
const params = ref<VideoParams>({ ...defaultVideoParams(), hwaccel: settings.hwAccel })
/** 输出路径解析结果 */
const output = ref<ResolveOutputResult | null>(null)
/** 输出路径解析中 */
const resolvingOutput = ref(false)

/** 输入变化时清空输出预览 */
watch(
  input,
  () => {
    if (!input.value) output.value = null
  },
)

/** 输出路径依赖：输入文件 / 目标格式 / 输出目录 / 命名预设变化时重新解析 */
watch(
  [input, () => params.value.format, () => settings.outputDir, () => settings.fileNamePreset],
  () => void resolveOutput(),
)

/** 解析输出路径（主进程计算，含命名预设与重名存在标记） */
async function resolveOutput() {
  if (!input.value) {
    output.value = null
    return
  }
  resolvingOutput.value = true
  try {
    const r = await window.yuneeAPI?.resolveOutput({
      input: input.value.path,
      format: params.value.format,
      preset: settings.fileNamePreset,
      outputDir: settings.outputDir || undefined,
    })
    output.value = r ?? null
  } catch {
    output.value = null
  } finally {
    resolvingOutput.value = false
  }
}

/** 从路径提取文件名 */
function baseName(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/**
 * 开始转换：校验 → 按重名策略决策最终输出路径 → 入队。
 * 重名策略：自动改名 → 用不冲突路径；覆盖 → 直接覆盖；每次询问 → 已存在时弹窗让用户选择。
 */
async function start() {
  if (!input.value) {
    Notification.warning({ content: '请先选择要转换的视频文件。' })
    return
  }
  const resolved = output.value
  if (!resolved) {
    Notification.warning({ content: '输出路径尚未就绪，请稍后再试。' })
    return
  }

  let finalPath = resolved.path
  if (settings.overwritePolicy === 'autoRename') {
    finalPath = resolved.uniquePath
  } else if (settings.overwritePolicy === 'ask' && resolved.exists) {
    const action = await new Promise<'overwrite' | 'rename' | 'cancel'>((resolve) => {
      Modal.confirm({
        title: '输出文件已存在',
        content: `是否覆盖已有文件「${baseName(resolved.path)}」？`,
        okText: '覆盖',
        cancelText: '自动改名',
        onOk: () => resolve('overwrite'),
        onCancel: () => resolve('rename'),
        onClose: () => resolve('cancel'),
      })
    })
    if (action === 'cancel') return
    finalPath = action === 'rename' ? resolved.uniquePath : resolved.path
  }

  // 已关闭「保留源文件」：转换完成后会删除源文件（不可逆操作，需用户明确确认后再继续）
  if (!settings.keepSource) {
    const proceed = await new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: '删除源文件',
        content: '已开启「不保留源文件」，转换成功后源文件将被永久删除，确定继续吗？',
        okText: '确定删除',
        cancelText: '保留源文件',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
        onClose: () => resolve(false),
      })
    })
    if (!proceed) return
  }

  // 页面参数 → 主进程转换参数（线程数取自设置）；不保留源文件时附带删除标记
  const options = toConversionOptions(params.value, settings.threadCount)
  if (!settings.keepSource) options.deleteSource = true
  const task = await tasks.start({
    kind: 'video',
    input: input.value.path,
    output: finalPath,
    options,
    priority: settings.taskPriority,
  })

  if (task) {
    window.yuneeAPI?.logEvent(
      'video',
      '发起视频转换',
      `${baseName(input.value.path)} → ${baseName(finalPath)}`,
    )
    Notification.success({
      content: highlight(`已加入转换队列：${baseName(finalPath)}`),
      duration: 3000,
    })
  } else {
    Notification.error({ content: '任务入队失败，请检查输入文件与输出目录是否有效。' })
  }
}

/** 转换完成 → 按「完成后动作」设置打开输出目录、并按需提示源文件删除结果（仅本模块的视频任务） */
let disposeComplete: (() => void) | null = null

onMounted(() => {
  disposeComplete =
    window.yuneeAPI?.onMainEvent('conversion-complete', (payload) => {
    const { id, deletedSource } = payload as { id: string; deletedSource?: boolean }
    const t = tasks.tasks.find((x) => x.id === id)
    if (t && t.kind === 'video') {
      // 请求过删除源文件的任务：反馈删除结果（成功/失败的提示都有明确语义）
      if (t.options?.deleteSource) {
        Notification.success({
          content: highlight(deletedSource ? '转换完成，源文件已删除。' : '转换完成，但源文件删除失败，请手动清理。'),
        })
      }
      if (settings.completeAction === 'openFolder') {
        const parts = t.output.split(/[\\/]/)
        parts.pop()
        const dir = parts.join('\\') || t.output
        void window.yuneeAPI?.openDirectory(dir)
      }
    }
  }) ?? null
})

onBeforeUnmount(() => {
  disposeComplete?.()
})
</script>

<template>
  <div class="convert">
    <!-- 输入文件 -->
    <VideoInputPanel @change="(v) => (input = v)" />

    <!-- 转换参数 -->
    <VideoParamsPanel :params="params" />

    <!-- 输出位置 -->
    <VideoOutputPanel :output="output" :resolving="resolvingOutput" />

    <!-- 主操作 -->
    <div class="convert__actions">
      <a-button
        type="primary"
        size="large"
        :disabled="!input || resolvingOutput"
        @click="start"
      >
        开始转换
      </a-button>
    </div>

    <!-- 转换任务 -->
    <VideoTaskPanel />
  </div>
</template>

<style scoped>
.convert {
  padding: 24px 40px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 主操作按钮行：右对齐，与上方卡片留有间距 */
.convert__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
