/**
 * 通知辅助工具 notify.ts
 * 职责：为 Arco Notification 提供一个“变量高亮”渲染函数。
 * 用法：在消息文本中用 「」 包裹需要强调的变量值，例如：
 *       highlight('已「开启」开机自启。')
 * 说明：
 *   - 被「」包裹的片段会渲染为带 .notify-hl 样式的彩色文字（适配深浅色主题）。
 *   - 返回一个渲染函数（Arco 的 RenderContent = string | RenderFunction），
 *     可直接作为 Notification 的 content / title。
 */
import { h, type VNode } from 'vue'

/** 将文本中的「变量」片段高亮，返回一个 Arco 可渲染的函数 */
export function highlight(text: string): () => VNode {
  // 按 「...」 切分为普通文本与高亮片段
  const parts = text.split(/(「[^」]*」)/)
  return () =>
    h(
      'span',
      parts.map((part) =>
        part.length > 1 && part.startsWith('「') && part.endsWith('」')
          ? h('span', { class: 'notify-hl' }, part)
          : part,
      ),
    )
}