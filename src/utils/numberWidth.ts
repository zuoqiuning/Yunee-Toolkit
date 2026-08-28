/**
 * 数值输入器宽度自适应
 * 职责：按数字位数估算 a-input-number（mode=button）的宽度，使数字区完整可见，避免被裁切。
 * 说明：mode=button 在输入框左右两侧各有一个步进按钮（合计约 64px），数字区随位数增长；
 *       单位后缀（如「天」「核」）额外占位。基础宽度必须预留按钮 + 内边距，
 *       否则数字会被按钮挤压到不可见。
 */

/** 左右两个步进按钮的宽度（px）：mode=button 下减/加按钮位于输入框两侧，各约 32px */
const BUTTONS = 64
/** 数字区左右内边距（px）：内容区域的基础长度，保证数字有充足留白 */
const H_PADDING = 28
/** 每个数字占宽（px）：数字约 8px + 适量余量，防止输入抖动裁切 */
const PER_DIGIT = 12
/** 每个后缀字符占宽（px，含间距） */
const PER_SUFFIX_CHAR = 16

/**
 * 计算数值输入器宽度
 * @param value 当前数值（空值按 1 位估算，保证占位符可完整显示）
 * @param suffix 单位后缀文案（如「天」「核」），没有后缀则不传
 */
export function fitNumberInputWidth(value: number | null | undefined, suffix = ''): string {
  const digits = Math.max(1, String(value ?? '').replace(/\D/g, '').length)
  const width = BUTTONS + H_PADDING + digits * PER_DIGIT + suffix.length * PER_SUFFIX_CHAR
  return `${width}px`
}