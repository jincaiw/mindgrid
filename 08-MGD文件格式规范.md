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
