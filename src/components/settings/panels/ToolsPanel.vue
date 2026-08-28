<!--
  设置面板：工具（内置工具组件管理）
  职责：探测并展示 bin 目录下全部内置工具及其可执行组件：
        用 Arco 折叠面板（a-collapse）按工具分组展示，交互更轻量、视觉更整齐。
  设计：
    - 折叠头一瞥即知：工具名 + 套件版本 + 本组是否正常（全部正常 / 组件异常）；
    - 展开后逐行列出组件：名称 + 状态（正常 / 异常）；
    - 版本不逐组件重复列出，只在该工具分组头部展示一次；
    - 数据来自主进程 tools:get（自动扫描 bin 目录发现工具），新增工具自动出现；
    - 显式状态机（loading / ready / error），避免“检测中”卡死误导。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Notification } from '@arco-design/web-vue'
import ArcoIcon from '@/components/common/ArcoIcon.vue'
import { highlight } from '@/utils/notify'

/** 当前状态：加载中 / 就绪 / 失败 */
type State = 'loading' | 'ready' | 'error'

/** 工具列表（主进程探测结果，按 bin 子目录分组） */
const tools = ref<ToolProbeResult[]>([])
const state = ref<State>('loading')

/** 组件总数（用于概览与重新检测反馈） */
const totalComps = computed(() =>
  tools.value.reduce((n, t) => n + t.executables.length, 0),
)

/** 异常组件数量（任一工具下存在缺失组件即计入） */
const brokenCount = computed(() =>
  tools.value.reduce(
    (n, t) => n + t.executables.filter((e) => !e.exists).length,
    0,
  ),
)

/** 是否存在异常组件 */
const hasBroken = computed(() => brokenCount.value > 0)

/** 检测完成但未取到任何工具（异常边界：空列表不应显示“全部正常”） */
const isEmptyList = computed(() => state.value === 'ready' && tools.value.length === 0)

/** 某工具下是否存在异常组件（用于分组右侧状态标签） */
function toolHasBroken(tool: ToolProbeResult): boolean {
  return tool.executables.some((e) => !e.exists)
}

/**
 * 工具版本：套件版本统一取首个能解析出版本的组件
 * （同一工具目录下的组件通常随套件同版本；全部未知时显示“版本未知”）
 */
function toolVersion(tool: ToolProbeResult): string | null {
  const found = tool.executables.find((e) => e.version)
  return found ? `v${found.version}` : null
}

/** 探测全部工具（带正确状态流转） */
async function refresh() {
  state.value = 'loading'
  try {
    tools.value = (await window.yuneeAPI?.getTools()) ?? []
    state.value = 'ready'
  } catch {
    tools.value = []
    state.value = 'error'
  }
}

onMounted(refresh)

/** 手动“重新检测”：执行探测并给出通知反馈 */
async function onRescan() {
  Notification.info({ content: '正在重新检测工具组件…' })
  window.yuneeAPI?.logEvent('tools', '重新检测', '用户手动触发工具组件重测')
  await refresh()
  if (state.value === 'error') {
    Notification.error({ content: '工具组件检测失败，请稍后重试。' })
    return
  }
  const normal = totalComps.value - brokenCount.value
  Notification.success({
    content: highlight(
      `重新检测完成：共「${totalComps.value}」个组件，正常「${normal}」个，异常「${brokenCount.value}」个。`,
    ),
  })
}
</script>

<template>
  <!-- 与其他设置面板一致的卡片框架：外层包裹卡片 + 内容区 -->
  <a-form class="panel__form" layout="horizontal" :model="{}">
    <a-card class="panel__card" :bordered="true" size="small">
      <template #title>内置工具</template>
      <template #extra>
        <span class="panel__extra">
          <a-tag v-if="state === 'ready' && !hasBroken && !isEmptyList" color="green" :bordered="false">
            全部正常
          </a-tag>
          <a-tag v-else-if="state === 'ready' && hasBroken" color="red" :bordered="false">
            {{ brokenCount }} 个异常
          </a-tag>
          <a-tag v-else-if="isEmptyList" color="orange" :bordered="false">未检测到组件</a-tag>
          <a-tag v-else color="gray" :bordered="false">检测中…</a-tag>
          <a-button size="small" :disabled="state === 'loading'" @click="onRescan">
            <template #icon><ArcoIcon name="loop" :size="14" /></template>
            重新检测
          </a-button>
        </span>
      </template>

      <!-- 加载中：骨架屏 -->
      <a-skeleton v-if="state === 'loading'" :animation="true">
        <a-skeleton-line :rows="4" :line-height="44" />
      </a-skeleton>

      <!-- IPC 不可用 / 探测失败 -->
      <a-result
        v-else-if="state === 'error'"
        status="warning"
        title="无法检测工具组件"
        sub-title="主进程探测通道不可用，请重启应用后重试。"
      >
        <template #extra>
          <a-button size="small" @click="onRescan">重试</a-button>
        </template>
      </a-result>

      <!-- 检测完成但未取到工具（bin 缺失等异常边界） -->
      <a-result
        v-else-if="isEmptyList"
        status="warning"
        title="未检测到工具组件"
        sub-title="bin 目录下未找到任何工具目录，请检查工具目录完整性。"
      >
        <template #extra>
          <a-button size="small" @click="onRescan">重新检测</a-button>
        </template>
      </a-result>

      <!-- 就绪：Arco 折叠面板展示（每个工具一个可展开分组，默认全部折叠） -->
      <a-collapse
        v-else
        class="panel__collapse"
        :bordered="true"
        :expand-icon-position="'right'"
      >
        <a-collapse-item v-for="item in tools" :key="item.id">
          <template #header>
            <!-- 折叠头：工具名在左，右侧展示 版本 + 本组是否正常 徽标 -->
            <div class="tool-head">
              <span class="tool-head__name">{{ item.label }}</span>
              <span class="tool-head__right">
                <a-tag v-if="toolVersion(item)" color="arcoblue" :bordered="false">
                  {{ toolVersion(item) }}
                </a-tag>
                <a-tag v-else color="gray" :bordered="false">版本未知</a-tag>
                <a-tag :color="toolHasBroken(item) ? 'red' : 'green'" :bordered="false">
                  {{ toolHasBroken(item) ? '组件异常' : '全部正常' }}
                </a-tag>
              </span>
            </div>
          </template>

          <!-- 展开内容：该工具下的全部组件（名称 + 简介 + 状态标签） -->
          <div class="tool-item__comps">
            <div v-for="exe in item.executables" :key="exe.key" class="tool-item__comp">
              <span class="tool-item__dot" aria-hidden="true" />
              <span class="tool-item__info">
                <span class="tool-item__comp-name">{{ exe.label }}</span>
                <span v-if="exe.desc" class="tool-item__comp-desc">{{ exe.desc }}</span>
              </span>
              <span class="tool-item__tags">
                <a-tag :color="exe.exists ? 'green' : 'red'" :bordered="false">
                  {{ exe.exists ? '正常' : '异常' }}
                </a-tag>
              </span>
            </div>
          </div>
        </a-collapse-item>
      </a-collapse>
    </a-card>
  </a-form>
</template>

<style scoped>
/* 卡片内边距：与其他设置面板保持一致（标题栏 + 内容留白） */
.panel__card :deep(.arco-card-body) {
  padding: 12px 8px 8px;
}

/* 标题栏右侧：状态徽标 + 重新检测按钮 */
.panel__extra {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel__extra :deep(.arco-btn) {
  padding: 0 12px;
}

/* 折叠面板：细边框 + 圆角，白色主题下规整清晰 */
.panel__collapse {
  border-radius: 6px;
}

/* 折叠头内容：工具名在左，版本 + 状态徽标强制靠右（与名称拉开距离） */
.tool-head {
  display: flex;
  align-items: center;
  width: 100%;
}

.tool-head__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1);
}

.tool-head__right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  padding-left: 24px;
}

/* 展开内容：组件明细竖向排布，左侧圆点对齐缩进 */
.tool-item__comps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 4px 2px 8px;
}

.tool-item__comp {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 组件名前的小圆点（纯 CSS，非 emoji），与名称对齐 */
.tool-item__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-primary-5);
  flex-shrink: 0;
}

/* 组件名称 + 简介的纵向容器，名称与状态标签自动拉距离 */
.tool-item__info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
}

.tool-item__comp-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-1);
  font-variant-numeric: tabular-nums;
}

/* 组件简介：小号灰字，过长单行省略 */
.tool-item__comp-desc {
  max-width: 100%;
  font-size: 12px;
  color: var(--color-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 版本 + 状态标签组：靠右对齐 */
.tool-item__tags {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
</style>