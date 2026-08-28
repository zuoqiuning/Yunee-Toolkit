/**
 * 路由表
 * 职责：集中定义应用内全部路由，与导航注册表（config/navigation.ts）对应。
 * 目前各功能模块均指向“正在开发”占位视图，后续逐一替换为真实实现。
 */
import type { RouteRecordRaw } from 'vue-router'

/** 应用路由表 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        // 首页
        path: '',
        name: 'home',
        component: () => import('@/views/HomeView.vue'),
        meta: { title: '首页' },
      },
      {
        // 视频工具 - 格式转换
        path: 'video-convert',
        name: 'video-convert',
        component: () => import('@/views/modules/VideoConvertView.vue'),
        meta: { title: '视频格式转换' },
      },
      {
        // 视频工具 - 容器处理
        path: 'container',
        name: 'container',
        component: () => import('@/views/modules/ContainerView.vue'),
        meta: { title: '容器处理' },
      },
      {
        // 视频工具 - 音频提取
        path: 'audio-extract',
        name: 'audio-extract',
        component: () => import('@/views/modules/AudioExtractView.vue'),
        meta: { title: '音频提取' },
      },
      {
        // 音频工具 - 格式转换
        path: 'audio-convert',
        name: 'audio-convert',
        component: () => import('@/views/modules/AudioConvertView.vue'),
        meta: { title: '音频格式转换' },
      },
      {
        // 音频工具 - 音乐解密
        path: 'music-decrypt',
        name: 'music-decrypt',
        component: () => import('@/views/modules/MusicDecryptView.vue'),
        meta: { title: '音乐解密' },
      },
      {
        // 图片工具 - 格式转换
        path: 'image-convert',
        name: 'image-convert',
        component: () => import('@/views/modules/ImageConvertView.vue'),
        meta: { title: '图片格式转换' },
      },
      {
        // 文档工具 - 格式转换
        path: 'doc-convert',
        name: 'doc-convert',
        component: () => import('@/views/modules/DocConvertView.vue'),
        meta: { title: '文档格式转换' },
      },
      {
        // 关于（独立页面，与首页同级）
        path: 'about',
        name: 'about',
        component: () => import('@/views/AboutView.vue'),
        meta: { title: '关于' },
      },
    ],
  },
  // 兜底重定向到首页
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]