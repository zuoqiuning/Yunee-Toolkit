/**
 * 左侧导航注册表
 * 职责：集中管理应用的功能模块清单及多工具分组，是侧边栏与路由的单一数据源。
 *
 * 设计说明（模块化）：
 *   - 新增一个功能模块时，在此添加一条 item 记录 + 在 views/modules/ 下新建对应视图文件 + 在路由表注册路由。
 *   - icon 使用 ToolIcon 组件支持的图标名：优先命中定制 SVG（convert/container/audio-extract/music-decrypt/media-info），
 *     否则回退为 Arco Design 图标（对应 ArcoIcon 映射的 key），由布局/首页统一渲染。
 */

/** 侧边导航分组 */
export interface NavGroup {
  /** 分组标题 */
  title: string
  /** 分组标题对应的 Arco 图标名 */
  icon: string
  /** 分组下的功能条目 */
  items: NavItem[]
}

/** 导航条目 */
export interface NavItem {
  /** 模块唯一标识（也作为路由名） */
  key: string
  /** 显示名称 */
  label: string
  /** 路由路径 */
  path: string
  /** 图标名（ToolIcon 组件支持的图标名 / Arco 图标名） */
  icon: string
  /** 一句话功能描述 */
  desc: string
}

/** 主侧边导航的分组配置 */
export const navGroups: NavGroup[] = [
  {
    title: '视频工具',
    icon: 'file-video',
    items: [
      { key: 'video-convert', label: '格式转换', path: '/video-convert', icon: 'convert', desc: '视频格式与编码参数转换' },
      { key: 'container', label: '容器处理', path: '/container', icon: 'container', desc: '封装格式转换（不重新编码）' },
      { key: 'audio-extract', label: '音频提取', path: '/audio-extract', icon: 'audio-extract', desc: '从视频中提取/分离音频' },
    ],
  },
  {
    title: '音频工具',
    icon: 'file-audio',
    items: [
      { key: 'audio-convert', label: '格式转换', path: '/audio-convert', icon: 'convert', desc: '音频格式与码率转换' },
      { key: 'music-decrypt', label: '音乐解密', path: '/music-decrypt', icon: 'music-decrypt', desc: '解密并导出本地音乐文件' },
    ],
  },
  {
    title: '图片工具',
    icon: 'image',
    items: [
      { key: 'image-convert', label: '格式转换', path: '/image-convert', icon: 'convert', desc: '图片格式与尺寸转换' },
    ],
  },
  {
    title: '文档工具',
    icon: 'file',
    items: [
      { key: 'doc-convert', label: '格式转换', path: '/doc-convert', icon: 'convert', desc: '文档格式相互转换' },
    ],
  },
]