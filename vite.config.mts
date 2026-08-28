import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { ArcoResolver } from 'unplugin-vue-components/resolvers'

// Vite 配置：负责 Vue 渲染进程的构建与按需自动导入
export default defineConfig({
  plugins: [
    vue(),

    // 自动导入 Vue / Vue Router / Pinia 相关 API（ref、reactive、computed 等）
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/types/auto-imports.d.ts',
    }),

    // 按需自动导入 UI 组件（Arco Design）
    Components({
      resolvers: [
        // 字节 Arco Design（自动引入组件样式）
        ArcoResolver({
          sideEffect: true,
        }),
      ],
      dts: 'src/types/components.d.ts',
    }),
  ],

  resolve: {
    alias: {
      // 路径别名：@ -> src
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // 明确 Base 为相对路径，避免 Electron 本地文件加载白屏
  base: './',

  // 静态资源目录指向 resources/：发布后的图标（icon.ico）可直接以 /icon.ico 被渲染层引用
  publicDir: 'resources',

  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // 忽略运行时目录，避免监听其中的高频读写（用户数据 data、输出 output、临时 tempfiles、构建产物）
    watch: {
      ignored: ['**/data/**', '**/output/**', '**/tempfiles/**', '**/dist/**', '**/dist-electron/**'],
    },
  },

  build: {
    outDir: 'dist',
    // 分包策略：拆分体积较大的 UI 组件库，提升缓存效率。
    // 注意：Vite 8 (rolldown) 的 manualChunks 仅支持函数形式。
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@arco-design/web-vue')) return 'arco'
        },
      },
    },
  },
})