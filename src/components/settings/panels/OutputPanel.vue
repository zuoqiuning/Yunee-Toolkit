<!--
  设置面板：输出（目录与文件行为）
  职责：默认输出目录、文件重名策略、完成动作、保留源文件；临时文件目录与管理；数据存储路径（只读）。
  设计：使用 Arco Form + Card，分“输出位置 / 文件行为 / 临时文件 / 数据存储”四张卡片。
    - 目录选择通过主进程弹出系统目录对话框。
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'
import { highlight } from '@/utils/notify'
import CardResetButton from '../common/CardResetButton.vue'

const settings = useSettingsStore()

// 用户数据目录（只读展示）
const dataDir = ref('')
// 清理按钮 loading
const cleaning = ref(false)

/** 弹出目录选择框，选中后写入默认输出目录并通知 */
async function pickDir() {
  try {
    const dir = await window.yuneeAPI?.selectDirectory()
    if (dir) {
      settings.outputDir = dir
      Notification.success({
        content: highlight(`默认输出目录已设为「${dir}」。`),
      })
    }
  } catch {
    Notification.error({ content: '无法弹出目录选择窗口。' })
  }
}

/** 在系统文件管理器中打开指定目录 */
async function openDir(dir: string) {
  if (!dir) {
    Notification.warning({ content: '当前为“与源文件同目录”或尚未设置，暂无可打开的固定位置。' })
    return
  }
  const ok = await window.yuneeAPI?.openDirectory(dir)
  if (!ok) Notification.warning({ content: '无法打开该目录，请检查是否仍存在。' })
}

/** 选择临时文件目录 */
async function pickTempDir() {
  try {
    const dir = await window.yuneeAPI?.selectDirectory()
    if (dir) {
      settings.tempDir = dir
      Notification.success({
        content: highlight(`临时目录已设为「${dir}」。`),
      })
    }
  } catch {
    Notification.error({ content: '无法弹出目录选择窗口。' })
  }
}

/** 读取“用户数据目录”信息（只读展示） */
async function fetchDataDir() {
  try {
    const info = await window.yuneeAPI?.getDataDir()
    if (info) dataDir.value = info.path
  } catch {
    // 预览环境忽略
  }
}

/** 立即清理临时目录 */
async function cleanNow() {
  if (!settings.tempDir) {
    Notification.warning({ content: '请先在“临时目录”中选择一个目录。' })
    return
  }
  cleaning.value = true
  try {
    const ok = await window.yuneeAPI?.cleanTempDir(settings.tempDir)
    if (ok) Notification.success({ content: '临时文件已清理。' })
    else Notification.warning({ content: '目录不存在或为空。' })
  } catch {
    Notification.error({ content: '清理时发生异常。' })
  } finally {
    cleaning.value = false
  }
}

/** 文件行为值 → 显示文案映射 */
const overwriteLabels: Record<string, string> = {
  autoRename: '自动改名',
  overwrite: '覆盖',
  ask: '每次询问',
}
const completeLabels: Record<string, string> = {
  openFolder: '打开输出目录',
  none: '不做任何操作',
}

/** 重名策略变更反馈 */
function onOverwriteChange(value: string | number | boolean) {
  const label = overwriteLabels[String(value)] ?? String(value)
  Notification.success({
    content: highlight(`文件重名策略已设为「${label}」。`),
  })
}

/** 完成后动作变更反馈 */
function onCompleteActionChange(value: unknown) {
  const label = completeLabels[String(value)] ?? String(value)
  Notification.success({
    content: highlight(`转换完成后将「${label}」。`),
  })
}

/** 保留源文件变更反馈 */
function onKeepSourceChange(value: string | number | boolean) {
  Notification.success({
    content: highlight(value ? '已「开启」保留源文件。' : '已「关闭」保留源文件。'),
  })
}

/** 自动清理开关变更反馈 */
function onAutoCleanChange(value: string | number | boolean) {
  Notification.success({
    content: highlight(value ? '已「开启」自动清理临时文件。' : '已「关闭」自动清理临时文件。'),
  })
}

/** 保留天数变更反馈（空值自动回默认 7 天，避免设置项变成非法值） */
function onRetainDaysChange(value: number | undefined) {
  const n = normalizeRetainDays(value)
  settings.cleanRetainDays = n
  Notification.success({
    content: highlight(`临时文件将保留「${n}」天后自动清理。`),
  })
}

/**
 * 保留天数归一化：
 * a-input-number 清空时会回调 undefined，这里统一回默认值 7；越界（负数/超出 365）收敛到合法区间。
 */
function normalizeRetainDays(value: number | undefined): number {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 7
  return Math.min(Math.max(Math.trunc(Number(value)), 0), 365)
}

/** 复位“输出位置”设置 */
function onResetLocation() {
  settings.resetFields(['outputDir'])
}

/** 复位“文件行为”设置 */
function onResetBehavior() {
  settings.resetFields(['overwritePolicy', 'completeAction', 'keepSource'])
}

/** 复位“临时文件”设置 */
function onResetTemp() {
  settings.resetFields(['tempDir', 'autoCleanTemp', 'cleanRetainDays'])
}

onMounted(fetchDataDir)
</script>

<template>
  <a-form class="panel__form" layout="horizontal" :model="settings">
    <!-- 输出位置 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>输出位置</template>
      <template #extra><CardResetButton name="输出位置" @reset="onResetLocation" /></template>
      <a-form-item label="默认输出目录" extra="未单独指定时输出到哪里；留空表示与源文件同目录">
        <a-popover
          v-if="settings.outputDir"
          position="bottom"
          :content="settings.outputDir"
        >
          <a-input-group class="panel__dir-group">
            <a-input :model-value="settings.outputDir" readonly disabled />
            <a-button @click="openDir(settings.outputDir)">打开</a-button>
            <a-button type="primary" @click="pickDir">更改</a-button>
          </a-input-group>
        </a-popover>
        <a-input-group v-else class="panel__dir-group">
          <a-input :model-value="'与源文件同目录'" readonly disabled />
          <a-button @click="openDir(settings.outputDir)">打开</a-button>
          <a-button type="primary" @click="pickDir">更改</a-button>
        </a-input-group>
      </a-form-item>
    </a-card>

    <!-- 文件行为 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>文件行为</template>
      <template #extra><CardResetButton name="文件行为" @reset="onResetBehavior" /></template>
      <a-form-item label="文件重名策略" extra="输出文件与已有文件重名时的处理方式">
        <a-space wrap>
          <a-radio-group v-model="settings.overwritePolicy" type="button" @change="onOverwriteChange">
            <a-radio value="autoRename">自动改名</a-radio>
            <a-radio value="overwrite">覆盖</a-radio>
            <a-radio value="ask">每次询问</a-radio>
          </a-radio-group>
        </a-space>
      </a-form-item>

      <a-form-item label="转换完成后" extra="任务结束后自动执行的动作">
        <a-select v-model="settings.completeAction" style="width: 220px" @change="onCompleteActionChange">
          <a-option value="openFolder">打开输出目录</a-option>
          <a-option value="none">不做任何操作</a-option>
        </a-select>
      </a-form-item>

      <a-form-item label="保留源文件" extra="转换 / 提取完成后是否删除源文件">
        <a-switch v-model="settings.keepSource" @change="onKeepSourceChange" />
      </a-form-item>
    </a-card>

    <!-- 临时文件 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>临时文件</template>
      <template #extra><CardResetButton name="临时文件" @reset="onResetTemp" /></template>
      <a-form-item label="临时目录" extra="大型转换时的中间文件存放位置；留空使用系统默认">
        <a-popover
          v-if="settings.tempDir"
          position="bottom"
          :content="settings.tempDir"
        >
          <a-input-group class="panel__dir-group">
            <a-input :model-value="settings.tempDir" readonly disabled />
            <a-button @click="openDir(settings.tempDir)">打开</a-button>
            <a-button type="primary" @click="pickTempDir">更改</a-button>
          </a-input-group>
        </a-popover>
        <a-input-group v-else class="panel__dir-group">
          <a-input :model-value="'系统默认临时目录'" readonly disabled />
          <a-button @click="openDir(settings.tempDir)">打开</a-button>
          <a-button type="primary" @click="pickTempDir">更改</a-button>
        </a-input-group>
      </a-form-item>

      <a-form-item label="自动清理" extra="转换结束后自动清理临时文件，保持磁盘整洁">
        <a-switch v-model="settings.autoCleanTemp" @change="onAutoCleanChange" />
      </a-form-item>

      <a-form-item v-if="settings.autoCleanTemp" label="保留天数" extra="临时文件保留超过该天数后自动删除">
        <a-input-number
          v-model="settings.cleanRetainDays"
          :min="0"
          :max="365"
          style="width: 140px"
          @change="onRetainDaysChange"
        >
          <template #suffix>天</template>
        </a-input-number>
      </a-form-item>

      <a-form-item label="立即清理" extra="删除当前临时目录下的所有文件">
        <a-button :loading="cleaning" status="danger" @click="cleanNow">清理</a-button>
      </a-form-item>
    </a-card>

    <!-- 数据存储（只读） -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>数据存储</template>
      <a-form-item
        label="数据存储目录"
        extra="存放设置与各项参数；开发模式存于项目 data 文件夹，安装版存于系统用户数据目录"
      >
        <a-popover :content="dataDir" position="bottom">
          <a-input-group class="panel__dir-group">
            <a-input :model-value="dataDir || '正在获取…'" readonly disabled />
            <a-button @click="openDir(dataDir)">打开</a-button>
          </a-input-group>
        </a-popover>
      </a-form-item>
    </a-card>
  </a-form>
</template>

<style scoped>
.panel__card + .panel__card {
  margin-top: 16px;
}

.panel__card :deep(.arco-card-body) {
  padding: 8px 8px 0;
}
</style>