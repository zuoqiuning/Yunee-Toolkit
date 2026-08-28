<!--
  设置面板：日志
  职责：日志存储目录、日志输出（固定调试级全量记录）与日志自动清理规则设置。
  设计：
    - 日志存储：选择/打开日志目录（留空使用默认目录）。
    - 日志输出：固定为「调试（全量记录）」，不再提供档位选择，便于排查错误与 BUG。
    - 日志清理：保留天数 + 文件数量上限双规则，超限自动清理；可一键立即清理。
  说明：清理规则与目录通过 App.vue 实时同步到主进程，切换即生效。
-->
<script setup lang="ts">
import { ref } from 'vue'
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'
import { highlight } from '@/utils/notify'
import CardResetButton from '../common/CardResetButton.vue'

const settings = useSettingsStore()

/** 立即清理按钮的加载态 */
const cleaning = ref(false)

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
      <a-form-item label="日志目录" extra="软件运行日志的存放位置；留空使用默认目录">
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
      </a-form-item>
    </a-card>

    <!-- 日志输出：固定调试级（全量记录），无档位选择 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>日志输出</template>
      <a-form-item label="日志级别" extra="固定为调试级别，记录软件运行的全部细节，最便于排查错误与 BUG。">
        <a-tag color="arcoblue" :bordered="false" size="medium">调试（全量记录）</a-tag>
      </a-form-item>
    </a-card>

    <!-- 日志清理：保留天数 + 文件数量上限双规则 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>日志清理</template>
      <template #extra><CardResetButton name="日志清理" @reset="onResetClean" /></template>
      <a-form-item label="保留天数" extra="日志文件超过该天数后自动删除">
        <a-input-number
          :model-value="settings.logRetainDays"
          :min="1"
          :max="365"
          :style="{ width: '160px' }"
          @change="onRetainChange"
        />
        <span class="log-clean__unit">天</span>
      </a-form-item>
      <a-form-item label="文件数量上限" extra="日志文件数量超过该值时自动清理最旧的">
        <a-input-number
          :model-value="settings.logMaxFiles"
          :min="10"
          :max="1000"
          :style="{ width: '160px' }"
          @change="onMaxFilesChange"
        />
        <span class="log-clean__unit">个</span>
      </a-form-item>
      <a-form-item label="操作">
        <a-button :loading="cleaning" @click="onCleanNow">立即清理</a-button>
        <a-typography-text class="log-clean__hint" type="secondary">
          应用每次启动及切换日志目录时也会自动清理
        </a-typography-text>
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

/* 数字输入后面的单位后缀 */
.log-clean__unit {
  margin-left: 8px;
  color: var(--color-text-3);
}

/* 立即清理下方的补充说明 */
.log-clean__hint {
  margin-left: 12px;
  font-size: 12px;
}
</style>