/**
 * 根组件
 * 职责：应用最外层容器，使用 Arco Layout 布局 —— 顶部 a-layout-header 收自绘标题栏，
 *       下方内容区通过路由渲染主布局（MainLayout）。
 * 布局：a-layout 纵向铺满；header 固定高度承载标题栏，剩余区域由路由渲染 MainLayout 填充。
 */
<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { Notification, Button } from '@arco-design/web-vue'
import TitleBar from '@/components/common/TitleBar.vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useHardwareStore } from '@/stores/hardware'
import { useTasksStore } from '@/stores/tasks'
import { highlight } from '@/utils/notify'
import { CLICK_SOUNDS, COMPLETE_SOUNDS, ERROR_SOUNDS, playSoundById } from '@/utils/sounds'

const settings = useSettingsStore()
const appStore = useAppStore()
const hardware = useHardwareStore()
const tasksStore = useTasksStore()

// 系统深浅色偏好（用于「跟随系统主题」）。
// 初值用同步 CSS 媒体查询直接读取，确保 Vue 首次渲染即为正确主题，
// 避免深色系统下先以浅色渲染导致的白屏闪烁；随后再由主进程权威结果校准。
const systemDark = ref(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
let mediaQuery: MediaQueryList | null = null
/** matchMedia 兜底回调（仅纯浏览器预览环境使用） */
const onSystemSchemeChange = (e: MediaQueryListEvent) => {
  systemDark.value = e.matches
}
/** 主进程 nativeTheme 变化推送的取消订阅函数 */
let disposeThemeListener: (() => void) | null = null

/**
 * 初始化系统深浅色检测：
 *  - Electron 环境：优先走主进程 nativeTheme（shouldUseDarkColors），
 *    系统配色是操作系统级可靠检测；系统设置变化由主进程主动推送。
 *  - 纯浏览器预览（无 Electron）：回退渲染层 matchMedia 检测。
 */
async function initSystemTheme() {
  const api = window.yuneeAPI
  if (api?.getSystemDark) {
    // 初始值以主进程检测结果为准，避免 matchMedia 偶尔返回滞后值导致配色错误
    systemDark.value = await api.getSystemDark().catch(() => systemDark.value)
    disposeThemeListener = api.onMainEvent('theme:system-changed', (payload) => {
      systemDark.value = payload === true
    })
    return
  }
  if (window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', onSystemSchemeChange)
  }
}

// 实际生效主题：开启「跟随系统」时取系统偏好，否则取手动设置值
const effectiveTheme = computed(() =>
  settings.themeFollowSystem ? (systemDark.value ? 'dark' : 'light') : settings.theme,
)

// 主题同步：浅色/深色 → 切换 <body> 的 arco-theme 属性
watchEffect(() => {
  document.body.setAttribute('arco-theme', effectiveTheme.value)
})

// 转换完成 / 失败事件监听：按设置播放提示音（转换引擎推送时触发）
let disposeCompleteListener: (() => void) | null | undefined = null
let disposeErrorListener: (() => void) | null | undefined = null
// 自动更新事件监听：由 subscribeUpdater 收集，卸载时统一取消
let disposeUpdaterListeners: (() => void)[] = []

// 更新流程通知统一展示在右下角（区别于其它右上角提示），并复用固定 id：
// Arco Notification 对相同 id 调用会“更新”而非新增，便于覆盖“正在检测/下载”进度与清理旧通知
const UPDATE_NOTIFY_POSITION = 'bottomRight' // 右下角
const UPDATE_CHECKING_ID = 'update-checking' // 正在检测更新
const UPDATE_AVAILABLE_ID = 'update-available' // 发现新版本（带操作按钮）
const UPDATE_DOWNLOADING_ID = 'update-downloading' // 正在后台下载
const UPDATE_DOWNLOADED_ID = 'update-downloaded' // 下载完成（带操作按钮）

/** 点击音效命中的可交互控件选择器（按钮 / 开关 / 单选 / 页签 / 菜单等） */
const CLICK_SOUND_SELECTOR = [
  'button',
  '.arco-btn',
  '.arco-switch',
  '.arco-radio',
  '.arco-checkbox',
  '.arco-tabs-tab',
  '.arco-menu-item',
  '.arco-select-view',
  '.arco-collapse-item-header',
  '.arco-dropdown-menu-item',
  '.arco-link',
].join(', ')

/**
 * 全局按钮点击音效：
 * 开启「点击音效」时，点击上述可交互控件即播放短促点击音。
 * 采用 document 事件委托 + closest 匹配，一次点击只触发一声，性能与覆盖兼顾。
 */
function onDocumentClick(e: MouseEvent) {
  if (!settings.playClickSound) return
  const target = e.target
  if (!(target instanceof Element)) return
  if (target.closest(CLICK_SOUND_SELECTOR)) {
    playSoundById(
      settings.clickSound,
      CLICK_SOUNDS[0].id,
      settings.clickSoundVolume / 100,
    )
  }
}

/**
 * 订阅自动更新事件（右下角通知），完整反馈更新流程：
 *  - 启动自动检查：右下角提示「正在检测更新」（duration 0 持续显示），直至出结果；
 *  - 连接失败（国内连 GitHub 不稳定）：提示「更新检测失败」；
 *  - 发现新版本：带操作按钮「稍后 / 立即更新」，持续显示可手动关闭；
 *    点「立即更新」→ 提示「正在后台下载更新…」，并随 update:downloading 刷新进度；
 *  - 下载完成：带操作按钮「稍后重启 / 立即重启」，点「立即重启」退出并安装；
 *  - 手动检查（设置面板内已有状态反馈）：此处仅提示「已是最新 / 检查失败」等结果。
 */
function subscribeUpdater() {
  const on = window.yuneeAPI?.onMainEvent
  if (!on) return

  // 正在检测更新：仅启动自动检查时提示（手动检查由设置面板内联反馈，避免重复打扰）
  disposeUpdaterListeners.push(
    on('update:checking', (payload) => {
      const { manual } = (payload ?? {}) as { manual?: boolean }
      if (manual) return
      Notification.info({
        id: UPDATE_CHECKING_ID,
        position: UPDATE_NOTIFY_POSITION,
        content: highlight('正在检测更新…'),
        duration: 0,
        closable: true,
      })
    }),
  )

  // 发现新版本：带「稍后 / 立即更新」操作按钮，持续显示可手动关闭
  disposeUpdaterListeners.push(
    on('update:available', (payload) => {
      const { version } = (payload ?? {}) as { version?: string }
      Notification.remove(UPDATE_CHECKING_ID)
      const close = () => Notification.remove(UPDATE_AVAILABLE_ID)
      Notification.info({
        id: UPDATE_AVAILABLE_ID,
        position: UPDATE_NOTIFY_POSITION,
        title: '发现新版本',
        content: highlight(`v${version ?? ''} 已可用，是否立即更新？`),
        duration: 0,
        closable: true,
        footer: () =>
          h(
            'div',
            { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
            [
              h(Button, { type: 'secondary', size: 'small', onClick: close }, () => '稍后'),
              h(
                Button,
                {
                  type: 'primary',
                  size: 'small',
                  onClick: () => {
                    close()
                    // 立即更新：提示正在后台下载（持续显示，随后由进度事件刷新）
                    Notification.info({
                      id: UPDATE_DOWNLOADING_ID,
                      position: UPDATE_NOTIFY_POSITION,
                      content: highlight('正在后台下载更新…'),
                      duration: 0,
                      closable: true,
                    })
                  },
                },
                () => '立即更新',
              ),
            ],
          ),
      })
    }),
  )

  // 下载进度：实时刷新「正在后台下载」通知的进度文案
  disposeUpdaterListeners.push(
    on('update:downloading', (payload) => {
      const { percent } = (payload ?? {}) as { percent?: number }
      Notification.info({
        id: UPDATE_DOWNLOADING_ID,
        position: UPDATE_NOTIFY_POSITION,
        content: highlight(`正在后台下载更新…（${Math.round(percent ?? 0)}%）`),
        duration: 0,
        closable: true,
      })
    }),
  )

  // 下载完成：带「稍后重启 / 立即重启」操作按钮，持续显示可手动关闭
  disposeUpdaterListeners.push(
    on('update:downloaded', (payload) => {
      const { version } = (payload ?? {}) as { version?: string }
      Notification.remove(UPDATE_DOWNLOADING_ID)
      const close = () => Notification.remove(UPDATE_DOWNLOADED_ID)
      Notification.success({
        id: UPDATE_DOWNLOADED_ID,
        position: UPDATE_NOTIFY_POSITION,
        title: '更新下载完成',
        content: highlight(`v${version ?? ''} 已下载完成，重启应用即可完成安装。`),
        duration: 0,
        closable: true,
        footer: () =>
          h(
            'div',
            { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
            [
              h(Button, { type: 'secondary', size: 'small', onClick: close }, () => '稍后重启'),
              h(
                Button,
                {
                  type: 'primary',
                  size: 'small',
                  onClick: () => {
                    window.yuneeAPI?.logEvent('updater', '重启安装更新', `安装 v${version ?? ''}`)
                    window.yuneeAPI?.installUpdate()
                  },
                },
                () => '立即重启',
              ),
            ],
          ),
      })
    }),
  )

  // 无新版本：手动检查提示已是最新；启动检查静默（仅关闭「正在检测更新」提示）
  disposeUpdaterListeners.push(
    on('update:not-available', (payload) => {
      const { manual } = (payload ?? {}) as { manual?: boolean }
      Notification.remove(UPDATE_CHECKING_ID)
      if (manual) Notification.success({ content: highlight('当前已是最新版本。') })
    }),
  )

  // 检查 / 下载出错：国内连接 GitHub 不稳定，启动自动检查失败也需明确提示「更新检测失败」
  disposeUpdaterListeners.push(
    on('update:error', (payload) => {
      const { manual, message } = (payload ?? {}) as { manual?: boolean; message?: string }
      Notification.remove(UPDATE_CHECKING_ID)
      Notification.remove(UPDATE_DOWNLOADING_ID)
      if (manual) {
        Notification.error({ content: highlight(`检查更新失败：${message ?? '未知错误'}`) })
      } else {
        Notification.error({ content: '更新检测失败', duration: 5000 })
      }
    }),
  )
}

/**
 * 同步日志系统：把渲染进程的日志目录与清理规则发给主进程。
 * 目录为空时主进程自动使用默认日志目录（用户“恢复默认”后即可切回）。
 */
async function syncLogger() {
  await window.yuneeAPI?.initLogger(settings.logDir, settings.logRetainDays, settings.logMaxFiles)
}

// 日志目录或清理规则变化时实时同步
watch(
  [() => settings.logDir, () => settings.logRetainDays, () => settings.logMaxFiles],
  syncLogger,
)

/**
 * 同步临时文件自动清理配置：把渲染进程的临时目录 / 自动清理开关 / 保留天数发给主进程，
 * 主进程据此在应用启动时自动清理“残留”临时文件（仅删除超过保留天数的条目）。
 */
async function syncTempClean() {
  await window.yuneeAPI?.syncTempClean(
    settings.tempDir,
    settings.autoCleanTemp,
    settings.cleanRetainDays,
  )
}

// 临时目录 / 自动清理开关 / 保留天数变化时实时同步（主进程随配置变化即时清理）
watch(
  [() => settings.tempDir, () => settings.autoCleanTemp, () => settings.cleanRetainDays],
  syncTempClean,
)

// 关闭窗口行为变化时同步主进程（托盘关闭拦截逻辑）；
// immediate 让启动时（含全局恢复默认）也立即对齐主进程状态
watch(
  () => settings.closeBehavior,
  (v) => {
    window.yuneeAPI?.setCloseBehavior(v)
  },
  { immediate: true },
)

// 更新代理配置变化时同步主进程（immediate 兜底：面板懒加载时也保证启动即对齐）
watch(
  [() => settings.updateProxyEnabled, () => settings.updateProxyUrl],
  () => {
    window.yuneeAPI?.applyUpdateProxy(settings.updateProxyEnabled, settings.updateProxyUrl)
  },
  { immediate: false },
)

// 主题设置同步到主进程：启动及手动切换主题 / 「跟随系统」开关变化时上报，
// 主进程落盘用户主题，供下次启动的 Splash 加载窗口 / 主窗口背景色读取（与界面配色一致）。
watch(
  [() => settings.theme, () => settings.themeFollowSystem],
  () => {
    window.yuneeAPI?.syncUserTheme(settings.theme, settings.themeFollowSystem)
  },
  { immediate: true },
)

// 应用启动后：
//  - 拉取主进程元信息（版本号统一为 beta 展示），并将默认输出/临时目录回填（不覆盖自定义）；
//  - 读取显卡检测结果（启动阶段已预加载），并执行「首次运行」自动设置加速方案；
//  - 初始化日志系统（目录 + 清理规则），开启本次会话的记录；
//  - 订阅系统深浅色偏好与转换完成/失败事件（提示音）。
onMounted(async () => {
  appStore.fetchAppMeta()
  await settings.applyDefaultDirs()
  hardware.init()
  await syncLogger()
  // 同步临时文件清理配置并触发启动清理（默认目录回填完成后执行，确保拿到最终 tempDir）
  await syncTempClean()
  // 订阅自动更新事件（右下角通知：检测中 / 发现新版本 / 下载进度 / 下载完成 / 失败）
  subscribeUpdater()
  // 启动即应用「更新代理」配置：更新设置面板为懒加载（用户不进设置就不挂载），
  // 若不在此同步，已配置代理的用户启动静默检查会直连 GitHub 而失败。
  window.yuneeAPI?.applyUpdateProxy(settings.updateProxyEnabled, settings.updateProxyUrl)
  // 主界面就绪后再触发启动检查更新：
  // 等待当前渲染帧落定（Splash 关闭、主窗口显示、主界面元素渲染完毕）再联网，
  // 既满足「主界面出现时开始检测」，也避免加载阶段提前联网影响启动速度。
  await nextTick()
  if (settings.checkUpdateOnStart) {
    window.yuneeAPI?.checkForUpdates(false)
  }
  // 转换任务：拉取现有任务并全局订阅进度/结果事件（任务在任意页面都持续更新）
  await tasksStore.refresh()
  tasksStore.subscribe()
  // 订阅系统深浅色偏好（跟随系统主题的基础；Electron 走主进程 nativeTheme，浏览器回退 matchMedia）
  await initSystemTheme()
  // 转换完成 / 失败：按设置播放提示音（任务队列引擎推送时触发）
  disposeCompleteListener = window.yuneeAPI?.onMainEvent('conversion-complete', () => {
    if (settings.playSoundOnComplete)
      playSoundById(settings.soundComplete, COMPLETE_SOUNDS[0].id, settings.soundCompleteVolume / 100)
  })
  disposeErrorListener = window.yuneeAPI?.onMainEvent('conversion-error', () => {
    if (settings.playSoundOnError)
      playSoundById(settings.soundError, ERROR_SOUNDS[0].id, settings.soundErrorVolume / 100)
  })
  // 全局按钮点击音效（事件委托，点击各类控件时按设置播放短促点击音）
  document.addEventListener('click', onDocumentClick)
  // 主界面就绪留痕：渲染进程已完成挂载，可开始交互
  window.yuneeAPI?.logEvent('ui', '界面就绪', '渲染进程挂载完成，进入主界面')
})

// 组件卸载时取消订阅，避免泄漏
onBeforeUnmount(() => {
  disposeCompleteListener?.()
  disposeErrorListener?.()
  disposeThemeListener?.()
  disposeUpdaterListeners.forEach((off) => off())
  disposeUpdaterListeners = []
  mediaQuery?.removeEventListener('change', onSystemSchemeChange)
  document.removeEventListener('click', onDocumentClick)
  tasksStore.unsubscribe()
})
</script>

<template>
  <a-layout class="app-layout">
    <!-- 顶部：自绘窗口标题栏（Arco a-layout-header 承载） -->
    <a-layout-header class="app-header">
      <TitleBar />
    </a-layout-header>
    <!-- 主体：由路由渲染主布局（侧边栏 + 内容区） -->
    <router-view class="app-body" />
  </a-layout>
</template>

<style scoped>
/* 整体外壳：纵向铺满窗口，header 固定高度承载标题栏。
   窗口外观（圆角/阴影）由系统绘制，渲染层直接铺满即可 */
.app-layout {
  height: 100%;
  overflow: hidden;
}

/* header 覆盖 Arco 默认高度/行高，交还给 TitleBar 自控高度 */
.app-header {
  height: auto;
  line-height: normal;
  padding: 0;
  background: transparent;
}

/* 主体占满 header 之外剩余高度 */
.app-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>