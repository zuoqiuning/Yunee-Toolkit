/**
 * 渲染进程入口
 * 职责：创建 Vue 应用实例，挂载全局状态、路由与全局样式。
 * 说明：Arco 组件通过 unplugin 按需自动导入，无需全局注册。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

// 全局样式（白色主题基础样式，先于组件库样式加载）
import './styles/index.css'

// 引入 Arco Design 全局样式
import '@arco-design/web-vue/dist/arco.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')