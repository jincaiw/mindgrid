# MindGrid 桌面 UI 优化方案：对标 XMind / MindNode

> 日期：2026-07-31  
> 目标：桌面 UI 像素级参考 XMind，吸收 MindNode 有机设计元素，将 MindGrid 从"功能完成"提升到"专业产品级视觉"。

---

## 一、现状评估

### 1.1 整体布局差距

| 维度 | 当前 MindGrid | XMind 参考 | MindNode 参考 |
|------|--------------|-----------|--------------|
| 应用底色 | 深色 `#0b1020` 玻璃质感 + 浅色画布，**明暗割裂** | 统一浅色（macOS 浅灰 `#f5f5f7`），画布与 chrome 融为一体 | 统一浅色，Liquid Glass 透明面板浮于画布之上 |
| 工具栏 | 52px 高，17+ 个**纯文字按钮**平铺，无分组无图标 | 顶部 48px 工具栏，图标 + 分隔符分组（文件 / 编辑 / 插入 / 视图） | 顶部 44px 极简工具栏，capsule 控件 |
| 画布区 | 被 `editor-card--scene` 卡片包裹，带 hero 标题 + 描述段 + scene-meta | 画布即主体，无包裹卡片，无说明文字 | 同 XMind，画布优先 |
| 右侧面板 | 320px 全量字段平铺（富内容 / 主题 / 关系线 / 边界 / 概要 / 移动 / 修复），信息过载 | 上下文感知：只显示选中对象相关属性，tab 切换 | 同 XMind，Focus 模式时自动收起 |
| 左侧 | 280px sidebar + editor-rail（主题树 + inline editor 卡片） | 大纲面板可选开关 | 导航器迷你缩略图 |

**核心问题**：当前布局是"仪表盘式"的（hero + 描述 + 卡片网格），而 XMind 是"画布优先式"的（工具栏浮动 / 画布占满 / 面板按需）。这是最大的结构性差距。

### 1.2 节点视觉差距

| 属性 | 当前值 | XMind 参考 | 差距 |
|------|--------|-----------|------|
| 圆角 | `NODE_RADIUS = 20` (DOM) / `20px` (CSS) | 根节点 12px，分支 8px，叶子 6px（按深度递减） | 圆角过大且不分级，XMind 按深度递减更精致 |
| 阴影 | `0 16px 40px rgba(15,23,42,0.08)` 单层 | 双层阴影：`0 1px 2px rgba(0,0,0,0.04)` + `0 4px 12px rgba(0,0,0,0.08)` | 当前阴影过散（blur 40px），XMind 更紧凑克制 |
| 字号 | 根 17px / 分支 15px（仅两级） | 根 18px / L1 14px / L2 13px / L3+ 12px（四级递减） | 缺少深度字号层级 |
| 字重 | 全部 `700` | 根 `600`，分支 `500`，叶子 `400` | 全粗体缺乏层级呼吸 |
| 元信息 | **每个节点都显示** `Depth N · X 子主题 · 已折叠` | 无元信息文字，折叠状态用节点角的 +/− 按钮表达 | 冗余信息严重干扰，XMind 极简 |
| 填充 | 纯色（主题色） | 根节点渐变，分支纯色，叶子透明背景 + 下划线 | XMind 叶子节点极轻量化 |
| 边框 | `1px solid rgba(15,23,42,0.08)` | 根无边框，分支 `1px` 浅边框，叶子无边框 | 当前边框统一，缺少层级区分 |
| padding | `16px 18px` | 根 `10px 20px`，分支 `6px 14px`，叶子 `4px 8px` | padding 过大，节点臃肿 |

### 1.3 连接线差距

| 属性 | 当前 | XMind | 差距 |
|------|------|-------|------|
| 颜色 | 单一 `rgba(41,88,176,0.34)`（全树同色） | **每条主分支不同色**（6-8 色循环），子分支继承父分支色 | 缺少分支色彩编码，这是 XMind 最标志性视觉 |
| 线宽 | 统一 `3px`（激活 `4px`） | 根→L1 `2.5px`，逐级递减到 `1px` | 缺少渐细效果 |
| 线型 | 贝塞尔曲线（正确） | 贝塞尔曲线（一致） | ✅ 已对齐 |
| 端点 | 直接连到节点中心 | 连接到节点边缘，带圆角入角 | 连接点需优化 |

### 1.4 画布差距

| 属性 | 当前 | XMind | 差距 |
|------|------|-------|------|
| 背景 | `radial-gradient + linear-gradient` 双层渐变 | 纯色 `#f5f5f7` 或极淡点阵 | 当前渐变过重，XMind 更干净 |
| 网格 | `48px` 蓝色细线网格，opacity 0.35 | 无网格 或 极淡点阵（dots） | 线网格干扰，XMind 用点阵或无网格 |
| 画布 chrome | hero 标题 + 描述段 + scene-meta + scene-toolbar | 仅右下角浮动缩放控件 | 大量冗余 chrome 需移除 |

### 1.5 工具栏差距

当前工具栏 17 个按钮全是中文文字，无图标、无分组、无分隔符。XMind 工具栏特点：
- 图标化（Lucide / SF Symbols 风格线性图标）
- 分组：`[文件组] | [编辑组] | [插入组] | [视图组] | [演示]`
- 分隔符：组间 1px 竖线
- 主操作高亮（新建 / 演示用强调色）

---

## 二、优化方案（分 6 批实施）

### 批次 1：节点视觉精修 ⭐ 最高优先

**目标**：节点从"臃肿带元信息"变为"XMind 式精致分级"。

**改动文件**：
- `src/features/canvas/runtime/style-constants.ts` — 调整 `NODE_RADIUS` 为按深度函数
- `src/features/canvas/runtime/canvas-renderer.ts` — `drawNodeText` 移除元信息；`drawNodeShadow` 改双层紧凑阴影；字号按深度四级递减
- `src/features/canvas/runtime/scene-builder.ts` — RenderNode 注入 depth-based 样式
- `src/features/canvas/runtime/style-resolver.ts` — 按深度解析字号/字重/圆角/padding
- `src/features/canvas/canvas-host.tsx` — DOM 节点移除 `mindmap-node__meta`，按深度加 class
- `src/styles/global.css` — `.mindmap-node` 调整阴影/padding/圆角，按深度分级

**具体参数**：

```
深度 0 (根):
  字号 18px / 字重 600 / 圆角 12px / padding 10px 20px
  填充 主题色 / 文字 白色 / 无边框
  阴影 0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.08)

深度 1 (一级分支):
  字号 14px / 字重 600 / 圆角 8px / padding 8px 14px
  填充 浅色背景 / 文字 深色 / 1px 浅边框

深度 2:
  字号 13px / 字重 500 / 圆角 6px / padding 6px 12px

深度 3+:
  字号 12px / 字重 400 / 圆角 6px / padding 4px 10px
  填充 透明 / 文字 深色 / 无边框（叶子极简化）
```

**移除项**：
- 删除 `drawNodeText` 中的 `metaText`（`Root · X 子主题 · 已折叠`）
- 删除 DOM 节点的 `mindmap-node__meta` span

### 批次 2：连接线多色分支 + 渐细 ⭐ 高优先

**目标**：实现 XMind 标志性的"每条主分支不同色 + 逐级渐细"。

**改动文件**：
- `src/features/canvas/runtime/style-constants.ts` — 新增 `BRANCH_COLORS` 8 色循环
- `src/features/canvas/runtime/render-tree.ts` — `EdgeRenderNode` 增加 `branchColor` 和 `depth` 字段
- `src/features/canvas/runtime/scene-builder.ts` — 为每条边计算分支色（根的第一个子节点决定整条分支色）和线宽（按深度递减）
- `src/features/canvas/runtime/canvas-renderer.ts` — `drawEdge` 使用 edge 自身的 `branchColor` 和 `lineWidth`
- `src/features/canvas/runtime/style-resolver.ts` — 连线色不再从文档主题取，改从分支色映射取

**分支色板（8 色循环，参考 XMind）**：
```
#5B8DEF (蓝), #FF8B3D (橙), #4CB050 (绿), #E5484D (红),
#9B6BFF (紫), #00A6A6 (青), #F6BE00 (黄), #EC6CB0 (粉)
```

**线宽规则**：
```
depth 0→1: 2.5px
depth 1→2: 2px
depth 2→3: 1.5px
depth 3+:  1px
激活态:    +0.5px
```

### 批次 3：工具栏图标化 + 分组重构 ⭐ 高优先

**目标**：17 个文字按钮 → 图标分组工具栏，视觉对齐 XMind。

**改动文件**：
- `src/features/workspace/toolbar.tsx` — 重构为图标 + tooltip + 分组分隔符
- `src/styles/global.css` — `.toolbar__button` 改为 32×32 方形图标按钮，`.toolbar__divider` 竖线
- 新增 `src/assets/icons/` — 内联 SVG 图标组件（文件/保存/撤销/重做/导出/演示等）

**分组结构**：
```
[新建] | [打开] [保存] [另存为] | [撤销] [重做] | 
[导入] [导出▾] | [模板] | [演示] | [检查更新]
```

- 图标用 16px 线性 SVG（stroke-width 1.5），颜色 `currentColor`
- 按钮 32×32，圆角 8px，hover 浅灰背景 `rgba(0,0,0,0.06)`
- 分组分隔符：1px × 20px 竖线 `rgba(0,0,0,0.08)`
- 文字标题区精简为：文件名 + 保存状态（移除"专业桌面思维导图"副标题）
- 导出类按钮合并为一个下拉菜单（▾）

### 批次 4：画布背景与网格优化

**目标**：画布从"重渐变 + 线网格"变为"XMind 式干净纯色 + 点阵"。

**改动文件**：
- `src/styles/global.css` — `.canvas-host` / `.mindmap-scene` 背景改纯色，网格改点阵
- `src/features/canvas/runtime/style-constants.ts` — `drawGrid` 改为绘制点阵
- `src/features/canvas/runtime/canvas-renderer.ts` — `drawGrid` 实现点阵绘制
- `src/lib/document/themes/built-in-themes.ts` — 各主题背景色调整为 XMind 式浅灰

**具体参数**：
```
画布背景: #f5f5f7 (macOS 浅灰，所有浅色主题统一)
网格: 24px 间距点阵，每点 1px，颜色 rgba(0,0,0,0.06)
暗色主题: 背景 #1a1a2e，点阵 rgba(255,255,255,0.04)
```

### 批次 5：ZEN 专注模式

**目标**：参考 XMind ZEN 模式，隐藏所有 chrome，只留画布 + 右下角浮动控件。

**改动文件**：
- `src/features/workspace/workspace-screen.tsx` — 增加 `zenMode` 状态
- `src/features/workspace/toolbar.tsx` — 增加 ZEN 切换按钮（图标）
- `src/styles/global.css` — `.workspace-shell--zen` 隐藏 toolbar/sidebar/inspector/statusbar
- 快捷键 `Cmd/Ctrl + .` 切换 ZEN 模式

**ZEN 模式行为**：
- 隐藏：toolbar / sidebar / inspector / status-bar / scene-meta / hero
- 保留：画布 + 右下角浮动缩放控件 + Esc 退出
- 画布 padding 归零，占满视口

### 批次 6：Inspector 面板视觉重构 ✅ 已完成（2026-07-31）

**目标**：从"全量字段平铺"变为"上下文感知 tab 面板"。

**改动文件**：
- `src/features/workspace/inspector.tsx` — 重构为 tab 结构（tablist + tabpanel ARIA）
- `src/features/workspace/icons.tsx` — 新增 `TypeIcon` / `GridIcon` / `LinkIcon` / `GroupIcon` 4 个 14px 线性图标
- `src/styles/global.css` — 新增 `.panel__tabs` / `.panel__tab` / `.panel__tab--active` / `.panel__tab-body` / `.panel__tab-panel` / `.panel__section--repair` 样式
- `src/features/workspace/workspace-screen.test.tsx` — 主题测试用例补充切到画布 tab 步骤；新增 tab 切换交互测试

**Tab 结构**：
```
[主题] [画布] [关系线] [分组]
```
- 主题 tab（默认）：选中节点时显示富内容编辑（备注/链接/标签/标记/样式引用/颜色覆盖/任务）+ 跨画布移动；多选时显示提示
- 画布 tab：画布信息（当前画布/历史能力）+ 文档主题选择器（5 内置主题 + 恢复默认）
- 关系线 tab：关系线列表 + 创建表单（起点/终点/标签）
- 分组 tab：边界列表 + 概要列表 + 创建表单
- 修复摘要：放在 tab body 外，始终可见

**视觉对齐 XMind**：
- Tab 按钮：14px 图标 + 12px 文字，未选中 `color-text-secondary`，选中 `color-accent` + 600 字重 + 2px accent 下划线
- Tab 容器：底部 1px border 分隔，浅色背景 `rgba(255,255,255,0.55)`
- Tab body：可滚动（`overflow-y: auto`），padding 16px
- Inspector panel padding 改为 0，由 tab-body 接管

**验证**：三绿 300 前端（+1 tab 切换测试）+ 73 Rust + build 通过；Playwright 视觉验证 4 tab 切换正常 + 零 console error。

---

## 三、实施顺序与验证

| 批次 | 优先级 | 预计改动量 | 依赖 | 状态 |
|------|--------|-----------|------|------|
| 1 节点精修 | P0 | 中（6 文件） | 无 | ✅ 完成 |
| 2 连接线 | P0 | 中（5 文件） | 无 | ✅ 完成 |
| 3 工具栏 | P0 | 中（3 文件） | 无 | ✅ 完成 |
| 4 画布背景 | P1 | 小（4 文件） | 无 | ✅ 完成 |
| 5 ZEN 模式 | P1 | 小（4 文件） | 批次 3 | ✅ 完成 |
| 6 Inspector | P2 | 大（4 文件） | 无 | ✅ 完成 |

**验证标准**（每批后）：
1. `pnpm test` 全绿
2. `pnpm build` 成功
3. `cargo test --manifest-path src-tauri/Cargo.toml` 全绿
4. 端到端视觉验证（Playwright 截图对比）

---

## 四、风险点

1. **Canvas/DOM 双端一致**：节点样式改动需同时更新 `canvas-renderer.ts`（Canvas 2D）和 `canvas-host.tsx`（DOM），否则混合渲染会不一致。
2. **SVG/PNG 导出一致**：`svg-renderer.ts` 和 `png-exporter` 共用 `style-constants.ts`，改动常量会影响导出。
3. **测试快照**：现有测试可能断言了节点 meta 文字或边颜色，移除元信息后需同步更新测试。
4. **分支色持久化**：分支色是运行时计算的（按根子节点顺序），不存入文档，保证旧文档兼容。
5. **主题色覆盖**：分支色与文档主题色的优先级需明确——分支色作为连线默认色，节点填充仍走主题色。
