/**
 * 提示音工具 sounds.ts
 * 职责：通过 Web Audio API 合成「转换完成 / 转换失败」的提示音。
 * 说明：不依赖任何音频文件，跨平台可用；音频上下文懒创建并复用，
 *       失败时静默降级（不播放），不影响主流程。
 */
let audioCtx: AudioContext | null = null

/**
 * 获取（并复用）音频上下文。
 * 首次调用创建，被系统挂起时尝试恢复；创建失败返回 null（静默降级）。
 */
function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext()
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume()
    }
    return audioCtx
  } catch {
    return null
  }
}

/**
 * 播放一个正弦音：指定频率 / 延迟（秒）/ 音量。
 * 包络采用“快起音 + 指数衰减”，避免爆音，听感柔和。
 */
function playTone(ctx: AudioContext, freq: number, delay: number, volume = 0.16): void {
  const now = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.55)
}

/** 转换完成提示音：上行三音和弦（C5 → E5 → G5），清脆悦耳 */
export function playCompleteSound(): void {
  const ctx = getCtx()
  if (!ctx) return
  playTone(ctx, 523.25, 0)
  playTone(ctx, 659.25, 0.12)
  playTone(ctx, 783.99, 0.24)
}

/** 转换失败提示音：下行两音（E4 → C4），低沉柔和 */
export function playErrorSound(): void {
  const ctx = getCtx()
  if (!ctx) return
  playTone(ctx, 329.63, 0)
  playTone(ctx, 261.63, 0.16)
}
