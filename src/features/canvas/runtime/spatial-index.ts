/**
 * 网格化空间哈希索引：用于 O(1) 平均时间的点/矩形查询，替代全量线性扫描。
 *
 * 将世界空间划分为 cellSize × cellSize 的网格，每个条目按其包围盒覆盖的所有网格单元格注册。
 * 查询时只需检查覆盖区域内的单元格，大幅减少 10k 节点规模下的命中测试开销。
 */

/** 具有世界坐标包围盒的条目。 */
export interface SpatialItem {
  id: string
  x: number
  y: number
  width: number
  height: number
}

interface IndexedEntry<T> {
  item: T
  /** 缓存条目覆盖的网格坐标范围，避免删除时重复计算。 */
  minCol: number
  maxCol: number
  minRow: number
  maxRow: number
}

const DEFAULT_CELL_SIZE = 256

/**
 * 网格空间哈希。对动态场景可整体 rebuild；静态场景一次构建后多次查询。
 */
export class SpatialIndex<T extends SpatialItem> {
  private readonly cellSize: number
  private readonly grid: Map<string, IndexedEntry<T>[]> = new Map()
  private readonly entryMap: Map<string, IndexedEntry<T>> = new Map()
  private _size = 0

  constructor(cellSize: number = DEFAULT_CELL_SIZE) {
    if (cellSize <= 0) {
      throw new Error('cellSize must be positive')
    }
    this.cellSize = cellSize
  }

  get size(): number {
    return this._size
  }

  /** 清空索引。 */
  clear(): void {
    this.grid.clear()
    this.entryMap.clear()
    this._size = 0
  }

  /** 从条目集合重建整个索引。 */
  rebuild(items: Iterable<T>): void {
    this.clear()
    for (const item of items) {
      this.insert(item)
    }
  }

  /** 插入一个条目。若 id 已存在则先移除旧条目。 */
  insert(item: T): void {
    const existing = this.entryMap.get(item.id)
    if (existing) {
      this.removeFromGrid(existing)
    }

    const entry: IndexedEntry<T> = {
      item,
      minCol: Math.floor(item.x / this.cellSize),
      maxCol: Math.floor((item.x + item.width) / this.cellSize),
      minRow: Math.floor(item.y / this.cellSize),
      maxRow: Math.floor((item.y + item.height) / this.cellSize),
    }

    for (let col = entry.minCol; col <= entry.maxCol; col++) {
      for (let row = entry.minRow; row <= entry.maxRow; row++) {
        const key = this.cellKey(col, row)
        let bucket = this.grid.get(key)
        if (!bucket) {
          bucket = []
          this.grid.set(key, bucket)
        }
        bucket.push(entry)
      }
    }

    const isUpdate = this.entryMap.has(item.id)
    this.entryMap.set(item.id, entry)
    if (!isUpdate) {
      this._size++
    }
  }

  /** 按 id 移除条目。 */
  remove(id: string): boolean {
    const entry = this.entryMap.get(id)
    if (!entry) {
      return false
    }
    this.removeFromGrid(entry)
    this.entryMap.delete(id)
    this._size--
    return true
  }

  /** 按 id 获取条目。 */
  get(id: string): T | undefined {
    return this.entryMap.get(id)?.item
  }

  /**
   * 点查询：返回包含指定世界坐标点的所有条目。
   * 返回条目按插入顺序，调用方需自行处理 z-order。
   */
  queryPoint(x: number, y: number): T[] {
    const col = Math.floor(x / this.cellSize)
    const row = Math.floor(y / this.cellSize)
    const bucket = this.grid.get(this.cellKey(col, row))
    if (!bucket) {
      return []
    }

    const results: T[] = []
    const seen = new Set<string>()
    for (const entry of bucket) {
      if (seen.has(entry.item.id)) {
        continue
      }
      const { item } = entry
      if (
        x >= item.x &&
        x <= item.x + item.width &&
        y >= item.y &&
        y <= item.y + item.height
      ) {
        seen.add(item.id)
        results.push(item)
      }
    }
    return results
  }

  /**
   * 矩形查询：返回与指定世界矩形相交的所有条目。
   * 用于框选和视口剔除。
   */
  queryRect(
    rectX: number,
    rectY: number,
    rectWidth: number,
    rectHeight: number,
  ): T[] {
    const minCol = Math.floor(rectX / this.cellSize)
    const maxCol = Math.floor((rectX + rectWidth) / this.cellSize)
    const minRow = Math.floor(rectY / this.cellSize)
    const maxRow = Math.floor((rectY + rectHeight) / this.cellSize)

    const results: T[] = []
    const seen = new Set<string>()

    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const bucket = this.grid.get(this.cellKey(col, row))
        if (!bucket) {
          continue
        }
        for (const entry of bucket) {
          if (seen.has(entry.item.id)) {
            continue
          }
          const { item } = entry
          // AABB 相交测试
          if (
            item.x < rectX + rectWidth &&
            item.x + item.width > rectX &&
            item.y < rectY + rectHeight &&
            item.y + item.height > rectY
          ) {
            seen.add(item.id)
            results.push(item)
          }
        }
      }
    }
    return results
  }

  /** 返回所有条目（不保证顺序）。 */
  entries(): T[] {
    return Array.from(this.entryMap.values(), (e) => e.item)
  }

  // ---- 内部 ----

  private cellKey(col: number, row: number): string {
    return `${col},${row}`
  }

  private removeFromGrid(entry: IndexedEntry<T>): void {
    for (let col = entry.minCol; col <= entry.maxCol; col++) {
      for (let row = entry.minRow; row <= entry.maxRow; row++) {
        const key = this.cellKey(col, row)
        const bucket = this.grid.get(key)
        if (!bucket) {
          continue
        }
        const index = bucket.indexOf(entry)
        if (index >= 0) {
          bucket.splice(index, 1)
        }
        if (bucket.length === 0) {
          this.grid.delete(key)
        }
      }
    }
  }
}
