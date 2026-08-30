<!--
  设置面板：声音
  职责：转换完成 / 转换失败 / 按钮点击 三类提示音的开关、声音挑选（声音库）与音量调节。
  设计：使用 Arco Form + Card，与其它设置面板一致的「标题栏 + 内容区」卡片框架。
    - 每组事件（完成 / 失败 / 点击）一个开关 + 一个声音下拉框（声音库）+「试听」按钮；
  - 声音下拉切换时即时播放试听并通知反馈；
  - 各提示音下方紧随对应的「音量」滑块（a-slider，统一 200px 宽、不带输入框），
    三组滑块长度与点击音效一致并整体对齐；播放时以滑块值 / 100 作为音量系数，
    预览与全局播放同步生效。
  说明：声音库定义在 utils/sounds.ts（Web Audio 合成，无需音频文件）。
-->
<script setup lang="ts">
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'
import { highlight } from '@/utils/notify'
import {
  CLICK_SOUNDS,
  COMPLETE_SOUNDS,
  ERROR_SOUNDS,
  playSoundById,
} from '@/utils/sounds'
import CardResetButton from '../common/CardResetButton.vue'

const settings = useSettingsStore()

/** 完成提示音开关变更反馈 */
function onCompleteEnabled(value: string | number | boolean) {
  Notification.success({
    content: highlight(value ? '已「开启」转换完成提示音。' : '已「关闭」转换完成提示音。'),
  })
}

/** 失败提示音开关变更反馈 */
function onErrorEnabled(value: string | number | boolean) {
  Notification.success({
    content: highlight(value ? '已「开启」转换失败提示音。' : '已「关闭」转换失败提示音。'),
  })
}

/** 完成提示音切换：保存选中声音并即时试听（按当前音量），方便挑选 */
function onCompleteSoundChange(value: unknown) {
  const preset = COMPLETE_SOUNDS.find((s) => s.id === String(value))
  settings.soundComplete = preset?.id ?? COMPLETE_SOUNDS[0].id
  Notification.success({
    content: highlight(`转换完成提示音已设为「${preset?.label ?? ''}」。`),
  })
  playSoundById(settings.soundComplete, COMPLETE_SOUNDS[0].id, settings.soundCompleteVolume / 100)
}

/** 失败提示音切换：保存选中声音并即时试听（按当前音量），方便挑选 */
function onErrorSoundChange(value: unknown) {
  const preset = ERROR_SOUNDS.find((s) => s.id === String(value))
  settings.soundError = preset?.id ?? ERROR_SOUNDS[0].id
  Notification.success({
    content: highlight(`转换失败提示音已设为「${preset?.label ?? ''}」。`),
  })
  playSoundById(settings.soundError, ERROR_SOUNDS[0].id, settings.soundErrorVolume / 100)
}

/** 试听当前选中的「完成」提示音（按当前音量） */
function onPreviewComplete() {
  playSoundById(settings.soundComplete, COMPLETE_SOUNDS[0].id, settings.soundCompleteVolume / 100)
}

/** 试听当前选中的「失败」提示音（按当前音量） */
function onPreviewError() {
  playSoundById(settings.soundError, ERROR_SOUNDS[0].id, settings.soundErrorVolume / 100)
}

/** 点击音效开关变更反馈 */
function onClickEnabled(value: string | number | boolean) {
  Notification.success({
    content: highlight(value ? '已「开启」按钮点击音效。' : '已「关闭」按钮点击音效。'),
  })
}

/** 点击音效切换：保存选中声音并即时试听（按当前音量），方便挑选 */
function onClickSoundChange(value: unknown) {
  const preset = CLICK_SOUNDS.find((s) => s.id === String(value))
  settings.clickSound = preset?.id ?? CLICK_SOUNDS[0].id
  Notification.success({
    content: highlight(`按钮点击音效已设为「${preset?.label ?? ''}」。`),
  })
  playSoundById(settings.clickSound, CLICK_SOUNDS[0].id, settings.clickSoundVolume / 100)
}

/** 试听当前选中的「点击」音效（按当前音量） */
function onPreviewClick() {
  playSoundById(settings.clickSound, CLICK_SOUNDS[0].id, settings.clickSoundVolume / 100)
}

/** 音量调节试听防抖定时器：停止拖动 / 输入约 300ms 后试听一次，避免连续触发 */
let volumePreviewTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 音量调节变更：写回 store（0-100 收敛）。
 * 说明：滑动选择器调节时不弹通知卡片（避免拖动产生一堆提示），
 *       仅以防抖试听当前音量作为即时反馈（停止操作后播放一次，便于边调边听）。
 */
function onVolumeChange(type: 'complete' | 'error' | 'click', value: number | number[]) {
  const raw = Array.isArray(value) ? value[0] : value
  const n = Math.min(100, Math.max(0, Math.round(Number(raw) || 0)))
  if (type === 'complete') settings.soundCompleteVolume = n
  else if (type === 'error') settings.soundErrorVolume = n
  else settings.clickSoundVolume = n
  // 防抖试听当前音量效果，避免拖动过程连续播放
  if (volumePreviewTimer) clearTimeout(volumePreviewTimer)
  volumePreviewTimer = setTimeout(() => {
    if (type === 'complete') onPreviewComplete()
    else if (type === 'error') onPreviewError()
    else onPreviewClick()
  }, 300)
}

/** 复位“提示音”设置（含音量） */
function onResetSounds() {
  settings.resetFields([
    'playSoundOnComplete',
    'playSoundOnError',
    'soundComplete',
    'soundError',
    'soundCompleteVolume',
    'soundErrorVolume',
  ])
}

/** 复位“点击音效”设置（含音量） */
function onResetClick() {
  settings.resetFields(['playClickSound', 'clickSound', 'clickSoundVolume'])
}
</script>

<template>
  <!-- 与其它设置面板保持一致的默认横向布局：标签左对齐、垂直居中，
       统一各面板的视觉节奏（不再单独使用右对齐，避免页签切换时标签左右跳动） -->
  <a-form class="panel__form" layout="horizontal" :model="settings">
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>提示音</template>
      <template #extra><CardResetButton name="提示音" @reset="onResetSounds" /></template>

      <a-form-item label="转换完成">
        <a-space wrap>
          <a-switch v-model="settings.playSoundOnComplete" @change="onCompleteEnabled" />
          <template v-if="settings.playSoundOnComplete">
            <a-select
              :model-value="settings.soundComplete"
              :style="{ width: '200px' }"
              @change="onCompleteSoundChange"
            >
              <a-option v-for="s in COMPLETE_SOUNDS" :key="s.id" :value="s.id">
                {{ s.label }}
              </a-option>
            </a-select>
            <a-button size="small" @click="onPreviewComplete">试听</a-button>
          </template>
        </a-space>
      </a-form-item>

      <!-- 完成音量：紧随「转换完成」提示音下方（统一 200px，无输入框） -->
      <a-form-item label="音量">
        <a-slider
          :model-value="settings.soundCompleteVolume"
          :min="0"
          :max="100"
          :step="1"
          :style="{ width: '200px' }"
          @change="onVolumeChange('complete', $event)"
        />
      </a-form-item>

      <a-form-item label="转换失败">
        <a-space wrap>
          <a-switch v-model="settings.playSoundOnError" @change="onErrorEnabled" />
          <template v-if="settings.playSoundOnError">
            <a-select
              :model-value="settings.soundError"
              :style="{ width: '200px' }"
              @change="onErrorSoundChange"
            >
              <a-option v-for="s in ERROR_SOUNDS" :key="s.id" :value="s.id">
                {{ s.label }}
              </a-option>
            </a-select>
            <a-button size="small" @click="onPreviewError">试听</a-button>
          </template>
        </a-space>
      </a-form-item>

      <!-- 失败音量：紧随「转换失败」提示音下方（统一 200px，无输入框） -->
      <a-form-item label="音量">
        <a-slider
          :model-value="settings.soundErrorVolume"
          :min="0"
          :max="100"
          :step="1"
          :style="{ width: '200px' }"
          @change="onVolumeChange('error', $event)"
        />
      </a-form-item>
    </a-card>

    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>点击音效</template>
      <template #extra><CardResetButton name="点击音效" @reset="onResetClick" /></template>

      <a-form-item label="按钮点击">
        <a-space wrap>
          <a-switch v-model="settings.playClickSound" @change="onClickEnabled" />
          <template v-if="settings.playClickSound">
            <a-select
              :model-value="settings.clickSound"
              :style="{ width: '200px' }"
              @change="onClickSoundChange"
            >
              <a-option v-for="s in CLICK_SOUNDS" :key="s.id" :value="s.id">
                {{ s.label }}
              </a-option>
            </a-select>
            <a-button size="small" @click="onPreviewClick">试听</a-button>
          </template>
        </a-space>
      </a-form-item>

      <!-- 点击音量：紧随「按钮点击」音效下方（统一 200px，无输入框） -->
      <a-form-item label="音量">
        <a-slider
          :model-value="settings.clickSoundVolume"
          :min="0"
          :max="100"
          :step="1"
          :style="{ width: '200px' }"
          @change="onVolumeChange('click', $event)"
        />
      </a-form-item>
    </a-card>
  </a-form>
</template>

<style scoped>
.panel__card :deep(.arco-card-body) {
  padding: 8px 8px 0;
}
</style>
