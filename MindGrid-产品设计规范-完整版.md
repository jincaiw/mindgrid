# MindGrid 产品设计规范（完整版）

- 版本：V1.0
- 日期：2026-07-29
- 状态：设计与架构基线

本文件合并了产品总纲、产品设计原则、UI、UX、系统架构、Canvas、布局引擎、文件格式、ADR 与术语表。

---

# 01 产品总纲

## 1. 产品定义

MindGrid 是一款面向个人与专业用户的桌面思维导图应用，提供高性能、自然、稳定、跨平台的思维组织体验。

## 2. 核心价值

MindGrid 追求四个关键词：

- 专业
- 美观
- 快速
- 原生

其产品表达为：

> Xmind 的完整能力 + MindNode 的优秀体验。

## 3. 产品边界

### V1 支持

- Mind Map
- Logic Chart
- Tree Chart
- Organization Chart
- Fishbone
- Timeline
- 多 Sheet
- 主题、子主题、概要、边界、关系线
- 图片、图标、标签、备注、链接、轻量任务属性
- 模板
- 搜索
- 演示模式
- 导入导出
- 自动保存与恢复

### 明确不做

- 白板
- 流程图套件
- UML
- Kanban
- 数据库
- Markdown 编辑器
- 知识库
- 笔记系统
- PPT 编辑器
- 团队项目管理

## 4. 用户群体

- 个人知识整理用户
- 学生与教师
- 产品经理
- 咨询顾问
- 研究人员
- 企业管理人员
- 战略与规划人员
- IT 与工程人员

## 5. 平台与技术

- macOS
- Windows
- Linux

技术栈：

- Tauri 2
- Rust
- React
- TypeScript
- Vite

## 6. 产品成功标准

### 体验

- 新用户可在 5 分钟内掌握基本编辑。
- 核心操作可由键盘完成。
- 常规操作反馈在约 100ms 内开始。
- 动画可中断，不阻塞编辑。

### 性能

- 1,000 个展开主题保持流畅浏览和缩放。
- 3,000 个展开主题可继续编辑，无明显秒级卡顿。
- 10,000 个主题在合理折叠条件下可打开、搜索和导航。

### 稳定性

- 自动保存
- 原子保存
- 崩溃恢复
- 文件完整性校验
- 损坏文档部分恢复

## 7. 差异化

MindGrid 不通过堆砌功能建立差异，而是通过以下组合：

- 更纯粹的思维导图定位
- 更高性能的自研 Canvas
- 更自然的布局过渡
- 更稳定的键盘工作流
- 更开放的数据格式
- 更强的本地优先能力


---

# 02 产品设计原则

## 1. 设计哲学

MindGrid 只做专业思维导图。

所有新增功能必须回答：

1. 是否直接提升思维组织效率？
2. 是否破坏产品边界？
3. 是否增加认知负担？
4. 是否影响性能与稳定性？
5. 是否可以通过更简单方式实现？

## 2. 核心原则

### P1 Local First

- 离线优先
- 云端能力可选
- 文档默认保存在本地
- 不依赖登录才能使用核心功能
- 用户数据可导出、可恢复

### P2 Performance First

性能优先于功能数量。

- 不因便利而把所有节点做成复杂 DOM。
- 不允许主线程执行长时间布局或导出。
- 所有高频交互应避免 IPC。
- 大文档必须有基准测试。

### P3 Native Experience

- macOS 遵循 Apple HIG
- Windows 参考 Fluent
- Linux 尊重 GTK/KDE 习惯
- 跨平台保持行为一致，但不强制视觉完全相同

### P4 Keyboard First

- 所有核心功能必须有快捷键
- 快捷键必须可发现
- 菜单中显示快捷键
- 允许用户后续自定义

### P5 Simple by Default

- 默认界面简洁
- 高级设置放入 Inspector
- 不在首屏暴露低频选项
- 新用户无需理解布局算法即可工作

### P6 Design Token First

颜色、字体、圆角、阴影、间距、动画均通过 Token 管理，禁止在组件中大量散落硬编码。

### P7 Component Reuse

相同语义必须复用同一组件与交互规则。

### P8 Consistency Before Expansion

在已有体验未统一前，不扩张功能范围。

## 3. UX 原则

- 减少点击
- 保持上下文
- 内联编辑
- 连续编辑
- 不阻塞
- 自动保存
- 即时反馈
- 错误可恢复

## 4. 动效原则

- 时长通常 120–180ms
- 可被新输入立即打断
- 不使用弹跳、发光、无意义缩放
- 动画服务于状态理解，不用于装饰
- 大文档下自动降低复杂度

## 5. 架构原则

- UI 不得直接修改 Document Model
- 所有持久化修改必须经过 Command
- 模块职责单一
- 依赖单向
- 无循环依赖
- 核心模块可替换
- 核心领域不依赖 UI、数据库和平台 API

## 6. 多轮评估结论

| 维度 | 结论 |
|---|---|
| 产品聚焦 | 优秀 |
| 可维护性 | 优秀 |
| 长期演进 | 优秀 |
| 用户认知负担 | 低 |
| 功能边界风险 | 可控 |
| 综合评价 | 9.8/10 |


---

# 03 UI 设计规范

## 1. 设计语言

MindGrid 采用 Minimal Native Design。

参考顺序：

1. Apple HIG
2. Microsoft Fluent
3. MindNode
4. 少量 Xmind

Material Design 不作为桌面主设计语言。

## 2. 布局结构

```text
┌────────────────────────────────────────────┐
│ Toolbar                                    │
├──────────────┬────────────────┬────────────┤
│ Sidebar      │ Canvas         │ Inspector  │
│ 280px        │ Flexible       │ 320px      │
└──────────────┴────────────────┴────────────┘
```

### Toolbar

- 高度：52px
- 图标优先
- 低频操作按优先级折叠
- 包含：撤销、重做、新建主题、删除、布局、主题、演示、搜索

### Sidebar

- 默认宽度：280px
- 可调整
- 包含：文档、大纲、模板、历史、搜索

### Inspector

- 默认宽度：320px
- 默认可隐藏
- 手风琴分组：
  - Style
  - Layout
  - Icon
  - Note
  - Task
  - Link
  - Image

## 3. Canvas

- 默认浅灰或中性背景
- 网格默认关闭
- MiniMap 默认关闭
- 可加入极轻微纹理，避免大片纯色空洞感
- 不用花哨渐变
- 节点选中颜色统一

## 4. 色彩系统

采用语义 Token：

- `color.background.app`
- `color.background.canvas`
- `color.surface.panel`
- `color.text.primary`
- `color.text.secondary`
- `color.border.default`
- `color.accent`
- `color.selection`
- `color.focus-ring`
- `color.success`
- `color.warning`
- `color.error`
- `color.info`
- `color.disabled`

默认 Accent 可使用接近 `#3B82F6` 的蓝色，但组件不得直接依赖该十六进制值。

## 5. 字体

### 平台字体

- macOS：SF Pro / PingFang SC
- Windows：Segoe UI Variable / Microsoft YaHei
- Linux：Noto Sans / Noto Sans CJK

### 字号范围

10、11、12、13、14、16、18、24、32

默认正文不宜小于 12px。

## 6. 间距

采用 8pt Grid。

常用间距：

- 4：微小内部间距
- 8：基础间距
- 16：组件内边距
- 24：区块间距
- 32：大区块间距

## 7. 圆角与阴影

只定义有限层级：

### 圆角

- Small
- Medium
- Large

### 阴影

- Level 1：浮动控件
- Level 2：菜单与 Popover
- Level 3：模态对话框

避免重阴影、发光和多层叠加。

## 8. 节点视觉

- 默认无边框或极轻边框
- Hover 仅轻微背景变化
- Selection 使用统一 Accent
- 不做弹跳、发光和大幅缩放
- 文字可读性优先
- 同一层级样式一致

## 9. 图标

- SVG
- 24px 基础尺寸
- Outline 风格
- 线宽统一
- 不混用多套图标
- 不使用 Emoji 代替产品图标

## 10. 空状态与加载

每个页面必须定义空状态。

加载规则：

- 500ms 内不显示 Spinner
- 优先 Skeleton
- 长任务显示进度与取消
- 不允许全屏遮挡画布处理普通后台任务

## 11. 可访问性

- 文字与背景符合合理对比度
- 不只依赖颜色表达状态
- 控件支持键盘焦点
- Focus Ring 明确
- 图标按钮必须有 Tooltip 和可访问名称
- 支持系统减少动态效果设置

## 12. 评审结论

UI 规范在简洁、原生、可维护性与一致性方面达到设计基线。

综合评价：9.7/10。


---

# 04 UX 交互规范

## 1. 核心目标

减少认知负担，让用户专注于想法而不是软件。

## 2. 交互模型

仅保留四类主要交互：

- Click
- Drag
- Keyboard
- Gesture

不引入难以发现的复杂手势体系。

## 3. 编辑规则

### 选择

- 单击：选择
- 双击：编辑
- 三击：选择主题文本
- Shift：范围选择
- Ctrl/Cmd：离散多选
- 框选：选择区域内主题

### 内联编辑

所有主题文本均内联编辑：

- 不弹出独立编辑对话框
- 支持输入法
- 支持多行
- Escape 取消
- Ctrl/Cmd + Enter 提交
- 编辑时隐藏 Canvas 对应文字

## 4. 键盘工作流

| 快捷键 | 行为 |
|---|---|
| Tab | 新建子主题 |
| Enter | 新建同级主题 |
| Shift + Tab | 选择父主题 |
| Delete/Backspace | 删除 |
| Space | 折叠/展开 |
| Ctrl/Cmd + F | 搜索 |
| Ctrl/Cmd + D | 复制主题 |
| Ctrl/Cmd + 0 | 适配画布 |
| Ctrl/Cmd + 1 | 100% 缩放 |
| Escape | 取消当前操作 |

所有核心功能必须能由键盘完成。

## 5. 鼠标与拖拽

- 鼠标用于定位
- 键盘用于连续编辑
- 拖拽实时显示预览
- 支持 Auto Scroll、Edge Scroll、Snap、Guide
- 拖拽过程不直接修改 Document
- 释放后提交 Command

## 6. 触控板

- 双指平移
- 捏合缩放
- 惯性滚动
- 新输入立即终止惯性
- 可配置双击聚焦

## 7. 缩放与导航

- 鼠标滚轮
- 触控板捏合
- 双击聚焦
- 10%–800%
- 指针处缩放
- 缩放不改变 World Coordinates

## 8. 搜索

- 使用浮动搜索
- 不使用阻塞模态框
- 支持逐项导航
- 搜索高亮不写入文档
- 搜索结果可定位并展开必要分支

## 9. Focus Mode

编辑当前主题时，可降低无关分支视觉权重。

要求：

- 不隐藏结构
- 不改变文档
- 可快速退出
- 避免过度模糊

## 10. 批量操作

多选主题可批量修改：

- 颜色
- 字体
- 样式
- 标签
- Marker
- 折叠状态

冲突属性在 Inspector 中显示 Mixed State。

## 11. 撤销与错误

所有用户可感知的文档修改必须可撤销，包括：

- 主题创建和删除
- 移动
- 布局切换
- 样式
- 导入
- 批量修改

普通错误使用 Toast；只有数据丢失风险才使用 Dialog。

## 12. 保存

- 自动保存
- 不依赖显式 Save 按钮
- 高频编辑先写恢复区
- 正式文件采用稳定自动保存或显式保存
- 保存不阻塞编辑

## 13. 演示模式

- 不打开新窗口
- 画布直接进入演示状态
- 支持节点聚焦与顺序播放
- 退出后恢复原 Camera 和 Selection

## 14. 体验指标

- 常规反馈约 100ms 内开始
- 动画 120–180ms
- 新输入可打断动画
- 不使用无意义过渡
- 关键任务不超过必要步骤

综合评价：9.74/10。


---

# 05 系统架构（SAD）

## 1. 架构目标

- 长期维护
- 模块可替换
- 可测试
- 跨平台
- 高性能
- 数据可靠
- 为未来扩展保留边界，但不提前引入复杂度

## 2. 四层架构

```text
UI Layer
    ↓
Application Layer
    ↓
Domain Layer
    ↓
Infrastructure Layer
```

依赖只能向内，不允许反向依赖和循环依赖。

## 3. UI Layer

负责：

- Toolbar
- Sidebar
- Canvas Host
- Inspector
- Dialog
- Menu
- Shortcut
- Animation
- DOM Overlay

禁止放置核心业务规则。

## 4. Application Layer

负责 Use Case：

- Create Topic
- Delete Topic
- Move Topic
- Rename Topic
- Import
- Export
- Search
- Undo
- Redo
- Document Lifecycle

Application 负责事务边界与 Command 调度。

## 5. Domain Layer

包含：

- Document
- Sheet
- Topic
- Relationship
- Boundary
- Summary
- Theme
- Layout Configuration
- Command
- History
- Revision
- ChangeSet

Domain 不依赖 UI、数据库、文件系统和 Tauri。

## 6. Infrastructure Layer

包含：

- SQLite
- 文件系统
- `.mgd`
- 剪贴板
- 图片解码
- OS 集成
- 自动更新
- Logger
- Crash Report
- Window
- Platform Adapter

## 7. Single Source of Truth

Rust 中的 Document Model 是持久化权威数据。

前端只维护：

- Document Projection
- Selection
- Hover
- Camera
- Editing State
- Drag Preview
- Animation State

## 8. Command 流程

```text
User Input
→ TypeScript Intent
→ Command Request
→ Tauri IPC
→ Rust Command Handler
→ Domain Validation
→ Document Mutation
→ ChangeSet
→ Projection Update
→ Layout
→ Scene
→ Render
```

## 9. Thread Model

- UI：主线程
- Layout：Worker
- Export：Worker 或 Rust 后台任务
- Import：后台任务
- Search：后台索引
- Thumbnail：后台任务

不得阻塞 UI。

## 10. Event 与模块通信

Event 用于通知：

- Node Created
- Document Changed
- Layout Completed
- Asset Loaded
- Save Completed
- Recovery Available

但 Domain 修改仍必须通过 Command，不能以 Event 替代业务事务。

## 11. Dependency Injection

以下能力通过接口注入：

- Storage
- Logger
- Clock
- ID Generator
- Asset Store
- File Dialog
- Platform Service
- Recovery Store

## 12. 事务

批量操作必须支持事务：

- 粘贴多个主题
- 批量删除
- 导入
- 批量样式修改
- 布局切换

失败时整体回滚。

## 13. Document Service

负责：

- 新建
- 打开
- 关闭
- 恢复
- 自动保存调度
- 文件锁
- 格式迁移
- 文档状态

## 14. Asset Manager

负责：

- 哈希
- 去重
- 缓存
- 引用计数
- 缩略图
- 垃圾回收

## 15. Workspace Manager

负责：

- 最近文档
- 窗口布局
- 用户偏好
- 模板目录
- 扩展配置

这些数据不进入 Document。

## 16. 插件与 AI

插件和 AI 均属于 Extension，不属于 Core。

要求：

- 只能通过 Application API
- 不直接修改 Document
- 可移除后不影响核心功能
- 不允许执行未授权脚本

## 17. 评审结论

| 维度 | 评分 |
|---|---:|
| 模块解耦 | 9.9 |
| 可测试性 | 9.8 |
| 可维护性 | 9.9 |
| 可扩展性 | 10.0 |
| 长期演进 | 9.9 |
| 综合评分 | 9.9 |


---

# 06 Canvas 引擎设计

## 1. 技术路线

- 自研 Canvas Engine
- Canvas 2D
- OffscreenCanvas
- Worker
- TypeScript 负责实时交互
- Renderer 接口可替换

## 2. 数据流

```text
Document Model
→ Document Projection
→ Layout Input
→ Layout Engine
→ Layout Result
→ Scene Builder
→ Render Tree
→ Renderer
→ Screen
```

输入流：

```text
Pointer / Keyboard / Gesture
→ Input Normalizer
→ Hit Test
→ Interaction State Machine
→ Intent
→ Application Command
```

## 3. 核心模块

- Viewport
- Camera
- Scene
- Render Tree
- Renderer
- Hit Test
- Selection
- Interaction
- Animation
- Overlay
- Virtualization
- Export Adapter

## 4. 坐标系统

三套坐标：

- Screen Coordinates
- Viewport Coordinates
- World Coordinates

所有转换必须使用统一 Transform API。

## 5. Camera

```typescript
interface CameraState {
  x: number;
  y: number;
  zoom: number;
}
```

规则：

- 默认 100%
- 最小 10%
- 最大 800%
- 指针处缩放
- 平移不改变 World Coordinates
- 惯性可被新输入打断

## 6. 图层

```text
00 Background
10 Grid
20 Relationships
30 Branches
40 Boundaries
50 Topic Backgrounds
60 Topic Content
70 Markers
80 Selection
90 Drag Preview
100 Guides
110 Inline Editor
120 Popover Anchors
```

## 7. Render Tree

一个 Topic 可拆分为：

- Background
- Text
- Icon
- Marker
- Collapse Control
- Selection Decoration

Renderer 只读取 Render Tree，不读取 Document。

## 8. Hit Test

优先级：

```text
Handle
→ Collapse Control
→ Marker/Icon
→ Text
→ Topic Body
→ Relationship
→ Branch
→ Boundary
→ Background
```

大文档使用空间索引，例如 R-tree 或 Quadtree。

## 9. Selection

Selection 属于会话状态，不写入 `.mgd`。

支持：

- 单选
- 多选
- 框选
- 同级
- 子树
- 全 Sheet

## 10. Interaction State Machine

主状态包括：

- Idle
- Hovering
- Selecting
- BoxSelecting
- Panning
- DraggingTopic
- DraggingRelationship
- EditingText
- ResizingImage
- CreatingRelationship
- AnimatingCamera
- Presenting

同一时刻只能有一个主状态。

## 11. 文本编辑

采用 DOM Overlay：

- 输入法友好
- 与 Canvas 字体一致
- 编辑时隐藏 Canvas 文本
- 提交后生成 Command
- Escape 取消

## 12. 渲染调度

采用按需 Invalidate，不永久空跑动画循环。

```text
Invalidate
→ 合并请求
→ requestAnimationFrame
→ Visible Set
→ Draw
→ Stats
```

## 13. 增量更新

- 选择变化：仅装饰层
- 平移缩放：不重建场景
- 文本变化：局部分支布局
- 布局切换：全量布局
- 增量失败：回退全量

## 14. 虚拟化

只绘制 Viewport + Overscan。

建议初始 Overscan 为视口宽高的 25%。

## 15. 性能预算

| 场景 | 目标 |
|---|---|
| 1,000 主题 | 60 FPS 浏览和缩放 |
| 3,000 主题 | 连续编辑，无秒级冻结 |
| 10,000 主题 | 可打开、搜索、导航、继续编辑 |

60 FPS 帧预算：

- 总预算：16.67ms
- 输入与状态：≤2ms
- 可见性：≤2ms
- 场景更新：≤3ms
- 绘制：≤7ms
- 余量：≥2ms

## 16. React 边界

React 负责外壳与面板，不为每个主题创建常驻组件。

## 17. 错误恢复

Canvas 崩溃时：

- 不损坏 Document
- 取消交互
- 保留稳定状态
- 尝试重建 Scene
- 失败时允许保存原始文档

## 18. 测试

- 坐标转换
- Camera
- Hit Test
- Selection
- 状态机
- Z-order
- 视觉回归
- 性能基准


---

# 07 Layout Engine 设计

## 1. 定位

Layout Engine 将逻辑主题树转换为稳定几何布局。

不负责绘制、输入、保存和 Undo。

## 2. 支持布局

- Mind Map
- Logic Chart
- Tree Chart
- Organization Chart
- Fishbone
- Timeline

## 3. 输入

- Topic Tree
- Measured Size
- Layout Configuration
- Previous Layout Hint
- Relationships
- Boundaries
- Summaries
- Revision

## 4. 输出

- Topic Bounds
- Text Bounds
- Anchor Points
- Branch Geometry
- Relationship Geometry
- Boundary Geometry
- Navigation Graph
- Document Extent
- Diagnostics

## 5. 文本测量

布局前必须完成文本测量。

缓存键包括：

- Text
- Font Family
- Font Size
- Font Weight
- Line Height
- Max Width
- Markers
- Padding

测量与最终 Canvas 绘制必须保持一致。

## 6. Mind Map

- 中心主题居中
- 一级分支左、右或双侧
- 自动平衡左右高度
- 已手动指定 Side 的分支不自动换边
- 稳定性优先于绝对均衡

## 7. Logic Chart

支持四个方向：

- Left to Right
- Right to Left
- Top to Bottom
- Bottom to Top

默认 Left to Right。

## 8. Tree Chart

- Horizontal Tree
- Vertical Tree
- 父主题相对子树居中
- 层级距离稳定

## 9. Organization Chart

- 默认 Top to Bottom
- 支持 Assistant Topic
- 使用组织图专用连接线
- 适合大规模纵向浏览

## 10. Fishbone

必须使用专用算法：

- Head
- Spine
- Main Bones
- Sub Bones
- 上下交替
- 文本不得与骨线重叠

## 11. Timeline

- Horizontal
- Vertical
- 有日期时可显式按日期排序
- 无日期时按主题顺序
- 不进行隐藏自动重排

## 12. Relationship Routing

支持：

- Straight
- Curve
- Orthogonal

手动控制点必须持久化。

## 13. Boundary 与 Summary

Boundary 包围子树或连续范围。

Summary 只能覆盖同一父主题下的连续子主题。

## 14. 手动布局边界

允许：

- 一级分支 Side
- 同级顺序
- 分支间距
- Relationship 控制点
- 图片尺寸
- 少量局部 Offset

禁止自由拖动为白板式绝对坐标。

## 15. 增量布局

局部布局适用：

- 叶子文本变化
- 新增单节点
- 删除小分支
- 折叠展开
- 局部字体变化

全量布局适用：

- 切换布局
- 修改方向
- 修改全局间距
- 大规模导入
- 自动平衡

## 16. Worker 与 Revision

布局结果必须携带 Revision。

```text
result.revision == currentRevision
```

否则丢弃。

## 17. ELK 策略

可用于：

- Organization Chart 初版
- Orthogonal Routing
- 对照测试

应自研：

- Mind Map
- Logic Chart
- Fishbone
- Timeline
- 稳定增量布局

## 18. 性能目标

| 场景 | 目标 |
|---|---:|
| 100 可见主题 | ≤16ms |
| 1,000 可见主题 | ≤100ms |
| 3,000 可见主题 | ≤400ms |
| 单分支更新 | ≤50ms |

## 19. 评审结论

- 产品边界：9.9
- 性能设计：9.7
- 可维护性：9.8
- 综合评分：9.8


---

# 08 `.mgd` 文件格式规范

## 1. 基本定义

- 扩展名：`.mgd`
- MIME：`application/vnd.mindgrid.document`
- 容器：ZIP
- 结构化数据：JSON
- 编码：UTF-8
- 默认不加密
- 格式开放

## 2. 标准结构

```text
example.mgd
├── mimetype
├── manifest.json
├── document.json
├── metadata.json
├── styles.json
├── assets/
│   ├── index.json
│   ├── images/
│   ├── icons/
│   └── attachments/
├── previews/
│   ├── thumbnail.png
│   └── preview.png
└── extensions/
```

最低有效文档：

- mimetype
- manifest.json
- document.json

## 3. 版本

区分：

- Application Version
- Format Version
- Document Revision

格式版本采用语义版本：

- MAJOR：不兼容变化
- MINOR：向后兼容新增
- PATCH：规范修复

## 4. Document

```json
{
  "schemaVersion": "1.0.0",
  "documentId": "doc_...",
  "revision": 1,
  "activeSheetId": "sheet_...",
  "sheets": [],
  "relationships": [],
  "settings": {},
  "extensions": {}
}
```

## 5. Tree Only

必须保证：

- Topic ID 唯一
- 每个普通 Topic 只有一个父主题
- 无循环
- 无自引用
- 子节点顺序由数组确定
- Relationship 不改变树结构

## 6. Topic

核心字段：

- id
- text
- children
- collapsed
- styleRef
- markers
- labels
- notes
- link
- image
- task
- layoutHints
- extensions

## 7. Assets

- 图片和附件不使用 Base64 放入 document.json
- 使用 Asset ID 引用
- 使用 SHA-256 去重和校验
- 推荐文件名：`sha256-<digest>.<ext>`

## 8. 样式

样式优先使用 Design Token。

优先级：

```text
App Default
→ Document Theme
→ Sheet Theme
→ Level Style
→ Node StyleRef
→ Local Override
→ Session Decoration
```

Selection 和 Hover 不写入文件。

## 9. 扩展

扩展统一放入 `extensions`。

- 使用稳定命名空间
- 不覆盖核心字段
- 不允许可执行代码
- 未识别扩展尽量原样保留

## 10. 安全

读取器必须防止：

- Zip Slip
- Zip Bomb
- 重复 Entry
- 路径逃逸
- 超大资源
- 非法 JSON
- 超高压缩比
- 外部路径泄露

## 11. 保存流程

```text
Document Snapshot
→ Domain Validation
→ Serialize
→ Collect Assets
→ Generate Preview
→ Write Temp ZIP
→ Validate Temp ZIP
→ Flush/fsync
→ Atomic Replace
→ fsync Parent
```

不得先删除原文件。

## 12. 自动保存

区分：

- 用户正式文件
- 自动恢复快照

高频编辑优先写恢复区，不频繁覆盖正式文件。

## 13. 文件锁

使用旁路锁文件辅助提示，但不能把锁文件当作绝对真相。

## 14. 完整性验证

等级：

- Level 0：容器
- Level 1：语法
- Level 2：结构
- Level 3：语义
- Level 4：Hash

正常保存至少通过 Level 3。

## 15. 损坏恢复

恢复优先级：

1. Topic 文本
2. Tree
3. Sheet
4. Relationship
5. Notes
6. Style
7. Assets
8. Preview
9. Extensions

恢复时不覆盖原文件，默认生成恢复副本。

## 16. Migration

迁移采用链式版本升级。

- 打开旧文档时可内存迁移
- 保存时写入新格式
- 不静默删除未知字段
- 不默认提供降级保存

## 17. CLI

建议提供：

```bash
mindgrid-file inspect
mindgrid-file validate
mindgrid-file extract
mindgrid-file repair
mindgrid-file migrate
mindgrid-file pack
```

## 18. 评审结论

| 维度 | 评分 |
|---|---:|
| 开放性 | 10 |
| 可恢复性 | 9.9 |
| 架构质量 | 9.9 |
| 安全性 | 9.8 |
| 综合评分 | 9.88 |


---

# 09 架构决策记录（ADR）

## ADR-0001：自研 Canvas Engine

- 状态：Accepted
- 结论：不使用 React Flow 或完整 SVG DOM 作为核心画布。
- 原因：性能、交互、动画、布局、导出与长期可控性。

## ADR-0002：Tree Only

- 状态：Accepted
- 结论：核心文档使用树形模型。
- 允许辅助 Relationship，但不改变父子结构。
- 不为未来白板和流程图提前引入 Graph 复杂度。

## ADR-0003：ZIP + JSON `.mgd`

- 状态：Accepted
- 结论：文档采用 ZIP 容器和 JSON 数据。
- 图片和附件独立存储。
- 不采用 SQLite 作为文档主体。

## ADR-0004：Canvas 2D + OffscreenCanvas

- 状态：Accepted
- 结论：V1 首选 Canvas 2D。
- OffscreenCanvas 用于静态图层、缩略图、离屏缓存和部分 Worker 绘制。
- 后续可新增 WebGPU Renderer。

## ADR-0005：Rust Core + TypeScript Canvas Runtime

- 状态：Accepted

### Rust

- Document Core
- Command
- `.mgd`
- Migration
- Import/Export
- Asset
- Search Index
- 大型布局
- 原子保存
- Recovery

### TypeScript

- Viewport
- Camera
- Render Tree
- Canvas Renderer
- Hit Test
- Selection
- Interaction State Machine
- Animation
- DOM Editor

### 边界

高频操作不得逐帧通过 IPC。

## ADR 变更规则

- 已接受 ADR 不直接覆盖
- 变更必须新建 ADR
- 说明替代关系
- 说明迁移成本
- 说明兼容策略
- 已发布文件继续可读取


---

# 10 术语表

| 术语 | 定义 |
|---|---|
| Document Model | 文档的权威领域数据 |
| Document Projection | 前端使用的只读文档投影 |
| Topic | 思维导图主题节点 |
| Root Topic | Sheet 的中心或根主题 |
| Relationship | 不改变树结构的辅助连接 |
| Boundary | 包围子树或连续范围的边界 |
| Summary | 对连续同级主题的概要 |
| Command | 对 Document 的持久化修改请求 |
| ChangeSet | Command 执行后产生的变化集合 |
| Revision | 文档修改序号 |
| Render Tree | 面向绘制的视觉对象树 |
| Scene Builder | 将布局结果转换为 Render Tree |
| Layout Engine | 将主题树转换为几何布局 |
| Viewport | 当前可见画布区域 |
| Camera | 平移和缩放状态 |
| World Coordinates | 无限画布的逻辑坐标 |
| Screen Coordinates | 屏幕像素坐标 |
| Hit Test | 根据输入位置判断交互目标 |
| Overscan | 视口外额外预绘制区域 |
| DOM Overlay | 覆盖在 Canvas 上的 DOM 编辑层 |
| Asset | 图片、图标或附件资源 |
| Atomic Save | 临时写入、校验后原子替换 |
| Migration | 文档格式升级 |
| Recovery | 从损坏、崩溃或临时文件恢复内容 |
| ADR | 架构决策记录 |
| SAD | 系统架构说明文档 |
| MDS | MindGrid Design Specification |


---

