<!--
  设置面板：声音
  职责：转换完成 / 转换失败 / 按钮点击 三类提示音的开关与声音挑选（声音库）。
  设计：使用 Arco Form + Card，与其它设置面板一致的「标题栏 + 内容区」卡片框架。
    - 每组事件（完成 / 失败 / 点击）一个开关 + 一个声音下拉框（声音库）+「试听」按钮；
    - 声音下拉切换时即时播放试听并通知反馈；辅助文案显示当前声音的描述。
  说明：声音库定义在 utils/sounds.ts（Web Audio 合成，无需音频文件）。
-->
<script setup lang="ts">
import { computed } from 'vue'
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

/** 当前选中「完成」声音的描述文案 */
const completeDesc = computed(
  () => COMPLETE_SOUNDS.find((s) => s.id === settings.soundComplete)?.desc ?? '',
)

/** 当前选中「失败」声音的描述文案 */
const errorDesc = computed(
  () => ERROR_SOUNDS.find((s) => s.id === settings.soundError)?.desc ?? '',
)

/** 当前选中「点击」声音的描述文案 */
const clickDesc = computed(
  () => CLICK_SOUNDS.find((s) => s.id === settings.clickSound)?.desc ?? '',
)

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

/** 完成提示音切换：保存选中声音并即时试听，方便挑选 */
function onCompleteSoundChange(value: unknown) {
  const preset = COMPLETE_SOUNDS.find((s) => s.id === String(value))
  settings.soundComplete = preset?.id ?? COMPLETE_SOUNDS[0].id
  Notification.success({
    content: highlight(`转换完成提示音已设为「${preset?.label ?? ''}」。`),
  })
  playSoundById(settings.soundComplete, COMPLETE_SOUNDS[0].id)
}

/** 失败提示音切换：保存选中声音并即时试听，方便挑选 */
function onErrorSoundChange(value: unknown) {
  const preset = ERROR_SOUNDS.find((s) => s.id === String(value))
  settings.soundError = preset?.id ?? ERROR_SOUNDS[0].id
  Notification.success({
    content: highlight(`转换失败提示音已设为「${preset?.label ?? ''}」。`),
  })
  playSoundById(settings.soundError, ERROR_SOUNDS[0].id)
}

/** 试听当前选中的「完成」提示音 */
function onPreviewComplete() {
  playSoundById(settings.soundComplete, COMPLETE_SOUNDS[0].id)
}

/** 试听当前选中的「失败」提示音 */
function onPreviewError() {
  playSoundById(settings.soundError, ERROR_SOUNDS[0].id)
}

/** 点击音效开关变更反馈 */
function onClickEnabled(value: string | number | boolean) {
  Notification.success({
    content: highlight(value ? '已「开启」按钮点击音效。' : '已「关闭」按钮点击音效。'),
  })
}

/** 点击音效切换：保存选中声音并即时试听，方便挑选 */
function onClickSoundChange(value: unknown) {
  const preset = CLICK_SOUNDS.find((s) => s.id === String(value))
  settings.clickSound = preset?.id ?? CLICK_SOUNDS[0].id
  Notification.success({
    content: highlight(`按钮点击音效已设为「${preset?.label ?? ''}」。`),
  })
  playSoundById(settings.clickSound, CLICK_SOUNDS[0].id)
}

/** 试听当前选中的「点击」音效 */
function onPreviewClick() {
  playSoundById(settings.clickSound, CLICK_SOUNDS[0].id)
}

/** 复位“声音”设置 */
function onResetSounds() {
  settings.resetFields([
    'playSoundOnComplete',
    'playSoundOnError',
    'soundComplete',
    'soundError',
    'playClickSound',
    'clickSound',
  ])
}

/** 复位“点击音效”设置 */
function onResetClick() {
  settings.resetFields(['playClickSound', 'clickSound'])
}
</script>

<template>
  <a-form class="panel__form" layout="horizontal" :model="settings">
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>提示音</template>
      <template #extra><CardResetButton name="提示音" @reset="onResetSounds" /></template>

      <a-form-item label="转换完成" :extra="completeDesc || '任务成功结束时播放'">
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

      <a-form-item label="转换失败" :extra="errorDesc || '任务失败时播放'">
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
    </a-card>

    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>点击音效</template>
      <template #extra><CardResetButton name="点击音效" @reset="onResetClick" /></template>

      <a-form-item label="按钮点击" :extra="clickDesc || '点击各类按钮时播放'">
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
    </a-card>
  </a-form>
</template>

<style scoped>
.panel__card :deep(.arco-card-body) {
  padding: 8px 8px 0;
}
</style>
