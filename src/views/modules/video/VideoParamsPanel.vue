<!--
  视频转换：转换参数面板 VideoParamsPanel
  职责：配置输出格式 / 视频编码 / 画质 / 分辨率 / 帧率 / 音频编码 / 音频码率 / 硬件加速。
  UI：采用「标题栏 + 内容区」卡片框架，Arco Form 横向布局；
      显卡检测结果来自硬件 Store（启动阶段预加载），不支持的品牌加速方案置灰。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useHardwareStore } from '@/stores/hardware'
import { fitNumberInputWidth } from '@/utils/numberWidth'
import HintText from '@/components/common/HintText.vue'
import type { VideoParams } from './types'

/** 参数对象（由父级持有，直接改写属性即可双向同步） */
const props = defineProps<{ params: VideoParams }>()

const hardware = useHardwareStore()

/** 输出格式选项 */
const FORMAT_OPTIONS = [
  { value: 'mp4', label: 'MP4（最通用）' },
  { value: 'mkv', label: 'MKV（多音轨/字幕）' },
  { value: 'avi', label: 'AVI（老设备兼容）' },
  { value: 'mov', label: 'MOV（Apple 生态）' },
  { value: 'webm', label: 'WebM（网页/流媒体）' },
  { value: 'ts', label: 'TS（分段流媒体）' },
]

/** 帧率选项 */
const FPS_OPTIONS = [
  { value: 'keep', label: '保持原帧率' },
  { value: '24', label: '24 fps（电影）' },
  { value: '25', label: '25 fps（PAL）' },
  { value: '30', label: '30 fps（常用）' },
  { value: '60', label: '60 fps（高帧率）' },
  { value: 'custom', label: '自定义…' },
]

/** 音频码率选项 */
const BITRATE_OPTIONS = [
  { value: 'keep', label: '保持原码率' },
  { value: '128k', label: '128 kbps' },
  { value: '192k', label: '192 kbps' },
  { value: '256k', label: '256 kbps' },
  { value: '320k', label: '320 kbps' },
]

/** 流复制（copy）时画质/分辨率/帧率不可用 */
const isCopy = computed(() => props.params.videoCodec === 'copy')

/**
 * 加速方案互斥置灰：仅当已检测到显卡时启用限制；
 * 检测失败 / 无显卡信息时不限制，保证纯 CPU 环境可用。
 */
const gpuDisabled = computed<Record<string, boolean>>(() => {
  const brands = new Set(hardware.gpus.map((g) => g.brand))
  const detected = hardware.loaded && hardware.gpus.length > 0
  return {
    auto: false,
    cpu: false,
    nvidia: detected && !brands.has('nvidia'),
    amd: detected && !brands.has('amd'),
    intel: detected && !brands.has('intel'),
  }
})

/** 硬件加速辅助说明（随检测结果变化） */
const hwExtra = computed(() => {
  if (!hardware.loaded || !hardware.gpus.length) return '优先使用的编码加速；纯 CPU 最稳定通用'
  const d = gpuDisabled.value
  const parts: string[] = []
  if (d.nvidia) parts.push('NVIDIA')
  if (d.amd) parts.push('AMD')
  if (d.intel) parts.push('Intel')
  if (parts.length) return `当前显卡不支持${parts.join(' / ')}加速，相关选项已置灰`
  return '已检测到显卡，可选用对应品牌的硬件加速'
})
</script>

<template>
  <a-card class="panel__card" :bordered="true" size="small">
    <template #title>转换参数</template>
    <a-form class="panel__form" layout="horizontal" :model="params">
      <!-- 输出格式 -->
      <a-form-item label="输出格式">
        <a-select v-model="params.format" style="width: 240px">
          <a-option v-for="o in FORMAT_OPTIONS" :key="o.value" :value="o.value">
            {{ o.label }}
          </a-option>
        </a-select>
        <template #extra>
          <HintText>目标封装格式，决定输出文件的扩展名</HintText>
        </template>
      </a-form-item>

      <!-- 视频编码 -->
      <a-form-item label="视频编码">
        <a-radio-group v-model="params.videoCodec" type="button">
          <a-radio value="copy">流复制</a-radio>
          <a-radio value="h264">H.264</a-radio>
          <a-radio value="hevc">H.265</a-radio>
          <a-radio value="vp9">VP9</a-radio>
          <a-radio value="av1">AV1</a-radio>
        </a-radio-group>
        <template #extra>
          <HintText>流复制不重新编码（速度最快）；其余为重新编码</HintText>
        </template>
      </a-form-item>

      <!-- 画质 -->
      <a-form-item label="画质">
        <a-radio-group v-model="params.quality" type="button">
          <a-radio value="high" :disabled="isCopy">高画质</a-radio>
          <a-radio value="medium" :disabled="isCopy">平衡</a-radio>
          <a-radio value="low" :disabled="isCopy">高压缩</a-radio>
        </a-radio-group>
        <template #extra>
          <HintText>CRF 恒定质量：高画质体积大，高压缩更省空间</HintText>
        </template>
      </a-form-item>

      <!-- 分辨率 -->
      <a-form-item label="分辨率">
        <a-space wrap>
          <a-radio-group v-model="params.resolution" type="button">
            <a-radio value="origin" :disabled="isCopy">原始</a-radio>
            <a-radio value="1080p" :disabled="isCopy">1080P</a-radio>
            <a-radio value="720p" :disabled="isCopy">720P</a-radio>
            <a-radio value="480p" :disabled="isCopy">480P</a-radio>
            <a-radio value="custom" :disabled="isCopy">自定义</a-radio>
          </a-radio-group>
          <template v-if="params.resolution === 'custom'">
            <a-input-number
              v-model="params.customWidth"
              :min="1"
              :max="7680"
              placeholder="宽"
              mode="button"
              :style="{ width: fitNumberInputWidth(params.customWidth) }"
            />
            <span class="vparam__x">×</span>
            <a-input-number
              v-model="params.customHeight"
              :min="1"
              :max="4320"
              placeholder="高"
              mode="button"
              :style="{ width: fitNumberInputWidth(params.customHeight) }"
            />
          </template>
        </a-space>
        <template #extra>
          <HintText>按原始宽高比等比缩放；流复制时不可用</HintText>
        </template>
      </a-form-item>

      <!-- 帧率 -->
      <a-form-item label="帧率">
        <a-space wrap>
          <a-select v-model="params.fps" style="width: 180px" :disabled="isCopy">
            <a-option v-for="o in FPS_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </a-option>
          </a-select>
          <a-input-number
            v-if="params.fps === 'custom'"
            v-model="params.customFps"
            :min="1"
            :max="240"
            placeholder="帧率"
            mode="button"
            :style="{ width: fitNumberInputWidth(params.customFps) }"
          />
        </a-space>
        <template #extra>
          <HintText>输出视频的帧率；流复制时不可用</HintText>
        </template>
      </a-form-item>

      <!-- 音频编码 -->
      <a-form-item label="音频编码">
        <a-select v-model="params.audioCodec" style="width: 200px">
          <a-option value="copy">保持音频编码</a-option>
          <a-option value="aac">AAC</a-option>
          <a-option value="mp3">MP3</a-option>
          <a-option value="opus">Opus</a-option>
          <a-option value="vorbis">Vorbis</a-option>
        </a-select>
        <template #extra>
          <HintText>保持音频编码不转码，速度更快</HintText>
        </template>
      </a-form-item>

      <!-- 音频码率 -->
      <a-form-item label="音频码率">
        <a-select
          v-model="params.audioBitrate"
          style="width: 200px"
          :disabled="params.audioCodec === 'copy'"
        >
          <a-option v-for="o in BITRATE_OPTIONS" :key="o.value" :value="o.value">
            {{ o.label }}
          </a-option>
        </a-select>
        <template #extra>
          <HintText>重新编码音频时生效</HintText>
        </template>
      </a-form-item>

      <!-- 硬件加速 -->
      <a-form-item label="硬件加速">
        <a-radio-group v-model="params.hwaccel" type="button">
          <a-radio value="auto">自动</a-radio>
          <a-radio value="nvidia" :disabled="gpuDisabled.nvidia">NVIDIA</a-radio>
          <a-radio value="intel" :disabled="gpuDisabled.intel">Intel</a-radio>
          <a-radio value="amd" :disabled="gpuDisabled.amd">AMD</a-radio>
          <a-radio value="cpu">CPU</a-radio>
        </a-radio-group>
        <template #extra>
          <HintText>{{ hwExtra }}</HintText>
        </template>
      </a-form-item>
    </a-form>
  </a-card>
</template>

<style scoped>
/* 自定义分辨率中「×」连接符 */
.vparam__x {
  color: var(--color-text-4);
  font-size: 13px;
}

/* 设置项名称与右侧控件垂直居中，与设置弹窗面板保持一致 */
.panel__form :deep(.arco-form-item) {
  align-items: center;
}
</style>
