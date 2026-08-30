<!--
  视频转换：输出位置面板 VideoOutputPanel
  职责：展示转换输出位置（默认输出目录或与源文件同目录）、输出文件名预览与重名策略说明。
  UI：采用「标题栏 + 内容区」卡片框架；目录选择复用设置面板的交互（对话框选择 + 打开）。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'
import { highlight } from '@/utils/notify'
import HintText from '@/components/common/HintText.vue'

/** 输出路径解析结果（主进程返回） */
const props = defineProps<{
  /** 解析结果；未选择输入时为 null */
  output: ResolveOutputResult | null
  /** 正在解析输出路径 */
  resolving: boolean
}>()

const settings = useSettingsStore()

/** 输出目录文案：设置过则显示，否则为「与源文件同目录」 */
const dirText = computed(() => settings.outputDir || '与源文件同目录')

/** 重名策略文案 */
const policyText = computed(() => {
  switch (settings.overwritePolicy) {
    case 'autoRename':
      return '重名时自动改名'
    case 'overwrite':
      return '重名时直接覆盖'
    case 'ask':
      return '重名时每次询问'
    default:
      return ''
  }
})

/** 从输出路径提取文件名 */
function baseName(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** 弹出目录选择框，写入默认输出目录 */
async function pickDir() {
  try {
    const dir = await window.yuneeAPI?.selectDirectory()
    if (dir) {
      settings.outputDir = dir
      Notification.success({
        content: highlight(`输出目录已设为「${dir}」。`),
      })
    }
  } catch {
    Notification.error({ content: '无法弹出目录选择窗口。' })
  }
}

/** 在系统文件管理器中打开输出目录 */
async function openDir() {
  if (!settings.outputDir) {
    // 与源文件同目录：无法固定打开，提示用户先设置
    Notification.warning({ content: '当前为“与源文件同目录”，请先设置输出目录。' })
    return
  }
  const ok = await window.yuneeAPI?.openDirectory(settings.outputDir)
  if (!ok) Notification.warning({ content: '无法打开该目录，请检查是否仍存在。' })
}
</script>

<template>
  <a-card class="panel__card" :bordered="true" size="small">
    <template #title>输出位置</template>
    <a-form class="panel__form" layout="horizontal" :model="settings">
      <a-form-item label="输出目录">
        <a-input-group class="panel__dir-group">
          <a-input :model-value="dirText" readonly disabled />
          <a-button @click="openDir">打开</a-button>
          <a-button type="primary" @click="pickDir">更改</a-button>
        </a-input-group>
        <template #extra>
          <HintText>留空表示与源文件同目录</HintText>
        </template>
      </a-form-item>

      <a-form-item label="输出文件">
        <div class="voutput__file">
          <a-spin :loading="resolving" :size="14">
            <a-input
              :model-value="output ? baseName(output.path) : '请先选择输入文件'"
              readonly
              disabled
              style="width: 360px"
            />
          </a-spin>
          <a-tag v-if="output?.exists" color="orange">已存在</a-tag>
          <a-tag color="gray">{{ policyText }}</a-tag>
        </div>
        <template #extra>
          <HintText>文件名按「命名预设」自动生成</HintText>
        </template>
      </a-form-item>
    </a-form>
  </a-card>
</template>

<style scoped>
.voutput__file {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 设置项名称与右侧控件垂直居中，与设置弹窗面板保持一致 */
.panel__form :deep(.arco-form-item) {
  align-items: center;
}
</style>
