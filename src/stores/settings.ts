/**
 * 全局设置 Store
 * 职责：集中管理“设置”抽屉中的全部配置项，并自动持久化到 localStorage。
 *
 * 设计说明：
 *   - 采用 setup 风格 store，逐项返回响应式 ref，模板中可直接读写。
 *   - 深度 watch 状态，任何字段变更即写入 localStorage，实现即时持久化。
 *   - 设置项聚焦工具可用性（主题/自启/输出/引擎/存储），不含各功能页的转换参数。
 */
import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

/** 硬件加速偏好 */
export type HwAccel = 'auto' | 'nvidia' | 'intel' | 'amd' | 'cpu'
/** 输出文件重名策略 */
export type OverwritePolicy = 'autoRename' | 'overwrite' | 'ask'
/** 转换完成后动作 */
export type CompleteAction = 'openFolder' | 'none'
/** 任务优先级 */
export type TaskPriority = 'low' | 'normal' | 'high'
/** 日志级别（保留定义以兼容旧数据；界面已固定为调试级全量记录） */
export type LogLevel = 'quiet' | 'info' | 'debug'
/** 关闭窗口行为：退出 / 最小化到托盘 */
export type CloseBehavior = 'exit' | 'tray'
/** 输出文件命名预设 */
export type FileNamePreset = 'keep' | 'time-suffix' | 'time-prefix'

/** 设置字段清单：顺序与 refs / 持久化 / 变更日志严格保持一致 */
const FIELD_NAMES = [
  'theme',
  'autoStart',
  'outputDir',
  'overwritePolicy',
  'completeAction',
  'keepSource',
  'hwAccel',
  'threadCount',
  'taskPriority',
  'logLevel',
  'tempDir',
  'logDir',
  'autoCleanTemp',
  'cleanRetainDays',
  'logRetainDays',
  'logMaxFiles',
  'closeBehavior',
  'checkUpdateOnStart',
  'themeFollowSystem',
  'fileNamePreset',
  'playSoundOnComplete',
  'playSoundOnError',
  'soundComplete',
  'soundError',
  'playClickSound',
  'clickSound',
] as const

/** 本地持久化键名 */
const STORAGE_KEY = 'yunee.settings.v1'

/** 默认目录的应用元信息：记录上次应用的默认输出/临时路径，用于在默认值变更时安全重置 */
const DEFAULT_DIRS_META_KEY = 'yunee.defaultDirs.meta'

/** 已应用的安装目录默认值（供“恢复默认”回填，未应用时为空） */
let appliedDefaultOutputDir = ''
let appliedDefaultTempDir = ''
let appliedDefaultLogDir = ''

/** 默认目录元信息结构 */
interface DirsMeta {
  /** 是否已初始化过（用于首次从旧逻辑迁移时强制应用） */
  initialized: boolean
  /** 上次应用的默认输出目录 */
  out: string
  /** 上次应用的默认临时目录 */
  temp: string
  /** 上次应用的默认日志目录 */
  log: string
}

/** 读取默认目录元信息 */
function loadDirsMeta(): DirsMeta {
  try {
    const raw = localStorage.getItem(DEFAULT_DIRS_META_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<DirsMeta>
      return { initialized: !!p.initialized, out: p.out ?? '', temp: p.temp ?? '', log: p.log ?? '' }
    }
  } catch {
    // 忽略读取失败
  }
  return { initialized: false, out: '', temp: '', log: '' }
}

/** 保存默认目录元信息 */
function saveDirsMeta(meta: DirsMeta): void {
  try {
    localStorage.setItem(DEFAULT_DIRS_META_KEY, JSON.stringify(meta))
  } catch {
    // 忽略存储失败
  }
}

/** 各设置项默认值 */
interface SettingsState {
  /** 主题：浅色 / 深色 */
  theme: 'light' | 'dark'
  /** 开机自启 */
  autoStart: boolean
  /** 默认输出目录（空表示“与源文件同目录”） */
  outputDir: string
  /** 输出文件重名策略 */
  overwritePolicy: OverwritePolicy
  /** 转换完成后动作 */
  completeAction: CompleteAction
  /** 转码后是否保留源文件 */
  keepSource: boolean
  /** 硬件加速偏好 */
  hwAccel: HwAccel
  /** 编码线程数（0 表示自动） */
  threadCount: number
  /** 转码任务优先级 */
  taskPriority: TaskPriority
  /** 日志级别 */
  logLevel: LogLevel
  /** 临时文件目录（空表示使用系统默认） */
  tempDir: string
  /** 日志目录（存放软件运行日志） */
  logDir: string
  /** 是否自动清理临时文件 */
  autoCleanTemp: boolean
  /** 临时文件保留天数 */
  cleanRetainDays: number
  /** 日志保留天数（超过即自动清理） */
  logRetainDays: number
  /** 日志文件数量上限（超过即清理最旧的） */
  logMaxFiles: number
  /** 关闭窗口行为：退出 / 最小化到托盘 */
  closeBehavior: CloseBehavior
  /** 启动时检查更新 */
  checkUpdateOnStart: boolean
  /** 是否跟随系统深浅色主题（开启后手动主题切换失效） */
  themeFollowSystem: boolean
  /** 输出文件命名预设 */
  fileNamePreset: FileNamePreset
  /** 转换完成后播放提示音 */
  playSoundOnComplete: boolean
  /** 转换失败时播放提示音 */
  playSoundOnError: boolean
  /** 转换完成提示音（声音库 id，见 utils/sounds.ts COMPLETE_SOUNDS） */
  soundComplete: string
  /** 转换失败提示音（声音库 id，见 utils/sounds.ts ERROR_SOUNDS） */
  soundError: string
  /** 点击按钮时播放提示音 */
  playClickSound: boolean
  /** 按钮点击提示音（声音库 id，见 utils/sounds.ts CLICK_SOUNDS） */
  clickSound: string
}

/** 默认设置 */
const DEFAULTS: SettingsState = {
  theme: 'light',
  autoStart: false,
  outputDir: '',
  overwritePolicy: 'autoRename',
  completeAction: 'openFolder',
  keepSource: true,
  hwAccel: 'auto',
  threadCount: 0,
  taskPriority: 'normal',
  logLevel: 'info',
  tempDir: '',
  logDir: '',
  autoCleanTemp: true,
  cleanRetainDays: 7,
  logRetainDays: 7,
  logMaxFiles: 50,
  closeBehavior: 'exit',
  checkUpdateOnStart: true,
  themeFollowSystem: false,
  fileNamePreset: 'keep',
  playSoundOnComplete: true,
  playSoundOnError: true,
  soundComplete: 'chime',
  soundError: 'fall',
  playClickSound: true,
  clickSound: 'tick',
}

/** 从 localStorage 安全读取设置，失败或缺失时回退默认值 */
function load(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    // 仅合并已知键，防止脏数据 / 数据结构变更
    const parsed = JSON.parse(raw) as Partial<SettingsState>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * 全局设置 Store
 */
export const useSettingsStore = defineStore('settings', () => {
  const state = load()

  // 逐项导出响应式 ref（reactive 保证 watch 深度生效）
  const theme = ref<SettingsState['theme']>(state.theme)
  const autoStart = ref(state.autoStart)
  const outputDir = ref(state.outputDir)
  const overwritePolicy = ref<OverwritePolicy>(state.overwritePolicy)
  const completeAction = ref<CompleteAction>(state.completeAction)
  const keepSource = ref(state.keepSource)
  const hwAccel = ref<HwAccel>(state.hwAccel)
  const threadCount = ref(state.threadCount)
  const taskPriority = ref<TaskPriority>(state.taskPriority)
  const logLevel = ref<LogLevel>(state.logLevel)
  const tempDir = ref(state.tempDir)
  const logDir = ref(state.logDir)
  const autoCleanTemp = ref(state.autoCleanTemp)
  const cleanRetainDays = ref(state.cleanRetainDays)
  const logRetainDays = ref(state.logRetainDays)
  const logMaxFiles = ref(state.logMaxFiles)
  const closeBehavior = ref<CloseBehavior>(state.closeBehavior)
  const checkUpdateOnStart = ref(state.checkUpdateOnStart)
  const themeFollowSystem = ref(state.themeFollowSystem)
  const fileNamePreset = ref<FileNamePreset>(state.fileNamePreset)
  const playSoundOnComplete = ref(state.playSoundOnComplete)
  const playSoundOnError = ref(state.playSoundOnError)
  const soundComplete = ref(state.soundComplete)
  const soundError = ref(state.soundError)
  const playClickSound = ref(state.playClickSound)
  const clickSound = ref(state.clickSound)

  // 字段名 -> 响应式 ref 映射，供按面板/按卡片定点恢复默认值
  const fieldRefs: Record<keyof SettingsState, { value: unknown }> = {
    theme,
    autoStart,
    outputDir,
    overwritePolicy,
    completeAction,
    keepSource,
    hwAccel,
    threadCount,
    taskPriority,
    logLevel,
    tempDir,
    logDir,
    autoCleanTemp,
    cleanRetainDays,
    logRetainDays,
    logMaxFiles,
    closeBehavior,
    checkUpdateOnStart,
    themeFollowSystem,
    fileNamePreset,
    playSoundOnComplete,
    playSoundOnError,
    soundComplete,
    soundError,
    playClickSound,
    clickSound,
  }

  // 任何字段变化时立即写入 localStorage（读取各 ref 当前值，序列化后保存）
  watch(
    [
      theme,
      autoStart,
      outputDir,
      overwritePolicy,
      completeAction,
      keepSource,
      hwAccel,
      threadCount,
      taskPriority,
      logLevel,
      tempDir,
      logDir,
      autoCleanTemp,
      cleanRetainDays,
      logRetainDays,
      logMaxFiles,
      closeBehavior,
      checkUpdateOnStart,
      themeFollowSystem,
      fileNamePreset,
      playSoundOnComplete,
      playSoundOnError,
      soundComplete,
      soundError,
      playClickSound,
      clickSound,
    ],
    () => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            theme: theme.value,
            autoStart: autoStart.value,
            outputDir: outputDir.value,
            overwritePolicy: overwritePolicy.value,
            completeAction: completeAction.value,
            keepSource: keepSource.value,
            hwAccel: hwAccel.value,
            threadCount: threadCount.value,
            taskPriority: taskPriority.value,
            logLevel: logLevel.value,
            tempDir: tempDir.value,
            logDir: logDir.value,
            autoCleanTemp: autoCleanTemp.value,
            cleanRetainDays: cleanRetainDays.value,
            logRetainDays: logRetainDays.value,
            logMaxFiles: logMaxFiles.value,
            closeBehavior: closeBehavior.value,
            checkUpdateOnStart: checkUpdateOnStart.value,
            themeFollowSystem: themeFollowSystem.value,
            fileNamePreset: fileNamePreset.value,
            playSoundOnComplete: playSoundOnComplete.value,
            playSoundOnError: playSoundOnError.value,
            soundComplete: soundComplete.value,
            soundError: soundError.value,
            playClickSound: playClickSound.value,
            clickSound: clickSound.value,
          }),
        )
      } catch {
        // 存储失败（如空间不足）应静默，不影响使用
      }
    },
  )

  // 设置变更日志：任意设置项变化即上报主进程（留痕便于排查问题/还原现场）
  // 对比新旧值，仅记录变化字段；长文本（如路径）截断展示，避免日志行过长。
  watch(
    [
      theme,
      autoStart,
      outputDir,
      overwritePolicy,
      completeAction,
      keepSource,
      hwAccel,
      threadCount,
      taskPriority,
      logLevel,
      tempDir,
      logDir,
      autoCleanTemp,
      cleanRetainDays,
      logRetainDays,
      logMaxFiles,
      closeBehavior,
      checkUpdateOnStart,
      themeFollowSystem,
      fileNamePreset,
      playSoundOnComplete,
      playSoundOnError,
      soundComplete,
      soundError,
      playClickSound,
      clickSound,
    ],
    (newVals: unknown[], oldVals: unknown[]) => {
      const parts: string[] = []
      for (let i = 0; i < FIELD_NAMES.length; i++) {
        if (newVals[i] !== oldVals[i]) {
          let v = String(newVals[i] ?? '')
          if (v.length > 80) v = `${v.slice(0, 80)}…`
          parts.push(`${FIELD_NAMES[i]}=${v}`)
        }
      }
      // 主题同样属于用户设置：仅在手动切换/复位时变化（App.vue 的 watchEffect 只读不写），无需排除
      if (parts.length) {
        window.yuneeAPI?.logEvent('settings', '更改设置', parts.join('；'))
      }
    },
  )

  /** 指定字段的默认值：输出/临时/日志目录优先回填已应用的安装目录默认 */
  function defaultOf(field: keyof SettingsState): unknown {
    if (field === 'outputDir') return appliedDefaultOutputDir || DEFAULTS.outputDir
    if (field === 'tempDir') return appliedDefaultTempDir || DEFAULTS.tempDir
    if (field === 'logDir') return appliedDefaultLogDir || DEFAULTS.logDir
    return DEFAULTS[field]
  }

  /** 重置为默认值 */
  function reset() {
    theme.value = DEFAULTS.theme
    autoStart.value = DEFAULTS.autoStart
    outputDir.value = defaultOf('outputDir') as string
    overwritePolicy.value = DEFAULTS.overwritePolicy
    completeAction.value = DEFAULTS.completeAction
    keepSource.value = DEFAULTS.keepSource
    hwAccel.value = DEFAULTS.hwAccel
    threadCount.value = DEFAULTS.threadCount
    taskPriority.value = DEFAULTS.taskPriority
    logLevel.value = DEFAULTS.logLevel
    tempDir.value = defaultOf('tempDir') as string
    logDir.value = defaultOf('logDir') as string
    autoCleanTemp.value = DEFAULTS.autoCleanTemp
    cleanRetainDays.value = DEFAULTS.cleanRetainDays
    logRetainDays.value = DEFAULTS.logRetainDays
    logMaxFiles.value = DEFAULTS.logMaxFiles
    closeBehavior.value = DEFAULTS.closeBehavior
    checkUpdateOnStart.value = DEFAULTS.checkUpdateOnStart
    themeFollowSystem.value = DEFAULTS.themeFollowSystem
    fileNamePreset.value = DEFAULTS.fileNamePreset
    playSoundOnComplete.value = DEFAULTS.playSoundOnComplete
    playSoundOnError.value = DEFAULTS.playSoundOnError
    soundComplete.value = DEFAULTS.soundComplete
    soundError.value = DEFAULTS.soundError
    playClickSound.value = DEFAULTS.playClickSound
    clickSound.value = DEFAULTS.clickSound
  }

  /** 仅将指定的若干字段恢复为默认值（用于各设置卡片表头的“恢复默认”） */
  function resetFields(fields: (keyof SettingsState)[]) {
    for (const f of fields) {
      fieldRefs[f].value = defaultOf(f)
    }
  }

  /**
   * 应用默认输出/临时目录（开发为项目根目录，生产为文档目录下的应用子目录）。
   * 规则（绝不覆盖用户主动选择）：
   *   - 当前值为空 → 回填默认；
   *   - 当前值仍等于“上次应用的默认值”但默认已变更 → 迁移到新默认（解决历史默认路径变更的旧残留）；
   *   - 用户自定义了目录（非空且非上次默认）→ 一律保留。
   */
  async function applyDefaultDirs() {
    try {
      const dd = await window.yuneeAPI?.getDefaultDirs()
      if (!dd) return
      appliedDefaultOutputDir = dd.outputDir
      appliedDefaultTempDir = dd.tempDir
      appliedDefaultLogDir = dd.logDir

      const meta = loadDirsMeta()
      const setOut = meta.out === outputDir.value || !outputDir.value
      const setTemp = meta.temp === tempDir.value || !tempDir.value
      const setLog = meta.log === logDir.value || !logDir.value
      if (setOut) outputDir.value = dd.outputDir
      if (setTemp) tempDir.value = dd.tempDir
      if (setLog) logDir.value = dd.logDir
      saveDirsMeta({ initialized: true, out: dd.outputDir, temp: dd.tempDir, log: dd.logDir })
    } catch {
      // 无主进程（如纯浏览器预览）或读取失败时静默
    }
  }

  return {
    theme,
    autoStart,
    outputDir,
    overwritePolicy,
    completeAction,
    keepSource,
    hwAccel,
    threadCount,
    taskPriority,
    logLevel,
    tempDir,
    logDir,
    autoCleanTemp,
    cleanRetainDays,
    logRetainDays,
    logMaxFiles,
    closeBehavior,
    checkUpdateOnStart,
    themeFollowSystem,
    fileNamePreset,
    playSoundOnComplete,
    playSoundOnError,
    soundComplete,
    soundError,
    playClickSound,
    clickSound,
    reset,
    resetFields,
    applyDefaultDirs,
  }
})