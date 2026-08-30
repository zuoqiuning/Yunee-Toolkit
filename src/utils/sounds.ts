/**
 * 提示音工具 sounds.ts
 * 职责：通过 Web Audio API 合成「转换完成 / 转换失败 / 按钮点击」三类提示音，
 *       并提供可自选的「声音库」。
 * 说明：
 *   - 不依赖任何音频文件，全部为合成音，跨平台可用；音频上下文懒创建并复用。
 *   - 声音库分为「完成 / 失败 / 点击」三组预设
 *     （soundComplete / soundError / clickSound 设置项各选其一），
 *     界面可在「设置 → 声音」中试听挑选。
 *   - 播放失败时静默降级（不播放），不影响主流程。
 */
let audioCtx: AudioContext | null = null

/** 单个音的参数（合成音色的基本单元） */
interface ToneSpec {
  /** 音高频率（Hz） */
  freq: number
  /** 相对整体开始的时间（秒） */
  start: number
  /** 持续时长（秒），默认 0.5 */
  duration?: number
  /** 波形：sine 柔和 / triangle 钢琴感 / square 电子 / sawtooth 明亮 */
  type?: OscillatorType
  /** 音量 0-1，默认 0.16 */
  volume?: number
  /** 起音时间（秒）：越大声音越“温柔”，默认 0.02（快起音偏干脆） */
  attack?: number
  /** 目标频率（Hz）：设置后在持续期内由 freq 平滑滑到 freqEnd，制造更温柔的滑音 */
  freqEnd?: number
}

/** 声音预设：一组 Tone 的组合成一个完整提示音 */
export interface SoundPreset {
  /** 唯一 id（存于设置项 soundComplete / soundError） */
  id: string
  /** 展示名（设置界面下拉框显示） */
  label: string
  /** 简要描述（设置界面辅助文案） */
  desc: string
  /** 构成该提示音的多个音 */
  tones: ToneSpec[]
}

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
 * 播放单个音：指定频率 / 起始时刻 / 时长 / 波形 / 音量 / 起音时间 / 目标频率。
 * 包络采用「线性起音 + 指数衰减」：起音越慢越温柔，衰减避免爆音；
 * 设置 freqEnd 后频率平滑滑向目标值，形成自然柔和的滑音。
 */
function playTone(ctx: AudioContext, spec: ToneSpec): void {
  const {
    freq,
    start,
    duration = 0.5,
    type = 'sine',
    volume = 0.16,
    attack = 0.02,
    freqEnd,
  } = spec
  const now = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), now + duration)
  }
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume, now + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + duration + 0.05)
}

/**
 * 声音库 —— 转换完成提示音（上行、明亮、悦耳为主）
 */
export const COMPLETE_SOUNDS: SoundPreset[] = [
  {
    id: 'chime',
    label: '清脆和弦',
    desc: '上行大三和弦，清脆悦耳（默认）',
    tones: [
      { freq: 523.25, start: 0 }, // C5
      { freq: 659.25, start: 0.12 }, // E5
      { freq: 783.99, start: 0.24 }, // G5
    ],
  },
  {
    id: 'dingdong',
    label: '叮咚门铃',
    desc: '双音门铃声，柔和悠长',
    tones: [
      { freq: 783.99, start: 0, duration: 0.7 }, // G5
      { freq: 1046.5, start: 0.28, duration: 0.9 }, // C6
    ],
  },
  {
    id: 'sparkle',
    label: '明亮琶音',
    desc: '钢琴感琶音上行，活泼明亮',
    tones: [
      { freq: 523.25, start: 0, type: 'triangle', duration: 0.45 },
      { freq: 659.25, start: 0.1, type: 'triangle', duration: 0.45 },
      { freq: 783.99, start: 0.2, type: 'triangle', duration: 0.45 },
      { freq: 1046.5, start: 0.3, type: 'triangle', duration: 0.7 },
    ],
  },
  {
    id: 'soft',
    label: '柔和单音',
    desc: '单一长音，安静内敛',
    tones: [{ freq: 659.25, start: 0, type: 'triangle', duration: 1.0 }], // E5
  },
  {
    id: 'digital',
    label: '电子提示',
    desc: '电子音双响，清晰干脆',
    tones: [
      { freq: 880, start: 0, type: 'square', duration: 0.12, volume: 0.1 },
      { freq: 1174.66, start: 0.16, type: 'square', duration: 0.18, volume: 0.1 },
    ],
  },
  {
    id: 'softbells',
    label: '柔和风铃',
    desc: '风铃般的高音连奏，轻灵舒缓',
    tones: [
      { freq: 1046.5, start: 0, type: 'triangle', duration: 0.6, volume: 0.12 }, // C6
      { freq: 1318.51, start: 0.18, type: 'triangle', duration: 0.7, volume: 0.1 }, // E6
      { freq: 1567.98, start: 0.36, type: 'triangle', duration: 0.9, volume: 0.08 }, // G6
    ],
  },
  {
    id: 'pianosoft',
    label: '轻柔钢琴',
    desc: '三和弦缓慢铺开，柔和温暖',
    tones: [
      { freq: 261.63, start: 0, type: 'triangle', duration: 0.9 }, // C4
      { freq: 329.63, start: 0.15, type: 'triangle', duration: 0.9 }, // E4
      { freq: 392, start: 0.3, type: 'triangle', duration: 1.0 }, // G4
    ],
  },
  {
    id: 'calm',
    label: '平静舒缓',
    desc: '低音长音交织，静谧安心',
    tones: [
      { freq: 220, start: 0, type: 'sine', duration: 1.2, volume: 0.14 }, // A3
      { freq: 329.63, start: 0.4, type: 'sine', duration: 1.0, volume: 0.1 }, // E4
    ],
  },
  {
    id: 'raindrops',
    label: '雨滴轻落',
    desc: '高音短音连奏，如雨滴轻敲窗沿',
    tones: [
      { freq: 1318.51, start: 0, type: 'sine', duration: 0.3, volume: 0.12 }, // E6
      { freq: 1567.98, start: 0.14, type: 'sine', duration: 0.3, volume: 0.1 }, // G6
      { freq: 1046.5, start: 0.3, type: 'sine', duration: 0.35, volume: 0.1 }, // C6
      { freq: 1318.51, start: 0.46, type: 'sine', duration: 0.4, volume: 0.08, attack: 0.04 }, // E6
    ],
  },
  {
    id: 'ocean',
    label: '海浪轻抚',
    desc: '缓慢起伏的低音，如海浪轻抚沙滩',
    tones: [
      { freq: 196, start: 0, type: 'sine', duration: 1.4, volume: 0.13, attack: 0.05 }, // G3
      { freq: 293.66, start: 0.5, type: 'sine', duration: 1.2, volume: 0.09, attack: 0.05 }, // D4
    ],
  },
  {
    id: 'stars',
    label: '星辉闪烁',
    desc: '几颗高音轻轻闪烁，梦幻温柔',
    tones: [
      { freq: 1760, start: 0, type: 'sine', duration: 0.3, volume: 0.07, attack: 0.03 }, // A6
      { freq: 1318.51, start: 0.12, type: 'sine', duration: 0.3, volume: 0.08, attack: 0.03 },
      { freq: 2093, start: 0.24, type: 'sine', duration: 0.4, volume: 0.06, attack: 0.03 }, // C7
    ],
  },
  {
    id: 'guitar',
    label: '吉他轻拨',
    desc: '三角波轻拨和弦，温暖干净',
    tones: [
      { freq: 329.63, start: 0, type: 'triangle', duration: 0.5, attack: 0.03 }, // E4
      { freq: 392, start: 0.1, type: 'triangle', duration: 0.5, attack: 0.03 }, // G4
      { freq: 493.88, start: 0.2, type: 'triangle', duration: 0.7, attack: 0.03 }, // B4
    ],
  },
  {
    id: 'whisper',
    label: '轻柔呢喃',
    desc: '极轻的高音两连音，安静温柔',
    tones: [
      { freq: 880, start: 0, type: 'sine', duration: 0.4, volume: 0.08, attack: 0.05 }, // A5
      { freq: 1174.66, start: 0.22, type: 'sine', duration: 0.5, volume: 0.06, attack: 0.05 }, // D6
    ],
  },
  {
    id: 'warmchord',
    label: '温暖和弦',
    desc: 'C 大调三音叠置，温暖厚实不刺耳',
    tones: [
      { freq: 130.81, start: 0, type: 'sine', duration: 1.2, volume: 0.14, attack: 0.05 }, // C3
      { freq: 196, start: 0, type: 'sine', duration: 1.2, volume: 0.1, attack: 0.05 }, // G3
      { freq: 329.63, start: 0, type: 'sine', duration: 1.0, volume: 0.08, attack: 0.06 }, // E4
    ],
  },
  {
    id: 'moonlight',
    label: '月光静谧',
    desc: '慢速琶音上浮，静谧梦幻',
    tones: [
      { freq: 220, start: 0, type: 'sine', duration: 0.6, volume: 0.12, attack: 0.04 }, // A3
      { freq: 277.18, start: 0.25, type: 'sine', duration: 0.6, volume: 0.1, attack: 0.04 }, // C#4
      { freq: 329.63, start: 0.5, type: 'sine', duration: 0.8, volume: 0.09, attack: 0.04 }, // E4
      { freq: 440, start: 0.75, type: 'sine', duration: 0.9, volume: 0.07, attack: 0.05 }, // A4
    ],
  },
  {
    id: 'clouds',
    label: '云朵飘浮',
    desc: '低音长音衬底，高音轻点如云间微光',
    tones: [
      { freq: 196, start: 0, type: 'sine', duration: 1.2, volume: 0.11, attack: 0.05 }, // G3
      { freq: 587.33, start: 0.4, type: 'sine', duration: 0.4, volume: 0.08, attack: 0.04 }, // D5
      { freq: 783.99, start: 0.6, type: 'sine', duration: 0.5, volume: 0.06, attack: 0.04 }, // G5
    ],
  },
  {
    id: 'firefly',
    label: '萤火点点',
    desc: '几颗小光点轻轻亮起，梦幻俏皮',
    tones: [
      { freq: 1567.98, start: 0, type: 'sine', duration: 0.25, volume: 0.08, attack: 0.04 }, // G6
      { freq: 1318.51, start: 0.14, type: 'sine', duration: 0.25, volume: 0.07, attack: 0.04 },
      { freq: 2093, start: 0.28, type: 'sine', duration: 0.3, volume: 0.06, attack: 0.04 }, // C7
    ],
  },
  {
    id: 'spring',
    label: '春风拂面',
    desc: '柔和上滑音，如微风轻托而起',
    tones: [
      { freq: 261.63, start: 0, type: 'sine', duration: 0.7, volume: 0.1, attack: 0.05, freqEnd: 392 }, // C4→G4
      { freq: 392, start: 0.3, type: 'sine', duration: 0.9, volume: 0.08, attack: 0.05, freqEnd: 523.25 }, // G4→C5
    ],
  },
  {
    id: 'lullaby',
    label: '摇篮轻摇',
    desc: '轻柔的双音往复，像摇篮般安稳',
    tones: [
      { freq: 392, start: 0, type: 'sine', duration: 0.5, volume: 0.1, attack: 0.04 }, // G4
      { freq: 329.63, start: 0.35, type: 'sine', duration: 0.5, volume: 0.09, attack: 0.04 }, // E4
      { freq: 392, start: 0.7, type: 'sine', duration: 0.6, volume: 0.07, attack: 0.05 }, // G4
    ],
  },
  {
    id: 'dreamy',
    label: '梦幻风铃',
    desc: '带泛音的高音连鸣，空灵缥缈',
    tones: [
      { freq: 1046.5, start: 0, type: 'sine', duration: 0.8, volume: 0.1, attack: 0.04 }, // C6
      { freq: 1567.98, start: 0.1, type: 'sine', duration: 0.6, volume: 0.05, attack: 0.04 }, // G6 泛音层
      { freq: 1318.51, start: 0.35, type: 'sine', duration: 0.8, volume: 0.08, attack: 0.04 }, // E6
      { freq: 1975.53, start: 0.45, type: 'sine', duration: 0.5, volume: 0.04, attack: 0.04 }, // B6 泛音层
    ],
  },
]

/**
 * 声音库 —— 按钮点击提示音（短促、干脆、低音量为主）
 */
export const CLICK_SOUNDS: SoundPreset[] = [
  {
    id: 'tick',
    label: '轻快咔嗒',
    desc: '短促清脆的单音（默认）',
    tones: [{ freq: 1200, start: 0, duration: 0.05, volume: 0.12 }],
  },
  {
    id: 'pop',
    label: '气泡轻响',
    desc: '圆润的气泡声，俏皮但不闹',
    tones: [
      { freq: 800, start: 0, duration: 0.05, volume: 0.13 },
      { freq: 1400, start: 0.02, duration: 0.05, volume: 0.07 },
    ],
  },
  {
    id: 'tap',
    label: '清脆敲击',
    desc: '木质感的短促敲击',
    tones: [
      { freq: 1800, start: 0, type: 'triangle', duration: 0.04, volume: 0.11 },
      { freq: 900, start: 0.02, type: 'triangle', duration: 0.06, volume: 0.08 },
    ],
  },
  {
    id: 'click',
    label: '机械点击',
    desc: '电子感点击声，干脆利落',
    tones: [
      { freq: 1500, start: 0, type: 'square', duration: 0.03, volume: 0.06 },
      { freq: 600, start: 0.03, type: 'square', duration: 0.04, volume: 0.05 },
    ],
  },
  {
    id: 'softtick',
    label: '柔和轻触',
    desc: '极轻的触碰声，安静不打扰',
    tones: [{ freq: 900, start: 0, type: 'triangle', duration: 0.06, volume: 0.1 }],
  },
  {
    id: 'softknock',
    label: '柔和轻叩',
    desc: '木质轻叩声，低调温和',
    tones: [
      { freq: 700, start: 0, type: 'triangle', duration: 0.05, volume: 0.09, attack: 0.01 },
      { freq: 480, start: 0.02, type: 'triangle', duration: 0.06, volume: 0.06, attack: 0.01 },
    ],
  },
  {
    id: 'bubble',
    label: '水泡轻响',
    desc: '圆润的水泡感，温柔俏皮',
    tones: [
      { freq: 500, start: 0, type: 'sine', duration: 0.06, volume: 0.1, attack: 0.015 },
      { freq: 880, start: 0.03, type: 'sine', duration: 0.05, volume: 0.05, attack: 0.015 },
    ],
  },
  {
    id: 'velvet',
    label: '丝绒轻触',
    desc: '最低调的一次轻触，几乎不打扰',
    tones: [{ freq: 600, start: 0, type: 'sine', duration: 0.07, volume: 0.07, attack: 0.03 }],
  },
  {
    id: 'feather',
    label: '羽毛轻触',
    desc: '极轻极短的一碰，像羽毛掠过',
    tones: [{ freq: 880, start: 0, type: 'sine', duration: 0.05, volume: 0.06, attack: 0.03 }],
  },
  {
    id: 'snowflake',
    label: '雪花飘落',
    desc: '高音轻点一下，清凉又温柔',
    tones: [{ freq: 1567.98, start: 0, type: 'sine', duration: 0.06, volume: 0.06, attack: 0.03 }],
  },
  {
    id: 'dewdrop',
    label: '露珠轻滴',
    desc: '圆润的轻滴声，干净柔和',
    tones: [
      { freq: 659.25, start: 0, type: 'sine', duration: 0.07, volume: 0.08, attack: 0.02 }, // E5
      { freq: 880, start: 0.04, type: 'sine', duration: 0.06, volume: 0.05, attack: 0.03 }, // A5
    ],
  },
  {
    id: 'softchime',
    label: '轻叩风铃',
    desc: '一声轻敲的风铃感，温和俏皮',
    tones: [
      { freq: 1046.5, start: 0, type: 'sine', duration: 0.1, volume: 0.08, attack: 0.02 }, // C6
      { freq: 1318.51, start: 0.05, type: 'sine', duration: 0.08, volume: 0.04, attack: 0.03 }, // E6
    ],
  },
  {
    id: 'paper',
    label: '纸页轻翻',
    desc: '极短的柔和弱音，像轻轻翻过一页纸',
    tones: [
      { freq: 700, start: 0, type: 'triangle', duration: 0.04, volume: 0.06, attack: 0.01 },
      { freq: 500, start: 0.02, type: 'triangle', duration: 0.05, volume: 0.04, attack: 0.01 },
    ],
  },
  {
    id: 'wooden',
    label: '木块轻敲',
    desc: '低频短促的敲击，沉稳朴实',
    tones: [
      { freq: 320, start: 0, type: 'triangle', duration: 0.05, volume: 0.1, attack: 0.005 },
      { freq: 180, start: 0.01, type: 'triangle', duration: 0.07, volume: 0.06, attack: 0.005 },
    ],
  },
  {
    id: 'clock',
    label: '时钟滴答',
    desc: '干净利落的一声滴答，克制安静',
    tones: [{ freq: 1000, start: 0, type: 'triangle', duration: 0.03, volume: 0.08, attack: 0.005 }],
  },
  {
    id: 'bell',
    label: '铃铛轻碰',
    desc: '细小的铃铛一声轻响，清亮不吵',
    tones: [
      { freq: 1567.98, start: 0, type: 'sine', duration: 0.15, volume: 0.08, attack: 0.005 }, // G6
      { freq: 2349.32, start: 0.02, type: 'sine', duration: 0.12, volume: 0.03, attack: 0.005 }, // D7 泛音
    ],
  },
  {
    id: 'key',
    label: '柔和按键',
    desc: '键盘般的轻柔按压感，日常自然',
    tones: [{ freq: 850, start: 0, type: 'triangle', duration: 0.035, volume: 0.08, attack: 0.005 }],
  },
  {
    id: 'keyboard1',
    label: '键盘轻敲',
    desc: '机械键盘般的清脆敲击，短促有力',
    tones: [
      { freq: 1200, start: 0, type: 'triangle', duration: 0.04, volume: 0.12, attack: 0.005 },
      { freq: 800, start: 0.02, type: 'triangle', duration: 0.05, volume: 0.08, attack: 0.005 },
    ],
  },
  {
    id: 'keyboard2',
    label: '薄膜键盘',
    desc: '薄膜键盘的柔和按压感，低音量不刺耳',
    tones: [
      { freq: 900, start: 0, type: 'sine', duration: 0.05, volume: 0.1, attack: 0.01 },
      { freq: 600, start: 0.03, type: 'sine', duration: 0.06, volume: 0.07, attack: 0.01 },
    ],
  },
  {
    id: 'piano',
    label: '钢琴轻点',
    desc: '单音钢琴轻点一下，干净优雅',
    tones: [{ freq: 523.25, start: 0, type: 'triangle', duration: 0.12, volume: 0.1, attack: 0.008 }], // C5
  },
  {
    id: 'raindot',
    label: '雨点轻触',
    desc: '两滴轻巧的雨点，湿润温和',
    tones: [
      { freq: 1100, start: 0, type: 'sine', duration: 0.04, volume: 0.05, attack: 0.01 },
      { freq: 900, start: 0.03, type: 'sine', duration: 0.04, volume: 0.04, attack: 0.01 },
    ],
  },
]

/**
 * 声音库 —— 转换失败提示音（下行、低沉、警示为主）
 */
export const ERROR_SOUNDS: SoundPreset[] = [
  {
    id: 'fall',
    label: '低沉下行',
    desc: '下行两音，低沉柔和（默认）',
    tones: [
      { freq: 329.63, start: 0 }, // E4
      { freq: 261.63, start: 0.16 }, // C4
    ],
  },
  {
    id: 'softfall',
    label: '柔和下降',
    desc: '缓慢下行，温和提醒',
    tones: [
      { freq: 392, start: 0, type: 'triangle', duration: 0.6 }, // G4
      { freq: 329.63, start: 0.22, type: 'triangle', duration: 0.7 }, // E4
    ],
  },
  {
    id: 'warn',
    label: '警示提示',
    desc: '电子警示音，明确但克制',
    tones: [
      { freq: 660, start: 0, type: 'square', duration: 0.14, volume: 0.1 },
      { freq: 440, start: 0.18, type: 'square', duration: 0.22, volume: 0.1 },
    ],
  },
  {
    id: 'buzz',
    label: '电子嗡嗡',
    desc: '短促低鸣，略带机械感',
    tones: [{ freq: 220, start: 0, type: 'sawtooth', duration: 0.35, volume: 0.08 }],
  },
  {
    id: 'gentlefall',
    label: '温柔回落',
    desc: '很轻的下行两音，温和地提醒',
    tones: [
      { freq: 392, start: 0, type: 'sine', duration: 0.5, volume: 0.1, attack: 0.04 }, // G4
      { freq: 293.66, start: 0.2, type: 'sine', duration: 0.6, volume: 0.08, attack: 0.04 }, // D4
    ],
  },
  {
    id: 'sigh',
    label: '轻柔叹息',
    desc: '缓慢下滑的柔音，一声轻叹',
    tones: [
      { freq: 329.63, start: 0, type: 'triangle', duration: 0.7, volume: 0.1, attack: 0.04 }, // E4
      { freq: 261.63, start: 0.3, type: 'triangle', duration: 0.8, volume: 0.08, attack: 0.04 }, // C4
    ],
  },
  {
    id: 'softwarn',
    label: '温声提示',
    desc: '双音下行，柔和但仍有辨识度',
    tones: [
      { freq: 523.25, start: 0, type: 'sine', duration: 0.35, volume: 0.1, attack: 0.04 }, // C5
      { freq: 392, start: 0.18, type: 'sine', duration: 0.5, volume: 0.09, attack: 0.04 }, // G4
    ],
  },
  {
    id: 'gentleslide',
    label: '温和滑落',
    desc: '平滑下滑的柔音，像轻轻放下一件事',
    tones: [
      { freq: 523.25, start: 0, type: 'sine', duration: 0.8, volume: 0.1, attack: 0.05, freqEnd: 293.66 }, // C5→D4
      { freq: 329.63, start: 0.3, type: 'sine', duration: 0.9, volume: 0.07, attack: 0.05, freqEnd: 196 }, // E4→G3
    ],
  },
  {
    id: 'petal',
    label: '花瓣轻落',
    desc: '很轻的下行双音，温柔地告知结果',
    tones: [
      { freq: 659.25, start: 0, type: 'sine', duration: 0.35, volume: 0.09, attack: 0.04 }, // E5
      { freq: 523.25, start: 0.2, type: 'sine', duration: 0.4, volume: 0.08, attack: 0.04 }, // C5
    ],
  },
  {
    id: 'hush',
    label: '轻声低语',
    desc: '极轻的低音一沉，几乎不出声的提醒',
    tones: [
      { freq: 293.66, start: 0, type: 'sine', duration: 0.5, volume: 0.08, attack: 0.06 }, // D4
      { freq: 220, start: 0.25, type: 'sine', duration: 0.6, volume: 0.06, attack: 0.06 }, // A3
    ],
  },
  {
    id: 'dusk',
    label: '暮色低回',
    desc: '缓慢下沉的两音，宁静而不慌张',
    tones: [
      { freq: 440, start: 0, type: 'sine', duration: 0.6, volume: 0.09, attack: 0.05 }, // A4
      { freq: 329.63, start: 0.3, type: 'sine', duration: 0.8, volume: 0.07, attack: 0.05 }, // E4
    ],
  },
]

/** 默认选中的声音 id */
export const DEFAULT_COMPLETE_ID = 'chime'
export const DEFAULT_ERROR_ID = 'fall'
export const DEFAULT_CLICK_ID = 'tick'

/** id → 预设 的索引（完成 + 失败 + 点击合并，按 id 快速查找） */
const PRESET_INDEX: Record<string, SoundPreset> = {}
for (const preset of [...COMPLETE_SOUNDS, ...ERROR_SOUNDS, ...CLICK_SOUNDS]) {
  PRESET_INDEX[preset.id] = preset
}

/**
 * 按声音 id 播放提示音。
 * @param id 声音预设 id（设置项 soundComplete / soundError / clickSound 中保存的值）
 * @param fallbackId 兜底声音 id（分组内找不到时用）
 * @param volume 外部音量系数 0-1（来自「设置 → 声音 → 音量」滑块，默认 1 即原始音量）
 */
export function playSoundById(id: string, fallbackId?: string, volume: number = 1): void {
  const ctx = getCtx()
  if (!ctx) return
  const preset = PRESET_INDEX[id] ?? (fallbackId ? PRESET_INDEX[fallbackId] : COMPLETE_SOUNDS[0])
  if (!preset) return
  // 音量缩放：以每个音的基础音量为底，乘以外部音量系数，实现完成/失败/点击音的独立调节
  for (const tone of preset.tones) {
    const base = tone.volume ?? 0.16
    playTone(ctx, { ...tone, volume: base * volume })
  }
}
