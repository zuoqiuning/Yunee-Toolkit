/**
 * 硬件信息 Store hardware.ts
 * 职责：缓存并暴露主进程检测到的显卡信息（型号 / 品牌 / 推荐加速方案），
 *       并在「首次运行」时依据显卡自动设置加速方案。
 *
 * 设计说明：
 *   - 显卡检测结果由主进程在启动阶段（Splash 期间）预加载，本 store 读取即得，几乎零等待；
 *   - 自动设置仅生效一次：已标记过自动设置、或用户已经手动选择过（非 auto）时不再覆盖；
 *   - 纯浏览器预览等无主进程环境静默降级为空状态，不影响功能面板使用。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useSettingsStore } from './settings'

/** 显卡品牌（与主进程 hardware.ts 保持一致） */
type GpuBrand = 'nvidia' | 'amd' | 'intel' | 'unknown'

/** 单张显卡信息 */
interface GpuInfo {
  brand: GpuBrand
  name: string
  /** 同型号显卡数量（交火 / 重复枚举合并后：1 或 N） */
  count: number
}

/** 本地持久化标记：是否已执行过「首次自动设置」 */
const AUTO_APPLIED_KEY = 'yunee.hw.autoApplied'

/** 显卡推荐品牌 → 对应硬件加速方案 */
const brandToHw: Record<Exclude<GpuBrand, 'unknown'>, 'nvidia' | 'amd' | 'intel'> = {
  nvidia: 'nvidia',
  amd: 'amd',
  intel: 'intel',
}

/**
 * 硬件信息 Store
 */
export const useHardwareStore = defineStore('hardware', () => {
  /** 检测到的显卡列表 */
  const gpus = ref<GpuInfo[]>([])
  /** 推荐加速品牌（优先独显：NVIDIA > AMD > Intel） */
  const best = ref<GpuBrand>('unknown')
  /** 是否已从主进程取到过数据 */
  const loaded = ref(false)
  /** 是否正在加载 */
  const loading = ref(false)

  /** 由推荐品牌推导的推荐加速方案；未知时保持 auto */
  const recommended = computed<'auto' | 'nvidia' | 'amd' | 'intel'>(() =>
    best.value === 'unknown' ? 'auto' : brandToHw[best.value],
  )

  /** 拉取主进程缓存的显卡检测结果（启动阶段已检测，几乎即时返回） */
  async function fetch() {
    if (loaded.value) return
    loading.value = true
    try {
      const info = await window.yuneeAPI?.getGpuInfo()
      if (info) {
        gpus.value = info.gpus
        best.value = info.best
      }
    } catch {
      // 无主进程（纯浏览器预览）或读取异常：保持空状态，界面自行降级
    } finally {
      loading.value = false
      loaded.value = true
    }
  }

  /**
   * 初始化：拉取显卡信息，并在「首次运行」依据显卡自动设置加速方案。
   * 规则：
   *   - 已标记过自动设置 → 跳过，尊重用户后续手动选择；
   *   - 用户当前已手动选择（hwAccel !== 'auto'）→ 不覆盖，仅打标记；
   *   - 用户未手动选过（仍为 auto）→ 自动设置为推荐方案并打标记。
   */
  async function init() {
    await fetch()
    if (localStorage.getItem(AUTO_APPLIED_KEY)) return
    localStorage.setItem(AUTO_APPLIED_KEY, '1')
    const settings = useSettingsStore()
    if (settings.hwAccel === 'auto' && recommended.value !== 'auto') {
      settings.hwAccel = recommended.value
      window.yuneeAPI?.logEvent(
        'hardware',
        '首次自动选配',
        `依据显卡自动启用 ${recommended.value} 硬件加速`,
      )
    } else {
      window.yuneeAPI?.logEvent('hardware', '首次自动选配', `推荐 ${recommended.value}，未自动覆盖用户设置`)
    }
  }

  return { gpus, best, loaded, loading, recommended, fetch, init }
})