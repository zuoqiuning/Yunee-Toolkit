/**
 * CPU 信息 Store cpu.ts
 * 职责：缓存主进程检测到的 CPU 信息（型号 / 物理核 / 逻辑核），
 *       供「性能」面板展示本机 CPU 并联限制“编码线程数”输入上限。
 *
 * 设计说明：
 *   - CPU 检测结果由主进程在启动阶段（Splash 期间）预加载，本 store 读取即得，几乎零等待；
 *   - 纯浏览器预览等无主进程环境静默降级为空状态，线程上限由面板回退为兜底值。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/** 本机 CPU 信息（与主进程 cpu.ts 保持一致） */
interface CpuInfo {
  model: string
  physicalCores: number
  logicalCores: number
}

/** 检测失败时的兜底线程上限（无法探测本机核数时使用的保守最大值） */
export const FALLBACK_MAX_THREADS = 64

/**
 * CPU 信息 Store
 */
export const useCpuStore = defineStore('cpu', () => {
  /** CPU 信息（未检测到为 null） */
  const info = ref<CpuInfo | null>(null)
  /** 是否已尝试从主进程读取过数据 */
  const loaded = ref(false)
  /** 是否正在加载 */
  const loading = ref(false)

  /** 线程输入上限：检测到 CPU 用逻辑核数，否则用兜底值（0 表示“自动”仍可输入） */
  const maxThreads = computed(() =>
    info.value && info.value.logicalCores > 0 ? info.value.logicalCores : FALLBACK_MAX_THREADS,
  )

  /** 拉取主进程缓存的 CPU 检测结果（启动阶段已检测，几乎即时返回） */
  async function fetch() {
    if (loaded.value) return
    loading.value = true
    try {
      info.value = (await window.yuneeAPI?.getCpuInfo()) ?? null
    } catch {
      // 无主进程（纯浏览器预览）或读取异常：保持空状态，界面自行降级
      info.value = null
    } finally {
      loading.value = false
      loaded.value = true
    }
  }

  return { info, loaded, loading, maxThreads, fetch }
})