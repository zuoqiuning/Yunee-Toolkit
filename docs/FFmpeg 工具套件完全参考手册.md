好的，我结合你提供的 Vue 3 + Electron 项目技术栈文档，以及 FFmpeg 工具的技术特性，重新为你生成一份 **FFmpeg 工具套件完全参考手册（项目集成版）**。

这份文档整合了技术参考与项目落地实践，删除了版本号标注，增加了 **Electron 集成指南、软件功能模块设计建议、数据库与 ffprobe 结合方案** 等内容，便于你直接对照开发。

---

# FFmpeg 工具套件完全参考手册（项目集成版）

> **文档日期**：2026年8月28日
> **适用项目**：Vue 3 + Electron 桌面视频转换工具
> **FFmpeg 版本**：9.x 及以上


## 📖 目录

- [一、工具概述](#一工具概述)
- [二、FFmpeg —— 媒体转换引擎](#二ffmpeg--媒体转换引擎)
  - [2.1 基本语法与流选择](#21-基本语法与流选择)
  - [2.2 核心编码参数详解](#22-核心编码参数详解)
  - [2.3 内容感知编码（AQ + Lookahead）](#23-内容感知编码aq--lookahead)
  - [2.4 两遍编码](#24-两遍编码)
  - [2.5 滤镜系统](#25-滤镜系统)
  - [2.6 硬件加速](#26-硬件加速)
  - [2.7 常用命令速查](#27-常用命令速查)
- [三、FFplay —— 媒体预览播放器](#三ffplay--媒体预览播放器)
- [四、FFprobe —— 媒体分析器](#四ffprobe--媒体分析器)
- [五、项目集成指南](#五项目集成指南)
  - [5.1 FFmpeg 在 Electron 中的集成方式](#51-ffmpeg-在-electron-中的集成方式)
  - [5.2 转码功能模块设计建议](#52-转码功能模块设计建议)
  - [5.3 数据库与 ffprobe 结合方案](#53-数据库与-ffprobe-结合方案)
  - [5.4 进度反馈方案](#54-进度反馈方案)
  - [5.5 性能与兼容性策略](#55-性能与兼容性策略)
- [六、开发注意事项与踩坑指南](#六开发注意事项与踩坑指南)
- [附录：完整命令示例](#附录完整命令示例)


## 一、工具概述

FFmpeg 是完整的音视频处理套件，包含三个核心可执行程序，在你的桌面应用中各司其职：

| 工具        | 作用                             | 在你的软件中的定位                                        |
| :---------- | :------------------------------- | :-------------------------------------------------------- |
| **ffmpeg**  | 音视频格式转换、编解码、滤镜处理 | **核心转码引擎**，所有格式转换功能由它实现                |
| **ffplay**  | 基于 SDL 的轻量级媒体播放器      | **视频预览播放器**，用户在转换前预览源文件/转换后校验结果 |
| **ffprobe** | 媒体信息提取与分析               | **文件元数据采集器**，自动填充视频信息到数据库和界面      |

> **部署说明**：三个可执行文件（`ffmpeg.exe`、`ffplay.exe`、`ffprobe.exe`）在 Windows 下总大小约 120-150 MB，建议随应用安装包一同分发。后续章节将详细说明在 Electron 中的集成方式。


## 二、FFmpeg —— 媒体转换引擎

### 2.1 基本语法与流选择

#### 基本命令结构
```bash
ffmpeg [全局选项] { [输入选项] -i 输入URL } ... { [输出选项] 输出URL }
```

#### 关键规则
- `-i` 必须位于其对应的输入选项之后
- 输出选项必须紧跟在输出文件 URL 之前
- 选项顺序决定作用范围（输入选项只作用于它后面的输入文件）

#### 流选择器（重要）

流选择器用于精确指定某个选项应用于哪个流，在你的转码软件中非常实用（例如用户想只转换视频流而保留原有音频）：

| 选择器 | 含义                    | 适用场景                     |
| :----- | :---------------------- | :--------------------------- |
| `v`    | 所有视频流              | 统一设置视频码率             |
| `V`    | 非封面图的视频流        | 排除缩略图流                 |
| `a`    | 所有音频流              | 统一设置音频编码             |
| `a:1`  | 第二个音频流（从0开始） | 处理多音轨视频时选择特定音轨 |
| `s`    | 所有字幕流              | 处理字幕流                   |
| `p:1`  | 程序ID为1的流           | 处理 MPEG-TS 等节目流格式    |

**示例**：只转换视频流，音频和字幕直接复制
```bash
ffmpeg -i input.mp4 -c:v libx264 -c:a copy -c:s copy output.mp4
```

### 2.2 核心编码参数详解

以下参数是视频转换工具的核心控制项，直接决定了转换速度、输出画质和文件大小。

#### 2.2.1 `-preset` —— 速度与压缩率的权衡

控制编码器在**压缩效率**和**编码速度**之间的取舍。

| 预设        | 速度     | 压缩率（同画质下文件大小） | 适用场景          |
| :---------- | :------- | :------------------------- | :---------------- |
| `ultrafast` | 极快     | 文件最大                   | 实时预览/快速测试 |
| `superfast` | 很快     | 较大                       | 直播录制          |
| `veryfast`  | 快       | 偏大                       | 批量粗转          |
| `faster`    | 较快     | 中等偏大                   | 日常使用          |
| `fast`      | 中快     | 中等                       | 日常使用          |
| `medium`    | **默认** | 平衡                       | **绝大多数场景**  |
| `slow`      | 较慢     | 较小                       | 高质量归档        |
| `slower`    | 慢       | 小                         | 精品压制          |
| `veryslow`  | 极慢     | 最小                       | 最终存档/发布     |

**项目建议**：
- 在软件界面提供 **"快速"、"平衡"、"高质量"** 三档预设，分别映射到 `veryfast`、`medium`、`slow`
- `veryslow` 可放在高级选项中供专业用户选用

#### 2.2.2 `-crf` —— 恒定质量因子

`-crf`（Constant Rate Factor）是控制**感知画质**的核心参数。

- **取值范围**：0–51（值越小画质越高）
- **推荐范围**：18–28
- **默认值**：23（公认的平衡点）
- **参考值**：
  - `18`：视觉无损级别
  - `23`：良好平衡点（推荐）
  - `28`：画质可接受，文件极小（适合网络分享）
  - 每增加 6，文件大小约减半

**项目建议**：
- 在软件界面提供 **"画质"滑块**（如 0-100），内部映射到 `-crf` 值
- 映射建议：100%→18，75%→23，50%→28，25%→35

#### 2.2.3 `-tune` —— 内容类型优化

根据视频内容类型微调编码参数：

| 参数值        | 适用场景           | 作用                     |
| :------------ | :----------------- | :----------------------- |
| `film`        | 电影、真人视频     | 优化运动估计和纹理处理   |
| `animation`   | 动画内容           | 优化平坦区域和边缘检测   |
| `grain`       | 含胶片颗粒的视频   | 保留颗粒细节，防止被抹除 |
| `stillimage`  | 幻灯片式静态图像   | 优化静态内容编码         |
| `fastdecode`  | 需要快速解码的场景 | 减少解码器开销           |
| `zerolatency` | 低延迟直播场景     | 禁用前瞻帧缓冲           |

**项目建议**：
- 提供 **"内容类型"下拉选项**：`自动检测`、`电影/真人`、`动画`、`屏幕录制`
- 用户选择"自动检测"时，可通过 ffprobe 分析视频帧类型分布来判断（见第五章节）

### 2.3 内容感知编码（AQ + Lookahead）

这是 FFmpeg 内置的成熟技术，通过分析画面内容智能分配码率，是提升主观画质的核心手段。

#### 2.3.1 `-aq-mode` —— 自适应量化

自适应量化（AQ）于 2008 年引入 x264，是 FFmpeg 内置功能，不是新工具。

**核心机制**：根据画面局部复杂度动态分配码率
- **复杂区域**（运动、纹理丰富）→ 分配更多码率，保留细节
- **平坦区域**（天空、墙壁）→ 分配较少码率，节省空间

| 模式 | 说明                           | 推荐度         |
| :--- | :----------------------------- | :------------- |
| `0`  | 关闭 AQ（默认）                | ❌ 不推荐       |
| `1`  | 方差模式（基于宏块方差）       | ⚠️ 可用         |
| `2`  | 复杂度模式（综合考虑更多因素） | ⭐ **强烈推荐** |
| `3`  | 循环刷新模式                   | 特定用途       |
| `4`  | 360° 视频专用模式              | 360°视频专用   |

**启用命令**：
```bash
ffmpeg -i input.mp4 -c:v libx264 -preset slow -crf 23 -aq-mode 2 output.mp4
```

> **重要提示**：`-aq-mode 2` 建议搭配 `-preset slow` 或更慢预设使用，方能充分发挥效果。

#### 2.3.2 `-rc-lookahead` —— 前瞻分析

编码器在编码当前帧之前预先分析后续 N 帧，优化码率分配决策。

- **作用**：提升场景切换检测准确性和自适应 B 帧决策
- **推荐值**：40–60
- **代价**：增加内存占用和编码延迟

```bash
ffmpeg -i input.mp4 -c:v libx264 -preset slow -crf 23 -aq-mode 2 -rc-lookahead 40 output.mp4
```

#### 2.3.3 `-sc_threshold` —— 场景切换检测

控制场景切换检测的敏感度。

- **默认值**：通常为 40
- **`-sc_threshold 0`**：强制在每个场景切换处插入关键帧（I 帧）
- **作用**：确保场景切换后画面清晰，无模糊或马赛克

### 2.4 两遍编码

当用户需要**精确控制输出文件大小**时使用（例如刻录光盘或平台上传限制）。

```bash
# 第一遍：分析（不输出视频，只生成日志）
ffmpeg -y -i input.mp4 -c:v libx264 -b:v 2M -pass 1 -f mp4 /dev/null

# 第二遍：编码
ffmpeg -i input.mp4 -c:v libx264 -b:v 2M -pass 2 output.mp4
```
> Windows 上将 `/dev/null` 替换为 `NUL`。

**项目建议**：
- 在软件中提供 **"精确控制文件大小"** 选项，勾选后自动启用两遍编码
- 界面增加输入框让用户指定目标文件大小（如 "不超过 100 MB"）

### 2.5 滤镜系统

FFmpeg 内置数百个滤镜，通过 `-vf`（视频滤镜）和 `-af`（音频滤镜）应用。

#### 常用视频滤镜

| 滤镜         | 说明           | 示例命令                                                    |
| :----------- | :------------- | :---------------------------------------------------------- |
| `scale`      | 缩放分辨率     | `-vf "scale=1280:-1"`（宽度1280，高度自动）                 |
| `crop`       | 裁剪画面       | `-vf "crop=640:480:100:50"`                                 |
| `fps`        | 修改帧率       | `-vf "fps=30"`                                              |
| `rotate`     | 旋转视频       | `-vf "rotate=90*PI/180"`                                    |
| `overlay`    | 叠加水印       | `-vf "movie=logo.png [logo]; [in][logo] overlay=W-w-10:10"` |
| `bwdif`      | 去隔行扫描     | `-vf "bwdif"`                                               |
| `atadenoise` | 自适应时域降噪 | `-vf "atadenoise"`                                          |
| `subtitles`  | 渲染字幕文件   | `-vf "subtitles=sub.srt"`                                   |

#### 复杂滤镜图（`-filter_complex`）

处理多个输入流或多个输出流时使用：

```bash
# 两个视频水平拼接
ffmpeg -i left.mp4 -i right.mp4 -filter_complex "[0:v][1:v]hstack=inputs=2" output.mp4

# 画面 + 音频同时处理
ffmpeg -i video.mp4 -filter_complex "[0:v]scale=1920:1080[v];[0:a]volume=2.0[a]" -map "[v]" -map "[a]" output.mp4
```

#### 查看所有可用滤镜
```bash
ffmpeg -filters
ffmpeg --help filter=滤镜名   # 查看特定滤镜参数
```

### 2.6 硬件加速

对于桌面应用，充分利用用户硬件资源可以大幅提升转码速度。

#### 各平台硬件编码器对照

| 厂商/平台  | H.264 编码器        | H.265 编码器        | 适用环境                         |
| :--------- | :------------------ | :------------------ | :------------------------------- |
| NVIDIA     | `h264_nvenc`        | `hevc_nvenc`        | Windows / Linux（需 NVIDIA GPU） |
| Intel      | `h264_qsv`          | `hevc_qsv`          | Windows / Linux（需 Intel 核显） |
| AMD        | `h264_amf`          | `hevc_amf`          | Windows（需 AMD GPU）            |
| Linux 通用 | `h264_vaapi`        | `hevc_vaapi`        | Linux（需支持 VAAPI 驱动）       |
| Apple      | `h264_videotoolbox` | `hevc_videotoolbox` | macOS                            |

#### 检测可用硬件编码器
```bash
ffmpeg -encoders | grep -E "nvenc|qsv|amf|vaapi|videotoolbox"
ffmpeg -hwaccels   # 查看支持的硬件加速解码器
```

#### 使用示例

**NVIDIA NVENC**：
```bash
ffmpeg -i input.mp4 -c:v h264_nvenc -cq 23 output.mp4
```
注：NVENC 使用 `-cq` 而非 `-crf`，但功能类似（恒定质量）。

**Intel QSV**：
```bash
ffmpeg -init_hw_device qsv=hw -filter_hw_device hw -i input.mp4 -c:v h264_qsv output.mp4
```

**硬件加速使用建议**：
- ✅ **适合**：大文件转码（> 1GB）、高分辨率（4K+）、批量处理
- ❌ **不适合**：小文件（GPU 初始化开销高）、复杂滤镜链（CPU↔GPU 拷贝开销大）
- 📌 **质量提示**：同码率下，CPU 编码器（如 `libx264`）的 `slow`/`veryslow` 预设画质优于硬件编码器

**项目建议**：
- 软件自动检测用户硬件并显示可用加速选项
- 提供"软件编码"和"硬件加速"切换开关，默认自动选择
- 硬件加速模式下，自动降低可用的滤镜复杂度

### 2.7 常用命令速查

#### 基础转换
```bash
# 格式转换（自动选择编码器）
ffmpeg -i input.mov output.mp4

# 指定编码器
ffmpeg -i input.mp4 -c:v libx264 -c:a aac output.mkv

# 无损复制流（仅改封装，速度极快）
ffmpeg -i input.mp4 -c copy output.mkv
```

#### 视频裁剪与截取
```bash
# 从第10秒开始，持续5秒（精准截取）
ffmpeg -i input.mp4 -ss 00:00:10 -t 5 -c copy output.mp4

# 截取指定时间范围
ffmpeg -i input.mp4 -ss 00:00:10 -to 00:00:30 -c copy output.mp4
```

#### 音视频分离
```bash
# 提取音频（保留原编码）
ffmpeg -i input.mp4 -vn -c:a copy output.aac

# 提取视频（去除音频）
ffmpeg -i input.mp4 -an -c:v copy output.mp4

# 提取音频并转换为 MP3
ffmpeg -i input.mp4 -vn -c:a libmp3lame -b:a 192k output.mp3
```

#### 合并视频（需先创建文件列表 list.txt）
```bash
ffmpeg -f concat -safe 0 -i list.txt -c copy merged.mp4
```

#### 画质优化编码组合

**推荐配置（内容感知编码）**：
```bash
ffmpeg -i input.mp4 -c:v libx264 -preset slow -crf 23 -aq-mode 2 -rc-lookahead 40 output.mp4
```

**动画/屏幕录制内容**：
```bash
ffmpeg -i input.mp4 -c:v libx264 -preset slow -crf 23 -tune animation output.mp4
```

**高保真归档**：
```bash
ffmpeg -i input.mp4 -c:v libx264 -preset veryslow -crf 18 -tune film -aq-mode 2 output.mp4
```

#### 水印添加
```bash
# 图片水印（右上角，距边距10像素）
ffmpeg -i video.mp4 -i logo.png -filter_complex "overlay=W-w-10:10" output.mp4

# 文字水印
ffmpeg -i video.mp4 -vf "drawtext=text='Hello World':x=10:y=10:fontsize=24:fontcolor=white" output.mp4
```


## 三、FFplay —— 媒体预览播放器

FFplay 用于在软件中提供 **视频预览播放** 功能，用户可在转换前预览源文件内容，或转换后校验输出结果。

### 3.1 基本语法
```bash
ffplay [选项] 输入文件
```

### 3.2 常用选项

| 选项                     | 说明               | 示例                       |
| :----------------------- | :----------------- | :------------------------- |
| `-x width` / `-y height` | 强制显示宽/高      | `-x 640 -y 360`            |
| `-fs`                    | 全屏启动           | `-fs`                      |
| `-an`                    | 禁用音频           | `-an`（静音预览）          |
| `-vn`                    | 禁用视频           | `-vn`（仅音频预览）        |
| `-ss pos`                | 从指定位置开始播放 | `-ss 30`（从30秒开始）     |
| `-t duration`            | 播放指定时长后退出 | `-t 10`（播放10秒）        |
| `-autoexit`              | 播放完成后自动退出 | `-autoexit`                |
| `-exitonkeydown`         | 按任意键退出       | `-exitonkeydown`           |
| `-framedrop`             | 音视频不同步时丢帧 | `-framedrop`（提升流畅度） |
| `-hwaccel`               | 启用硬件加速解码   | `-hwaccel`（降低CPU占用）  |

### 3.3 播放控制快捷键

| 快捷键        | 功能                     |
| :------------ | :----------------------- |
| `q` / `ESC`   | 退出播放                 |
| `f`           | 切换全屏                 |
| `p` / `SPACE` | 暂停/继续                |
| `m`           | 静音切换                 |
| `9` / `0`     | 减小/增大音量            |
| `←` / `→`     | 后退/前进 10 秒          |
| `↓` / `↑`     | 后退/前进 1 分钟         |
| `s`           | 步进到下一帧（暂停状态） |

### 3.4 在软件中调用的典型场景

```bash
# 预览用户选中的视频文件（从开头播放，自动退出）
ffplay -autoexit -framedrop "C:\Users\user\Videos\input.mp4"

# 预览转换后的输出结果（只播放前10秒）
ffplay -t 10 -autoexit "C:\Users\user\Videos\output.mp4"
```


## 四、FFprobe —— 媒体分析器

FFprobe 是媒体文件的"体检医生"，可提取视频的编解码信息、分辨率、码率、帧率、时长、音轨数等元数据。

### 4.1 基本语法
```bash
ffprobe [选项] 输入文件
```

### 4.2 常用选项

| 选项                    | 说明                                       |
| :---------------------- | :----------------------------------------- |
| `-show_format`          | 显示容器格式信息（时长、总码率、元数据等） |
| `-show_streams`         | 显示所有媒体流信息（视频/音频/字幕流详情） |
| `-show_frames`          | 显示每一帧的详细信息                       |
| `-show_packets`         | 显示每个数据包信息                         |
| `-select_streams v/a/s` | 只选择视频(v)/音频(a)/字幕(s)流            |
| `-count_frames`         | 统计每流的帧数                             |
| `-print_format json`    | 以 JSON 格式输出（便于程序解析）           |
| `-print_format xml`     | 以 XML 格式输出                            |
| `-v quiet`              | 静默模式（不输出日志，只输出数据）         |

### 4.3 输出格式（Writer）

```bash
ffprobe -print_format json input.mp4
ffprobe -of default input.mp4
ffprobe -of csv input.mp4
ffprobe -of ini input.mp4
```

### 4.4 流选择

```bash
# 只显示音频流
ffprobe -show_streams -select_streams a input.mp4

# 只显示视频流
ffprobe -show_streams -select_streams v input.mp4
```

### 4.5 高级输出控制（精确字段提取）

只输出特定字段：

```bash
# 只显示流的索引和编码类型，以及数据包的 PTS 时间、时长和流索引
ffprobe -show_entries "packet=pts_time,duration_time,stream_index:stream=index,codec_type" input.mp4

# 只显示格式信息中的时长和文件大小
ffprobe -show_entries "format=duration,size" input.mp4

# 只显示视频流的宽高和编码格式
ffprobe -show_entries "stream=width,height,codec_name" -select_streams v input.mp4
```

### 4.6 在软件中调用的典型场景

```bash
# 获取视频完整元数据（JSON格式，供程序解析）
ffprobe -v quiet -print_format json -show_format -show_streams "C:\Users\user\Videos\input.mp4"

# 只获取视频时长（纯文本，用于界面显示）
ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "C:\Users\user\Videos\input.mp4"

# 获取视频分辨率（用于界面显示）
ffprobe -v quiet -show_entries stream=width,height -select_streams v -of default=noprint_wrappers=1 "C:\Users\user\Videos\input.mp4"
```


## 五、项目集成指南

本章节专门针对你的 Vue 3 + Electron 桌面应用，提供 FFmpeg 的集成方案建议。

### 5.1 FFmpeg 在 Electron 中的集成方式

#### 方案一：打包到应用安装目录（推荐）

将 `ffmpeg.exe`、`ffplay.exe`、`ffprobe.exe` 放置在应用安装目录下的 `bin/` 文件夹中，在 Electron 主进程中通过 `process.resourcesPath` 或 `__dirname` 获取完整路径。

**目录结构示例**：
```
your-app/
├── dist/                  # Vue 构建输出
├── bin/
│   ├── ffmpeg.exe
│   ├── ffplay.exe
│   └── ffprobe.exe
├── electron-main.js
├── preload.js
└── package.json
```

**获取 FFmpeg 可执行文件路径的代码**：

```javascript
// electron-main.js
const path = require('path')
const { app } = require('electron')

function getBinPath() {
  // 开发环境：从项目根目录的 bin/ 读取
  if (process.env.NODE_ENV === 'development') {
    return path.join(__dirname, 'bin')
  }
  // 生产环境：从资源目录读取
  // Windows: C:\Program Files\YourApp\resources\bin\
  return path.join(process.resourcesPath, 'bin')
}

// 构建完整的 FFmpeg 路径
const ffmpegPath = path.join(getBinPath(), 'ffmpeg.exe')
const ffprobePath = path.join(getBinPath(), 'ffprobe.exe')
const ffplayPath = path.join(getBinPath(), 'ffplay.exe')
```

#### 方案二：通过 Node.js 子进程调用

在 Electron 主进程中使用 `child_process.spawn` 或 `exec` 调用 FFmpeg：

```javascript
// electron-main.js
const { spawn } = require('child_process')
const { ipcMain } = require('electron')

ipcMain.handle('convert-video', async (event, { inputPath, outputPath, options }) => {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-c:v', options.videoCodec,
      '-preset', options.preset,
      '-crf', options.crf,
      '-c:a', options.audioCodec,
      outputPath
    ]
    
    const ffmpeg = spawn(ffmpegPath, args)
    
    let stderr = ''
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString()
      // 解析进度信息（详见 5.4 节）
    })
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, outputPath })
      } else {
        reject(new Error(`FFmpeg 退出码: ${code}\n${stderr}`))
      }
    })
    
    ffmpeg.on('error', reject)
  })
})
```

#### 关键打包配置

在 `package.json` 的 `build.files` 中确保 FFmpeg 可执行文件被打包：

```json
{
  "build": {
    "files": [
      "dist/**/*",
      "electron-main.js",
      "preload.js",
      "bin/**/*"   // ← 包含 FFmpeg 可执行文件
    ],
    "asarUnpack": [
      "bin/**/*"   // ← 确保 bin 目录不被 ASAR 打包，否则 spawn 会失败
    ]
  }
}
```

### 5.2 转码功能模块设计建议

基于 FFmpeg 的参数体系，建议在软件中设计以下功能模块：

#### 模块 1：输出格式选择
- **视频封装格式**：MP4、MKV、AVI、MOV、WebM
- **视频编码**：H.264、H.265、VP9、AV1（自动关联推荐封装格式）
- **音频编码**：AAC、MP3、Opus、FLAC

#### 模块 2：速度与质量平衡（映射到 `-preset` + `-crf`）

| 用户可见选项       | 内部 FFmpeg 参数                      | 适用场景           |
| :----------------- | :------------------------------------ | :----------------- |
| 🚀 极速转换         | `-preset ultrafast -crf 28`           | 快速预览、草稿输出 |
| ⚡ 快速转换         | `-preset veryfast -crf 25`            | 日常批量处理       |
| ⚖️ 平衡模式（默认） | `-preset medium -crf 23`              | 大多数场景         |
| 🎨 高质量           | `-preset slow -crf 20 -aq-mode 2`     | 精品视频/内容创作  |
| 📀 极致归档         | `-preset veryslow -crf 18 -aq-mode 2` | 最终存档/母版      |

#### 模块 3：内容类型优化（映射到 `-tune`）
- **自动检测**：通过 ffprobe 分析（见 5.3 节）
- **电影/真人视频** → `-tune film`
- **动画/卡通** → `-tune animation`
- **屏幕录制/幻灯片** → `-tune stillimage`

#### 模块 4：高级设置（供专业用户微调）
- CRF 值滑块（18–28）
- 预设精细选择（全部 10 档）
- 分辨率缩放（`scale` 滤镜）
- 帧率修改（`fps` 滤镜）
- 裁剪与旋转
- 水印添加

#### 模块 5：硬件加速开关
- **自动检测**（推荐）：检测可用硬件编码器并自动启用
- **仅软件编码**：强制使用 `libx264`/`libx265`
- **NVIDIA NVENC**：启用 `h264_nvenc`
- **Intel QSV**：启用 `h264_qsv`
- **AMD AMF**：启用 `h264_amf`

### 5.3 数据库与 ffprobe 结合方案

结合你的 `better-sqlite3` 数据库，建议设计以下数据表和流程：

#### 数据表设计

```sql
-- 视频源文件表
CREATE TABLE video_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,      -- 文件绝对路径
  file_name TEXT NOT NULL,              -- 文件名
  file_size INTEGER,                   -- 文件大小（字节）
  duration REAL,                       -- 时长（秒）
  width INTEGER,                       -- 视频宽度
  height INTEGER,                      -- 视频高度
  video_codec TEXT,                   -- 视频编码格式
  audio_codec TEXT,                   -- 音频编码格式
  audio_channels INTEGER,             -- 声道数
  sample_rate INTEGER,                -- 采样率
  bit_rate INTEGER,                   -- 总码率
  frame_rate REAL,                    -- 帧率
  pix_fmt TEXT,                       -- 像素格式
  metadata TEXT,                      -- 其他元数据（JSON）
  analyzed_at DATETIME,               -- 分析时间
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 转码任务表
CREATE TABLE conversion_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER,                  -- 关联 video_sources.id
  output_path TEXT NOT NULL,          -- 输出文件路径
  output_format TEXT NOT NULL,        -- 输出格式
  preset TEXT,                        -- 预设
  crf INTEGER,                        -- CRF 值
  tune TEXT,                          -- tune 参数
  aq_mode INTEGER,                    -- AQ 模式
  lookahead INTEGER,                  -- 前瞻帧数
  hardware_accel TEXT,                -- 硬件加速类型
  status TEXT DEFAULT 'pending',      -- pending/running/completed/failed
  progress REAL DEFAULT 0,            -- 进度 0-100
  error_message TEXT,                 -- 错误信息
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 自动媒体分析流程

当用户**导入视频文件**时，软件自动调用 `ffprobe` 提取元数据并存入数据库：

```javascript
// 在主进程中调用 ffprobe 并解析 JSON 输出
async function analyzeVideo(filePath) {
  const { exec } = require('child_process')
  const command = `"${ffprobePath}" -v quiet -print_format json -show_format -show_streams "${filePath}"`
  
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) return reject(error)
      
      try {
        const data = JSON.parse(stdout)
        // 提取关键信息
        const videoStream = data.streams.find(s => s.codec_type === 'video')
        const audioStream = data.streams.find(s => s.codec_type === 'audio')
        
        resolve({
          file_path: filePath,
          file_name: path.basename(filePath),
          file_size: data.format.size,
          duration: parseFloat(data.format.duration),
          width: videoStream?.width,
          height: videoStream?.height,
          video_codec: videoStream?.codec_name,
          audio_codec: audioStream?.codec_name,
          audio_channels: audioStream?.channels,
          sample_rate: audioStream?.sample_rate,
          bit_rate: data.format.bit_rate,
          frame_rate: eval(videoStream?.r_frame_rate), // 计算实际帧率
          pix_fmt: videoStream?.pix_fmt,
          metadata: JSON.stringify(data.format.tags),
          analyzed_at: new Date().toISOString()
        })
      } catch (e) {
        reject(e)
      }
    })
  })
}
```

### 5.4 进度反馈方案

FFmpeg 通过 **stderr** 输出进度信息，解析后可实时更新转码进度条。

#### 获取 FFmpeg 进度的方法

使用 `-progress` 参数让 FFmpeg 以机器可读格式输出进度：

```bash
ffmpeg -i input.mp4 -c:v libx264 -progress progress.txt -f mp4 output.mp4
```

或者通过 `-loglevel` 和管道实时解析：

```javascript
// 在 spawn 中实时解析 stderr
ffmpeg.stderr.on('data', (data) => {
  const text = data.toString()
  // 匹配进度信息：frame=123 fps=45 time=00:01:23.45
  const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    const seconds = parseFloat(timeMatch[3])
    const currentTime = hours * 3600 + minutes * 60 + seconds
    // 需要提前通过 ffprobe 获取总时长，然后计算进度百分比
    progress = (currentTime / totalDuration) * 100
    // 通过 IPC 发送进度给渲染进程更新 UI
    mainWindow.webContents.send('conversion-progress', progress)
  }
})
```

#### 完整的转码进度传递流程

```
用户点击"开始转码"
    ↓
渲染进程通过 IPC 调用主进程转换方法
    ↓
主进程 spawn FFmpeg 子进程
    ↓
FFmpeg 通过 stderr 输出进度信息
    ↓
主进程解析进度 → 通过 IPC 发送 'conversion-progress' 事件
    ↓
渲染进程监听事件 → 更新进度条 UI
    ↓
转码完成 → 主进程发送 'conversion-complete' 事件
    ↓
渲染进程显示完成通知并刷新文件列表
```

### 5.5 性能与兼容性策略

#### 多任务队列管理
- 使用**队列系统**管理多个转码任务（单任务队列是 Electron 主进程的推荐方案）
- 任务状态：`pending` → `processing` → `completed` / `failed`
- 界面显示当前任务进度和队列剩余任务数

#### 内存管理
- FFmpeg 单个转码任务内存占用通常在 200MB–1GB 之间
- 建议限制同时运行的任务数为 **1**（避免 OOM）
- 大型视频（> 4K）提醒用户内存需求

#### 兼容性策略

| 场景               | 推荐方案                          | 备选方案               |
| :----------------- | :-------------------------------- | :--------------------- |
| 目标用户配置较低   | `-preset veryfast -crf 28`        | 硬件加速               |
| 追求最高画质       | `-preset slow -crf 18 -aq-mode 2` | `veryslow`             |
| 输出大小有严格限制 | 两遍编码                          | 降低 CRF 值            |
| 老旧设备播放       | H.264 High Profile + AAC          | H.264 Baseline Profile |
| 4K / 高码率源      | 硬件加速 + 合理码率               | 软件编码 + 长时间等待  |

#### 针对不同编码器的推荐参数组合

| 编码器                 | 推荐参数                          | 适用场景                   |
| :--------------------- | :-------------------------------- | :------------------------- |
| `libx264`（CPU）       | `-preset slow -crf 23 -aq-mode 2` | 通用首选                   |
| `libx265`（CPU）       | `-preset slow -crf 26 -aq-mode 2` | 高压缩率需求               |
| `h264_nvenc`（NVIDIA） | `-cq 23`                          | 快速转码，接受轻微画质损失 |
| `h264_qsv`（Intel）    | `-global_quality 23`              | 低功耗转码                 |


## 六、开发注意事项与踩坑指南

### 6.1 路径与转义问题

| 问题                 | 说明                          | 解决方案                                                     |
| :------------------- | :---------------------------- | :----------------------------------------------------------- |
| **Windows 路径空格** | 文件路径含空格时 spawn 会失败 | 用双引号包裹路径：`"C:\Program Files\..."`                   |
| **中文文件名**       | FFmpeg 默认使用 ANSI 编码     | 使用 `child_process` 时设置 `cwd` 为文件所在目录，或使用 `spawn` 的 `windowsVerbatimArguments: true` 选项 |
| **特殊字符转义**     | 滤镜参数中的 `:` 和 `'`       | 在滤镜字符串中使用 `\:` 转义冒号，使用 `"` 包裹整体参数      |

**示例**：处理中文路径的建议代码
```javascript
const ffmpeg = spawn(ffmpegPath, [
  '-i', inputPath,
  '-c:v', 'libx264',
  outputPath
], {
  // 关键：传递环境变量，确保路径编码正确
  env: { ...process.env, LANG: 'zh_CN.UTF-8' }
})
```

### 6.2 FFmpeg 输出解析

- FFmpeg 的 **进度信息在 stderr**，不是 stdout
- 不同版本的 FFmpeg 输出格式略有差异，建议兼容多种格式
- `-progress` 参数输出格式为 `key=value`，便于解析

### 6.3 预置参数保护

- **不要硬编码** FFmpeg 可执行文件路径，应通过配置文件或环境变量获取
- 升级 FFmpeg 版本时，关注参数变更（尤其是硬件加速相关参数）
- 为每个 FFmpeg 调用设置超时机制，防止进程卡死：

```javascript
const timeout = setTimeout(() => {
  ffmpeg.kill('SIGTERM')
  reject(new Error('转码超时'))
}, 3600000) // 1小时超时
```

### 6.4 日志与调试

- 开发环境保留 FFmpeg 的完整 stderr 输出到日志文件
- 生产环境仅记录错误级别日志，避免日志文件过大
- 建议在软件中添加 **"导出 FFmpeg 日志"** 功能，便于用户反馈问题

### 6.5 关于 ASAR 打包

Electron 的 ASAR 打包会将文件归档，但 FFmpeg 的可执行文件 **必须排除在 ASAR 之外**，否则 `child_process.spawn` 无法执行。

```json
{
  "build": {
    "asarUnpack": [
      "bin/**/*"
    ]
  }
}
```

### 6.6 文件锁与并发

- FFmpeg 在转码过程中会**锁定输出文件**，不要尝试同时读写同一文件
- 转码任务启动前，检查输出文件是否已被占用
- 建议使用临时文件名（如 `output_temp.mp4`），转码完成后重命名为最终名称

### 6.7 编码器回退策略

如果用户指定的编码器不可用（例如硬件编码器不存在），应自动回退到软件编码器：

```javascript
const codecMap = {
  'nvenc': { hardware: 'h264_nvenc', fallback: 'libx264' },
  'qsv': { hardware: 'h264_qsv', fallback: 'libx264' },
  'amf': { hardware: 'h264_amf', fallback: 'libx264' }
}

function getVideoCodec(preferred, availableEncoders) {
  const entry = codecMap[preferred]
  if (entry && availableEncoders.includes(entry.hardware)) {
    return entry.hardware
  }
  return entry?.fallback || 'libx264'
}
```


## 附录：完整命令示例

以下命令涵盖了你的软件需要支持的核心功能场景。

### A1. 标准转码（H.264 + AAC，MP4 封装）

```bash
ffmpeg -i "C:\源视频\input.mov" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k "C:\输出\output.mp4"
```

### A2. 内容感知高质量转码

```bash
ffmpeg -i "C:\源视频\input.mp4" -c:v libx264 -preset slow -crf 20 -aq-mode 2 -rc-lookahead 40 -c:a aac -b:a 192k "C:\输出\output.mp4"
```

### A3. 动画内容优化

```bash
ffmpeg -i "C:\源视频\animation.mp4" -c:v libx264 -preset slow -crf 23 -tune animation -aq-mode 2 "C:\输出\output.mp4"
```

### A4. 硬件加速转码（NVIDIA NVENC）

```bash
ffmpeg -i "C:\源视频\input.mp4" -c:v h264_nvenc -cq 23 -c:a aac -b:a 128k "C:\输出\output.mp4"
```

### A5. 两遍编码（精确控制输出大小）

```bash
# 第一遍
ffmpeg -y -i "C:\源视频\input.mp4" -c:v libx264 -b:v 2M -pass 1 -f mp4 NUL
# 第二遍
ffmpeg -i "C:\源视频\input.mp4" -c:v libx264 -b:v 2M -pass 2 -c:a aac "C:\输出\output.mp4"
```

### A6. 添加字幕

```bash
ffmpeg -i "C:\源视频\input.mp4" -vf "subtitles=C:\字幕\sub.srt" -c:a copy "C:\输出\output.mp4"
```

### A7. 裁剪 + 缩放

```bash
ffmpeg -i "C:\源视频\input.mp4" -ss 00:00:10 -t 30 -vf "scale=1280:720" -c:v libx264 -c:a copy "C:\输出\output.mp4"
```

### A8. 仅提取音频

```bash
ffmpeg -i "C:\源视频\input.mp4" -vn -c:a libmp3lame -b:a 192k "C:\输出\audio.mp3"
```

---

> **文档说明**：本手册整合了 FFmpeg 技术参考与 Vue 3 + Electron 项目集成实践，涵盖命令行参数、功能模块设计、数据库结合方案、进度反馈、性能优化及常见踩坑点，便于直接指导开发工作。如需最权威的信息，请参考 [FFmpeg 官方文档](https://ffmpeg.org/documentation.html)。