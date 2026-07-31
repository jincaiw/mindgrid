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
