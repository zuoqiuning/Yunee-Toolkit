<!--
  设置面板：更新
  职责：展示当前软件版本、启动时检查更新开关，以及手动检查更新与安装入口。
  设计：使用 Arco Form + Card，与其它设置面板一致的「标题栏 + 内容区」卡片框架。
    - 「当前版本」卡片：版本标签 + 检查更新按钮 + 更新状态区；
    - 更新检查 / 下载 / 就绪等进度由主进程通过 update:* 事件推送，本面板订阅后以状态区呈现；
    - 「启动检查」卡片：控制是否在应用启动时静默检查更新（store 持久化）。
  说明：实际检查更新走 electron-updater，仅打包后的应用真正生效；开发环境会提示不可用。
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Notification } from '@arco-design/web-vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { highlight } from '@/utils/notify'
import HintText from '@/components/common/HintText.vue'
import CardResetButton from '../common/CardResetButton.vue'

const appStore = useAppStore()
const settings = useSettingsStore()

/** 更新流程阶段 */
type UpdateState =
  | 'idle' // 未执行检查
  | 'checking' // 正在检查
  | 'available' // 发现新版本（开始后台下载）
  | 'downloading' // 下载中
  | 'downloaded' // 下载完成，可重启安装
  | 'not-available' // 已是最新
  | 'error' // 检查失败

// 当前更新状态
const state = ref<UpdateState>('idle')
/** 新版本号 */
const newVersion = ref('')
/** 下载进度（0-100） */
const downloadPercent = ref(0)
/** 失败原因 */
const errorMessage = ref('')

/** 取消订阅函数集合，卸载时统一释放 */
let disposers: (() => void)[] = []

/** 订阅主进程推送的更新事件，驱动状态区展示 */
function subscribe() {
  const on = window.yuneeAPI?.onMainEvent
  if (!on) return
  disposers = [
    on('update:checking', () => {
      state.value = 'checking'
    }),
    on('update:available', (payload) => {
      state.value = 'available'
      newVersion.value = ((payload ?? {}) as { version?: string }).version ?? ''
      downloadPercent.value = 0
    }),
    on('update:not-available', () => {
      state.value = 'not-available'
    }),
    on('update:downloading', (payload) => {
      state.value = 'downloading'
      downloadPercent.value = ((payload ?? {}) as { percent?: number }).percent ?? 0
    }),
    on('update:downloaded', (payload) => {
      state.value = 'downloaded'
      newVersion.value = ((payload ?? {}) as { version?: string }).version ?? newVersion.value
    }),
    on('update:error', (payload) => {
      state.value = 'error'
      errorMessage.value = ((payload ?? {}) as { message?: string }).message ?? '未知错误'
    }),
  ]
}

/** 手动检查更新：立即给出「检查中」反馈，随后由主进程事件更新状态 */
function onCheck() {
  state.value = 'checking'
  errorMessage.value = ''
  window.yuneeAPI?.logEvent('updater', '手动检查更新', `当前版本 ${appStore.meta.version}`)
  window.yuneeAPI?.checkForUpdates(true)
}

/** 重启并安装已下载的更新 */
function onInstall() {
  window.yuneeAPI?.logEvent('updater', '重启安装更新', `安装 v${newVersion.value}`)
  window.yuneeAPI?.installUpdate()
}

/** 启动时检查更新开关变更反馈 */
function onCheckOnStartChange(value: string | number | boolean) {
  Notification.success({
    content: highlight(value ? '已「开启」启动时检查更新。' : '已「关闭」启动时检查更新。'),
  })
}

/** 复位“更新”设置（启动时检查开关） */
function onResetCheckOnStart() {
  settings.resetFields(['checkUpdateOnStart'])
}

/** 同步更新代理配置到主进程（面板挂载 / 设置变更时调用，保证检查更新使用最新配置） */
function syncProxy() {
  window.yuneeAPI?.applyUpdateProxy(settings.updateProxyEnabled, settings.updateProxyUrl)
}

/** 启用更新代理开关变更：同步主进程 + 通知 */
function onProxyEnabledChange(value: string | number | boolean) {
  syncProxy()
  Notification.success({
    content: highlight(value ? '已「开启」更新代理，更新请求将走代理地址。' : '已「关闭」更新代理，恢复系统代理。'),
  })
}

/** 代理地址变更（失焦 / 回车）：同步主进程 + 通知 */
function onProxyUrlChange(value: string | number) {
  syncProxy()
  Notification.success({
    content: highlight(`更新代理地址已保存：${String(value).trim() || '（未填写）'}。`),
  })
}

/** 复位“更新代理”设置 */
function onResetProxy() {
  settings.resetFields(['updateProxyEnabled', 'updateProxyUrl'])
  syncProxy()
}

onMounted(() => {
  subscribe()
  syncProxy()
})
onBeforeUnmount(() => disposers.forEach((off) => off()))
</script>

<template>
  <a-form class="panel__form" layout="horizontal" :model="settings">
    <!-- 当前版本与更新检查 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>当前版本</template>

      <a-form-item label="软件版本">
        <a-space>
          <a-tag color="arcoblue" :bordered="false" size="medium">
            {{ appStore.meta.version }}
          </a-tag>
          <a-button type="primary" size="small" :loading="state === 'checking'" @click="onCheck">
            检查更新
          </a-button>
        </a-space>
      </a-form-item>

      <!-- 更新状态区：检查 / 下载 / 结果 -->
      <div v-if="state !== 'idle'" class="update__status">
        <!-- 正在检查 -->
        <template v-if="state === 'checking'">
          <a-spin :size="14" />
          <span class="update__status-text">正在检查更新…</span>
        </template>

        <!-- 发现新版本，后台下载中 -->
        <template v-else-if="state === 'available'">
          <span class="update__status-text">
            发现新版本 v{{ newVersion }}，正在后台下载…
          </span>
        </template>

        <!-- 下载进度 -->
        <template v-else-if="state === 'downloading'">
          <a-progress
            class="update__progress"
            :percent="downloadPercent"
            size="small"
            :show-text="false"
          />
          <span class="update__status-text">正在下载 v{{ newVersion }}（{{ downloadPercent }}%）</span>
        </template>

        <!-- 下载完成，可重启安装 -->
        <template v-else-if="state === 'downloaded'">
          <span class="update__status-text">新版本 v{{ newVersion }} 已下载完成，重启应用即可安装。</span>
          <a-button type="primary" size="small" @click="onInstall">立即重启</a-button>
        </template>

        <!-- 已是最新 -->
        <template v-else-if="state === 'not-available'">
          <span class="update__status-text">当前已是最新版本。</span>
        </template>

        <!-- 检查失败 -->
        <template v-else-if="state === 'error'">
          <span class="update__status-text update__status-error">检查更新失败：{{ errorMessage }}</span>
        </template>
      </div>
    </a-card>

    <!-- 启动时自动检查 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>启动检查</template>
      <template #extra><CardResetButton name="启动检查" @reset="onResetCheckOnStart" /></template>
      <a-form-item label="启动时检查更新">
        <a-switch v-model="settings.checkUpdateOnStart" @change="onCheckOnStartChange" />
        <template #extra>
          <HintText>每次启动应用时静默检查是否有新版本</HintText>
        </template>
      </a-form-item>
    </a-card>

    <!-- 更新代理：直连 GitHub 更新源不稳定时，可配置 HTTP/SOCKS5 代理加速更新检查与下载 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>更新代理</template>
      <template #extra><CardResetButton name="更新代理" @reset="onResetProxy" /></template>

      <a-form-item label="启用更新代理">
        <a-switch v-model="settings.updateProxyEnabled" @change="onProxyEnabledChange" />
        <template #extra>
          <HintText>直连 GitHub 更新源不稳定时，开启后将通过代理服务器检查与下载更新</HintText>
        </template>
      </a-form-item>

      <a-form-item label="代理地址">
        <a-input
          v-model="settings.updateProxyUrl"
          class="update__proxy-input"
          placeholder="http://127.0.0.1:7890"
          allow-clear
          @change="onProxyUrlChange"
        />
        <template #extra>
          <HintText>支持 http / https / socks5 协议，如 http://127.0.0.1:7890</HintText>
        </template>
      </a-form-item>
    </a-card>
  </a-form>
</template>

<style scoped>
/* 卡片间距：与其它设置面板保持一致（12px） */
.panel__card + .panel__card {
  margin-top: 12px;
}

/* 更新状态区：横向排布，紧跟版本项下方，给出当前更新流程的即时反馈 */
.update__status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  padding: 2px 8px 10px;
  font-size: 13px;
  color: var(--color-text-2);
}

/* 下载进度条：占满剩余宽度 */
.update__progress {
  flex: 1;
  min-width: 0;
}

/* 失败文案：警示色 */
.update__status-error {
  color: rgb(var(--red-6));
}

/* 代理地址输入框：较长地址也能完整显示 */
.update__proxy-input {
  width: 360px;
}

/* 状态文本：避免被压缩换行 */
.update__status-text {
  white-space: nowrap;
}
</style>
