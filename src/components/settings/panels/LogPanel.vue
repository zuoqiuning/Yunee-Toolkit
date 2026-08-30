<!--
  设置面板：日志
  职责：日志存储目录、日志输出（固定调试级全量记录）与日志自动清理规则设置。
  设计：
    - 日志存储：选择/打开日志目录（留空使用默认目录）。
  - 日志输出：固定为「调试（全量记录）」，不再提供档位选择，便于排查错误与 BUG。
  - 日志清理：保留天数 + 文件数量上限双规则，超限自动清理；可一键立即清理。
  - 日志查看：应用内直接查看各日期日志文件（复用关于页协议模态框的排版风格）。
  说明：清理规则与目录通过 App.vue 实时同步到主进程，切换即生效。
-->
<script setup lang="ts">
import { ref } from 'vue'
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'
import { highlight } from '@/utils/notify'
import { fitNumberInputWidth } from '@/utils/numberWidth'
import HintText from '@/components/common/HintText.vue'
import CardResetButton from '../common/CardResetButton.vue'

const settings = useSettingsStore()

/** 立即清理按钮的加载态 */
const cleaning = ref(false)

// —— 日志在线查看模态框状态 ——
const viewerVisible = ref(false)
/** 日志文件列表（按日期倒序） */
const logFiles = ref<LogFileInfo[]>([])
/** 当前选中的日志文件名 */
const selectedName = ref('')
/** 日志内容 */
const logContent = ref('')
/** 列表/内容加载中 */
const viewerLoading = ref(false)

/** 今天的日期键（YYYY-MM-DD，用于默认选中今天日志） */
function todayKey(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 打开日志查看模态框并加载列表 */
async function openViewer() {
  viewerVisible.value = true
  await refreshLogs()
}

/** 刷新日志列表：拉取列表 → 默认选中今天 → 读取内容 */
async function refreshLogs() {
  viewerLoading.value = true
  try {
    const list = (await window.yuneeAPI?.listLogs()) ?? []
    logFiles.value = list
    // 优先保持当前选择；否则默认选中今天的日志（列表已按日期倒序，第一个即最新）
    if (!list.some((f) => f.name === selectedName.value)) {
      selectedName.value =
        list.find((f) => f.date === todayKey())?.name ?? list[0]?.name ?? ''
    }
    await loadContent()
  } catch {
    logContent.value = '日志列表加载失败，请稍后重试。'
  } finally {
    viewerLoading.value = false
  }
}

/** 读取当前选中日志文件的内容 */
async function loadContent() {
  if (!selectedName.value) {
    logContent.value = '暂无日志文件，运行一段时间后会自动生成。'
    return
  }
  viewerLoading.value = true
  try {
    const text = (await window.yuneeAPI?.readLog(selectedName.value)) ?? ''
    logContent.value = text || '（该文件为空）'
  } catch {
    logContent.value = '日志内容读取失败，请稍后重试。'
  } finally {
    viewerLoading.value = false
  }
}

/** 切换选中日志文件 */
function onSelectLog(name: string | number) {
  selectedName.value = String(name)
  void loadContent()
}

/** 弹出目录选择框，选中后写入日志目录并通知（目录变化会自动同步主进程） */
async function pickLogDir() {
  try {
    const dir = await window.yuneeAPI?.selectDirectory()
    if (dir) {
      settings.logDir = dir
      Notification.success({
        content: highlight(`日志目录已设为「${dir}」。`),
      })
    }
  } catch {
    Notification.error({ content: '无法弹出目录选择窗口。' })
  }
}

/** 在系统文件管理器中打开日志目录 */
async function openLogDir() {
  if (!settings.logDir) {
    Notification.warning({ content: '尚未设置日志目录，暂无可打开的固定位置。' })
    return
  }
  const ok = await window.yuneeAPI?.openDirectory(settings.logDir)
  if (!ok) Notification.warning({ content: '无法打开该目录，请检查是否仍存在。' })
}

/** 数值收敛：空值/越界回退默认（保留天数默认 7），非法一律钳制到 [1, 365]，并通知反馈 */
function onRetainChange(v: number | undefined) {
  const n = Math.trunc(Number(v))
  const days = Number.isFinite(n) && n > 0 ? Math.min(365, Math.max(1, n)) : 7
  settings.logRetainDays = days
  Notification.success({
    content: highlight(`日志保留天数已设为「${days}」天。`),
  })
}

/** 数值收敛：空值/越界回退默认（文件数默认 50），非法一律钳制到 [10, 1000]，并通知反馈 */
function onMaxFilesChange(v: number | undefined) {
  const n = Math.trunc(Number(v))
  const files = Number.isFinite(n) && n > 0 ? Math.min(1000, Math.max(10, n)) : 50
  settings.logMaxFiles = files
  Notification.success({
    content: highlight(`日志文件数量上限已设为「${files}」个。`),
  })
}

/** 立即清理过期日志（规则取当前设置，调用主进程执行，并给出结果反馈） */
async function onCleanNow() {
  cleaning.value = true
  try {
    const res = await window.yuneeAPI?.cleanLogs(settings.logRetainDays, settings.logMaxFiles)
    window.yuneeAPI?.logEvent('logger', '立即清理日志', '用户手动触发日志清理')
    if (res && res.removed > 0) {
      Notification.success({
        content: highlight(`已清理 ${res.removed} 个过期日志文件，剩余 ${res.remaining} 个。`),
      })
    } else {
      Notification.info({ content: '暂无过期日志需要清理。' })
    }
  } catch {
    Notification.error({ content: '日志清理失败，请稍后重试。' })
  } finally {
    cleaning.value = false
  }
}

/** 复位“日志存储”设置 */
function onResetStorage() {
  settings.resetFields(['logDir'])
}

/** 复位“日志清理”设置（天数与文件数量上限回到默认） */
function onResetClean() {
  settings.resetFields(['logRetainDays', 'logMaxFiles'])
}
</script>

<template>
  <a-form class="panel__form" layout="horizontal" :model="settings">
    <!-- 日志存储 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>日志存储</template>
      <template #extra><CardResetButton name="日志存储" @reset="onResetStorage" /></template>
      <a-form-item label="日志目录">
        <a-popover
          v-if="settings.logDir"
          position="bottom"
          :content="settings.logDir"
        >
          <a-input-group class="panel__dir-group">
            <a-input :model-value="settings.logDir" readonly disabled />
            <a-button @click="openLogDir">打开</a-button>
            <a-button type="primary" @click="pickLogDir">更改</a-button>
          </a-input-group>
        </a-popover>
        <a-input-group v-else class="panel__dir-group">
          <a-input :model-value="'使用默认日志目录'" readonly disabled />
          <a-button @click="openLogDir">打开</a-button>
          <a-button type="primary" @click="pickLogDir">更改</a-button>
        </a-input-group>
        <template #extra>
          <HintText>软件运行日志的存放位置；留空使用默认目录</HintText>
        </template>
      </a-form-item>
    </a-card>

    <!-- 日志输出：固定调试级（全量记录），无档位选择 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>日志输出</template>
      <a-form-item label="日志级别">
        <a-tag color="arcoblue" :bordered="false" size="medium">调试（全量记录）</a-tag>
        <template #extra>
          <HintText>固定为调试级别，记录软件运行的全部细节，最便于排查错误与 BUG。</HintText>
        </template>
      </a-form-item>
    </a-card>

    <!-- 日志清理：保留天数 + 文件数量上限双规则 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>日志清理</template>
      <template #extra><CardResetButton name="日志清理" @reset="onResetClean" /></template>
      <a-form-item label="保留天数">
        <a-input-number
          :model-value="settings.logRetainDays"
          :min="1"
          :max="365"
          mode="button"
          :style="{ width: fitNumberInputWidth(settings.logRetainDays) }"
          @change="onRetainChange"
        />
        <span class="log-clean__unit">天</span>
        <template #extra>
          <HintText>日志文件超过该天数后自动删除</HintText>
        </template>
      </a-form-item>
      <a-form-item label="文件数量上限">
        <a-input-number
          :model-value="settings.logMaxFiles"
          :min="10"
          :max="1000"
          mode="button"
          :style="{ width: fitNumberInputWidth(settings.logMaxFiles) }"
          @change="onMaxFilesChange"
        />
        <span class="log-clean__unit">个</span>
        <template #extra>
          <HintText>日志文件数量超过该值时自动清理最旧的</HintText>
        </template>
      </a-form-item>
      <a-form-item label="操作">
        <a-button :loading="cleaning" @click="onCleanNow">立即清理</a-button>
        <template #extra>
          <HintText>应用每次启动及切换日志目录时也会自动清理</HintText>
        </template>
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

/* 数字输入后面的单位后缀 */
.log-clean__unit {
  margin-left: 8px;
  color: var(--color-text-3);
}
</style>