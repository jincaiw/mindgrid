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
