<!--
  设置面板：通用（系统层）
  职责：开机自启、关闭窗口行为等系统级设置。
  设计：使用 Arco Form（label 在左）+ Card 分组。
  - 开机自启通过主进程写入/读取系统登录项，结果以 Notification 反馈。
  - 关闭窗口行为（退出 / 最小化到托盘）同步到主进程托盘与窗口关闭逻辑。
  - 更新相关（版本、检查更新）已迁移到“更新”面板；主题等外观项在“个性化”面板。
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Notification } from '@arco-design/web-vue'
import { useSettingsStore } from '@/stores/settings'
import { highlight } from '@/utils/notify'
import HintText from '@/components/common/HintText.vue'
import CardResetButton from '../common/CardResetButton.vue'

const settings = useSettingsStore()

// 开机自启状态（以系统实际状态为准，预览环境静默降级为本地值）
// 通过 v-model 绑定，开关视觉立即跟随本值变化，避免状态不同步
const autoStartVal = ref(settings.autoStart)

// 每次进入面板时读取系统真实的开机自启状态
onMounted(async () => {
  try {
    const val = await window.yuneeAPI?.getAutoStart()
    if (typeof val === 'boolean') {
      autoStartVal.value = val
      settings.autoStart = val
    }
  } catch {
    // 预览环境忽略
  }
})

/** 切换开机自启并同步到系统；失败时回滚开关状态 */
async function onAutoStartChange(value: string | number | boolean) {
  const checked = !!value
  // “checked”即开关目标状态；主进程仅返回“调用是否成功”，不能据此判断最终状态，
  // 因此以目标状态为准乐观更新，失败再回滚。
  settings.autoStart = checked
  try {
    await window.yuneeAPI?.setAutoStart(checked)
    autoStartVal.value = checked
    settings.autoStart = checked
    Notification.success({
      content: highlight(checked ? '已「开启」开机自启。' : '已「关闭」开机自启。'),
    })
  } catch {
    // 修改失败：回滚到原状态并提示
    autoStartVal.value = !checked
    settings.autoStart = !checked
    Notification.warning({ content: '当前环境无法修改系统启动项，已恢复原状态。' })
  }
}

/** 关闭窗口行为文案映射 */
const closeLabels: Record<string, string> = {
  exit: '退出',
  tray: '最小化到托盘',
}

/** 关闭窗口行为变更：写入 store 并给出反馈（主进程同步由 App.vue 统一 watch 处理） */
function onCloseBehaviorChange(value: unknown) {
  const behavior = String(value) === 'tray' ? 'tray' : 'exit'
  settings.closeBehavior = behavior
  Notification.success({
    content: highlight(`关闭窗口将「${closeLabels[behavior]}」。`),
  })
}

/** 复位“启动”设置（开机自启同步回本地 ref；其余由 store watch 自动持久化与同步） */
function onResetStartup() {
  settings.resetFields(['autoStart'])
  autoStartVal.value = settings.autoStart
}

/** 复位“关闭窗口”设置（store watch 会自动同步主进程） */
function onResetCloseWindow() {
  settings.resetFields(['closeBehavior'])
}
</script>

<template>
  <a-form class="panel__form" layout="horizontal" :model="settings">
      <!-- 启动 -->
      <a-card class="panel__card" :bordered="true" size="small">
      <template #title>启动</template>
      <template #extra><CardResetButton name="启动" @reset="onResetStartup" /></template>
      <a-form-item label="开机自启">
        <a-switch v-model="autoStartVal" @change="onAutoStartChange" />
        <template #extra>
          <HintText>随系统登录自动启动软件（仅 Windows）</HintText>
        </template>
      </a-form-item>
    </a-card>

    <!-- 关闭窗口 -->
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>关闭窗口</template>
      <template #extra><CardResetButton name="关闭窗口" @reset="onResetCloseWindow" /></template>
      <a-form-item label="关闭窗口行为">
        <a-radio-group
          :model-value="settings.closeBehavior"
          type="button"
          @change="onCloseBehaviorChange"
        >
          <a-radio value="exit">退出</a-radio>
          <a-radio value="tray">最小化到托盘</a-radio>
        </a-radio-group>
        <template #extra>
          <HintText>“最小化到托盘”时关闭窗口不退出软件，可从系统托盘恢复</HintText>
        </template>
      </a-form-item>
      </a-card>
  </a-form>
</template>

<style scoped>
.panel__form {
  /* 表单统一：控制标签列宽，垂直整理间距 */
}

.panel__card + .panel__card {
  margin-top: 12px;
}

.panel__card :deep(.arco-card-body) {
  padding: 8px 8px 0;
}
</style>
