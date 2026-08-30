<!--
  首页 HomeView
  职责：应用欢迎页 —— 顶部横幅（软件名称 / 欢迎语 / 版本号）。
  UI：横幅为无边框 Arco 大卡片（直角），版本号使用 Arco a-tag。
-->
<script setup lang="ts">
// 首页无需额外逻辑，仅展示横幅；版本号统一取自全局应用 Store（主进程真实版本组装 beta 格式）
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
</script>

<template>
  <div class="home">
    <!-- 顶部横幅：左为软件名称，中为欢迎语，右为版本号（无边框 Arco 大卡片） -->
    <a-card class="banner" :bordered="false">
      <div class="banner__inner">
        <!-- 左侧：软件名称 -->
        <div class="banner__name">
          <img class="banner__logo" src="/icon.ico" alt="logo" draggable="false" />
          <div class="banner__name-text">
            <div class="banner__name-main">Yunee Toolkit</div>
            <div class="banner__name-sub">屿宁工具箱</div>
          </div>
        </div>

        <!-- 中间（绝对居中）：欢迎语 -->
        <div class="banner__welcome">
          <div class="banner__welcome-main">欢迎使用</div>
          <div class="banner__welcome-sub">集众开源之力，一站式处理常用媒体格式。</div>
        </div>

        <!-- 右侧：版本号（统一取自全局应用 Store，避免各处硬编码不一致） -->
        <div class="banner__version">
          <a-tag size="large" color="arcoblue">{{ appStore.meta.version }}</a-tag>
        </div>
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.home {
  padding: 32px 40px 48px;
}

/* ========== 顶部横幅（无边框 Arco 大卡片，直角） ========== */
/* 默认显示明显阴影（深浅色由 Arco 阴影变量自动适配），一层近阴影 + 一层远阴影增加立体感；
   背景用「白色 → 极浅灰蓝」的横向渐变，避免纯白过于单调；hover 时阴影轻微加深 */
.banner {
  background: linear-gradient(120deg, var(--color-bg-1) 0%, var(--color-fill-1) 100%);
  box-shadow:
    0 4px 12px var(--color-shadow-1),
    0 14px 36px var(--color-shadow-3);
  transition: box-shadow 0.25s ease;
}

.banner:hover {
  box-shadow:
    0 6px 16px var(--color-shadow-1),
    0 18px 44px var(--color-shadow-3);
}

.banner :deep(.arco-card-body) {
  padding: 36px 48px; /* 左右留合理间距，名称/版本贴近内边缘 */
}

.banner__inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 68px; /* 名称贴左、版本贴右，欢迎语绝对居中 */
}

/* 左侧：软件名称 */
.banner__name {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.banner__logo {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  object-fit: contain;
}

.banner__name-main {
  font-size: 26px;
  font-weight: 700;
  color: var(--color-text-1);
}

.banner__name-sub {
  margin-top: 4px;
  font-size: 14px;
  color: var(--color-text-3);
}

/* 中间：欢迎语（绝对居中，宽窄不随两侧变化，保证恒在横幅正中） */
.banner__welcome {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  white-space: nowrap;
}

.banner__welcome-main {
  font-size: 19px;
  font-weight: 600;
  color: var(--color-text-2);
}

.banner__welcome-sub {
  margin-top: 5px;
  font-size: 13px;
  color: var(--color-text-3);
}

/* 右侧：版本号 */
.banner__version {
  flex-shrink: 0;
}
</style>