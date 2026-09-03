# MindGrid

**专业桌面思维导图应用** — Xmind 的能力完整度 + MindNode 的优秀体验。

MindGrid 是一款基于 Tauri 2 + React 19 + Rust 的桌面思维导图应用，支持 6 种图表类型、富内容编辑、演示模式、多格式导入导出，以及 10k 节点级别的高性能画布运行时。

## 核心特性

### 📊 6 种图表类型
- **思维导图**（Mind Map）— 经典双侧放射布局
- **逻辑图**（Logic Chart）— 单向水平展开
- **树形图**（Tree Chart）— 垂直层级结构
- **组织架构图**（Org Chart）— 上下级关系
- **鱼骨图**（Fishbone）— 因果分析
- **时间线**（Timeline）— 时序排列

支持图表类型即时切换，自动重新布局。

### 🎨 样式系统
- 5 套内置主题色板（默认/暗夜/海洋/森林/暖阳）
- 节点级样式覆盖（填充色/文字色/边框色）
- 6 色快速预设 + 自定义颜色编辑器
- 层级默认色与节点覆盖的优先级合并

### 📝 富内容编辑
- 图标标记（优先级、进度、旗帜等）
- 文本标签
- 富文本备注
- 超链接
- 任务属性（状态/截止日期/优先级）
- 图片附件（SHA-256 去重）

### 🔗 关系线 / 边界 / 概要
- **关系线**：任意两个主题间的非父子连接
- **边界**：框选一组主题做视觉分组
- **概要节点**：对一组兄弟主题的归纳总结

### 📋 模板系统
- 内置模板（项目计划/会议纪要/读书笔记/头脑风暴等）
- 从模板创建时自动重新生成所有 ID
- 模板选择器 UI

### 🎬 演示模式
- DFS 前序遍历，逐节点/逐分支渐进揭示
- 相机自动跟随聚焦（zoom clamp 0.6–1.8）
- 平滑相机动画（480ms easeInOutCubic，zoom 对数空间插值）
- 键盘导航：→/Space/Enter 下一张、←/Backspace 上一张、Home/End 首末张、F 全屏、Esc 退出
- 全屏覆盖层 + 玻璃态控制条

### 📂 导入导出
- **导入**：Markdown、OPML
- **导出**：Markdown、OPML、PNG（高清）、SVG（矢量）
- 导入事务化（失败回滚），导出支持自定义路径

### 💾 .mgd 文件格式
- ZIP + JSON 容器，格式版本 1.1.0
- `mimetype` / `manifest.json` / `document.json` / `metadata.json` / `styles.json`
- `assets/`（SHA-256 去重 + 引用计数 + GC）
- 完整性校验 Level 0–4（容器/语法/结构/语义/Hash）
- Zip Bomb 防护（256MB / 100:1 / 64MB / 10k 条目）
- 原子保存（temp → validate → fsync → replace → fsync parent）
- 旁路锁文件 `.mgd.lock`
- 未知字段保留（前向兼容）
- `mindgrid-file` CLI 工具：inspect / validate / extract / repair / migrate / pack

### ⚡ 高性能画布运行时
- 空间索引（Grid Hash）Hit Test
- 视口剔除 + 虚拟化（Overscan）
- 10k 节点：布局 <3s、场景 <1.5s、可见节点 <500
- 混合 DOM + Canvas 渲染
- 完整交互状态机（8 状态：Idle/Hovering/Selecting/BoxSelecting/Panning/DraggingTopic/EditingText/AnimatingCamera/Presenting）
- 拖拽 guide/snap、边缘自动平移、连续手势

### 🔄 自动更新
- tauri-plugin-updater 集成
- 启动后自动检查（release 构建）
- 手动"检查更新"按钮
- 下载进度可视化
- 签名验证（Ed25519）
- 优雅降级（未配置时静默跳过）

## 架构

```
四层架构：UI → Application → Domain → Infrastructure

┌─────────────────────────────────────────────────┐
│  UI Layer (React 19 + TypeScript)               │
│  ├── Workspace / Toolbar / Sidebar / Inspector  │
│  ├── Canvas Runtime (Render Tree + Scene)       │
│  ├── Presentation Mode                          │
│  └── Updater Notification                       │
├─────────────────────────────────────────────────┤
│  Application Layer (Tauri IPC)                  │
│  ├── Command Handlers                           │
│  ├── Import/Export Pipeline                     │
│  └── Persistence (Atomic Save + Recovery)       │
├─────────────────────────────────────────────────┤
│  Domain Layer (Rust)                            │
│  ├── Document Model (Rich Topic + Relationships)│
│  ├── Command/ChangeSet System                   │
│  ├── Document Editor (Transactional)            │
│  └── Schema Migration (1.0.0 → 1.1.0)           │
├─────────────────────────────────────────────────┤
│  Infrastructure (Rust + Tauri)                  │
│  ├── .mgd ZIP Container                         │
│  ├── Asset Management (SHA-256 Dedup + GC)     │
│  ├── File Locking                               │
│  └── CLI Tool (mindgrid-file)                   │
└─────────────────────────────────────────────────┘
```

## 开发

### 环境要求
- Node.js 22+
- pnpm 11+
- Rust 1.77+ (stable)
- macOS: Xcode Command Line Tools
- Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev`
- Windows: WebView2 Runtime

### 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式（浏览器，无需 Tauri）
pnpm dev

# 桌面开发模式（Tauri 窗口）
pnpm tauri dev

# 构建生产版本
pnpm build              # 前端
pnpm tauri build        # 完整桌面应用（含 DMG/NSIS/AppImage）

# 测试
pnpm test               # 前端单测（Vitest）
cargo test --manifest-path src-tauri/Cargo.toml  # Rust 单测

# Lint
pnpm lint               # oxlint

# CLI 工具
cargo build --manifest-path src-tauri/Cargo.toml --features cli --bin mindgrid-file
./src-tauri/target/debug/mindgrid-file inspect <file.mgd>
```

### 测试覆盖

- **前端**：517 个单测（Vitest + Testing Library）
- **Rust**：118 个单测（cargo test）
- **三绿门禁**：`pnpm test` + `pnpm build` + `cargo test` 全部通过
- **类型检查**：`pnpm typecheck`（注意：`tsc --noEmit` 在本仓库恒退 0、不做任何检查，勿用）

## 发布

### 本地构建

```bash
pnpm tauri build
# 产物：src-tauri/target/release/bundle/
#   macOS:   MindGrid.app + MindGrid_0.1.0_aarch64.dmg
#   Windows: MindGrid_0.1.0_x64-setup.exe (NSIS)
#   Linux:   mindgrid_0.1.0_amd64.deb + .AppImage
```

### CI/CD

- **CI**（`.github/workflows/ci.yml`）：push/PR 自动运行三绿门禁
- **Release**（`.github/workflows/release.yml`）：推送 `v*` 标签触发跨平台构建 + GitHub Release

### 签名与自动更新

详见 [docs/release/signing-and-updates.md](docs/release/signing-and-updates.md)。

V1 发布**未签名**安装包，用户首次打开需手动信任：
- macOS：System Settings → Privacy & Security → "仍要打开"
- Windows：SmartScreen → "更多信息" → "仍要运行"
- Linux：`chmod +x *.AppImage`

## 项目结构

```
MindGrid/
├── src/                          # 前端源码
│   ├── app/                      # 应用入口与壳层
│   ├── features/                 # 功能模块
│   │   ├── canvas/               # 画布运行时（Render Tree + Renderer + 交互状态机）
│   │   ├── document/             # 文档会话管理
│   │   ├── presentation/         # 演示模式
│   │   ├── updater/              # 自动更新
│   │   ├── workspace/            # 工作区（Toolbar/Sidebar/Inspector/CanvasHost）
│   │   ├── status/               # 状态栏
│   │   └── feedback/             # Toast 通知
│   ├── lib/                      # 公共库（文档类型 + IPC 传输层）
│   └── styles/                   # 全局样式与设计 Token
├── src-tauri/                    # Rust 后端
│   └── src/
│       ├── domain/               # 领域模型（Document + Editor + Command）
│       ├── app/                  # 应用服务（Commands + Persistence + Assets + Import/Export）
│       └── bin/                  # CLI 工具（mindgrid-file）
├── docs/                         # 文档
│   ├── superpowers/plans/        # 实施计划与路线图
│   └── release/                  # 发布指南
├── scripts/                      # 构建/发布脚本
└── .github/workflows/            # CI/CD 工作流
```

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2.11 |
| 前端 | React 19 + TypeScript 6 + Vite 8 |
| 后端 | Rust (stable) |
| 测试 | Vitest 4 + Testing Library 16 + cargo test |
| Lint | oxlint |
| 持久化 | ZIP (Deflate) + JSON |
| 渲染 | Canvas 2D + DOM 混合 |
| 状态管理 | React Hooks + Reducer |
| IPC | Tauri invoke (camelCase JSON) |

## 许可证

Copyright © 2026 MindGrid. All rights reserved.
