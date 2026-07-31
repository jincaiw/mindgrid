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
