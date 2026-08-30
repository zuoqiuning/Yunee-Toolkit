/**
 * 转换任务 Store tasks.ts
 * 职责：维护渲染进程的「转换任务」列表，实时订阅主进程推送的事件更新任务状态与进度。
 *
 * 设计说明：
 *   - 任务数据唯一权威在主进程队列（manager.ts），本 store 只做镜像与增量更新；
 *   - 事件覆盖：progress（进度）/ complete（完成）/ error（失败）/ queued（入队）/ removed（移除）；
 *   - subscribe 在 App.vue 全局订阅，保证任务在任意页面都在后台持续更新；
 *   - 提供入队 / 取消 / 清理已结束的便捷方法（内部走 preload 桥接）。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

/** 入队参数 */
export interface StartConversionSpec {
  kind: 'video' | 'audio' | 'image' | 'container'
  input: string
  output: string
  options?: ConversionOptions
  priority?: 'low' | 'normal' | 'high'
}

export const useTasksStore = defineStore('tasks', () => {
  /** 全部转换任务（按创建时间排序） */
  const tasks = ref<ConversionTask[]>([])

  /** 已注册的事件取消函数集合 */
  let unsubscribers: (() => void)[] = []

  /** 从主进程拉取全量任务（初次加载 / 手动刷新） */
  async function refresh(): Promise<void> {
    const list = await window.yuneeAPI?.getConversionTasks()
    if (list) tasks.value = list
  }

  /** 订阅主进程任务事件（进度/完成/失败/入队/移除），返回取消订阅函数集合 */
  function subscribe(): void {
    const api = window.yuneeAPI
    if (!api) return

    // 进度：增量更新对应任务的 progress 字段；事件附带的 status 用于
    // 把「排队中」实时刷新为「转换中」（主进程队列运行后首次进度即带 running）
    const offProgress = api.onMainEvent('conversion-progress', (payload) => {
      const { id, progress, status } = payload as {
        id: string
        progress: TaskProgress
        status?: TaskStatus
      }
      const t = tasks.value.find((x) => x.id === id)
      if (t) {
        t.progress = progress
        if (status) t.status = status
      }
    })

    // 完成：标记 completed 并置满进度
    const offComplete = api.onMainEvent('conversion-complete', (payload) => {
      const { id } = payload as { id: string }
      const t = tasks.value.find((x) => x.id === id)
      if (t) {
        t.status = 'completed'
        t.progress = { ...t.progress, percent: 100 }
        t.finishedAt = Date.now()
      }
    })

    // 失败：标记 failed 并记录原因
    const offError = api.onMainEvent('conversion-error', (payload) => {
      const { id, message } = payload as { id: string; message: string }
      const t = tasks.value.find((x) => x.id === id)
      if (t) {
        t.status = 'failed'
        t.error = message
        t.finishedAt = Date.now()
      }
    })

    // 入队：追加新任务（去重，防止重复事件）
    const offQueued = api.onMainEvent('conversion-queued', (payload) => {
      const task = payload as ConversionTask
      if (!tasks.value.some((x) => x.id === task.id)) tasks.value.push(task)
    })

    // 移除（取消/清理）：过滤掉对应任务
    const offRemoved = api.onMainEvent('conversion-removed', (payload) => {
      const { id } = payload as { id: string }
      tasks.value = tasks.value.filter((x) => x.id !== id)
    })

    unsubscribers = [offProgress, offComplete, offError, offQueued, offRemoved]
  }

  /** 取消订阅（组件卸载时调用，避免泄漏） */
  function unsubscribe(): void {
    unsubscribers.forEach((fn) => fn())
    unsubscribers = []
  }

  /** 入队一个新转换任务 */
  async function start(spec: StartConversionSpec): Promise<ConversionTask | null> {
    return (await window.yuneeAPI?.startConversion(spec)) ?? null
  }

  /** 取消任务（运行中中止+清理残留；排队中移除） */
  async function cancel(id: string): Promise<boolean> {
    return (await window.yuneeAPI?.cancelConversion(id)) ?? false
  }

  /** 清理全部已结束任务，返回清理数量 */
  async function clearFinished(): Promise<number> {
    const n = await window.yuneeAPI?.clearFinishedConversions()
    if (n) {
      tasks.value = tasks.value.filter(
        (x) => x.status === 'queued' || x.status === 'running',
      )
    }
    return n ?? 0
  }

  return {
    tasks,
    refresh,
    subscribe,
    unsubscribe,
    start,
    cancel,
    clearFinished,
  }
})
