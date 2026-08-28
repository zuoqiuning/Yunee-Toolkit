# 屿宁工具箱 (Yunee Toolkit)

> 集众开源之力，一站式处理音视频、图片、文档、PDF 的本地万能工具箱。

- 平台：Windows（Win10 / Win11）
- 形态：单机桌面应用，无账号体系，所有处理均在本地完成
- 授权：完全免费，无内购、无广告
- 当前版本：beta 0.1.0（聚焦 FFmpeg 音视频套件）

## 技术栈

- Electron 43 + Vue 3 + Vite 8 + TypeScript
- Pinia + Vue Router + Arco Design Vue 2.58（按需加载）
- electron-builder 打包

## 开发运行

```bash
pnpm install
pnpm electron:dev
```

## 内置工具

本仓库不包含 FFmpeg 等二进制文件（体积约 300MB）。使用前请从
[FFmpeg 官方构建](https://www.gyan.dev/ffmpeg/builds/) 下载 **Windows 版本**，
解压后按如下目录结构放置：

```
bin/
└── FFmpeg/
    ├── ffmpeg.exe
    ├── ffplay.exe
    └── ffprobe.exe
```

## 目录结构

```
├── bin/                 # 内置工具（git 忽略，运行时自动扫描）
├── docs/                # 设计文档
├── electron/
│   ├── ipc/             # 主进程 IPC 处理器（一模块一文件）
│   ├── main/            # 主进程逻辑（窗口/启动/日志/工具探测/FFmpeg）
│   └── preload/         # 预加载脚本（contextBridge 安全桥接）
└── src/
    ├── components/      # 通用组件与设置面板
    ├── config/          # 导航注册表
    ├── layouts/         # 主布局
    ├── router/          # 路由
    ├── stores/          # Pinia 状态
    └── views/           # 页面（首页/关于/各功能模块）
```
