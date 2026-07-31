import { describe, expect, it } from 'vitest'
import { SpatialIndex, type SpatialItem } from './spatial-index'

interface TestItem extends SpatialItem {
  label: string
}

function makeItem(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  label?: string,
): TestItem {
  return { id, x, y, width, height, label: label ?? id }
}

describe('SpatialIndex', () => {
  it('returns empty results when index is empty', () => {
    const index = new SpatialIndex<TestItem>()
    expect(index.queryPoint(10, 10)).toEqual([])
    expect(index.queryRect(0, 0, 100, 100)).toEqual([])
    expect(index.size).toBe(0)
  })

  it('inserts and retrieves items by point', () => {
    const index = new SpatialIndex<TestItem>()
    index.insert(makeItem('a', 0, 0, 100, 100))
    index.insert(makeItem('b', 200, 200, 50, 50))

    expect(index.queryPoint(50, 50)).toEqual([expect.objectContaining({ id: 'a' })])
    expect(index.queryPoint(225, 225)).toEqual([expect.objectContaining({ id: 'b' })])
    expect(index.queryPoint(150, 150)).toEqual([])
    expect(index.size).toBe(2)
  })

  it('returns items intersecting a rectangle', () => {
    const index = new SpatialIndex<TestItem>()
    index.insert(makeItem('a', 0, 0, 100, 100))
    index.insert(makeItem('b', 200, 200, 50, 50))
    index.insert(makeItem('c', 90, 90, 50, 50))

    const hits = index.queryRect(0, 0, 120, 120)
    const hitIds = hits.map((h) => h.id).sort()
    expect(hitIds).toEqual(['a', 'c'])
  })

  it('handles items spanning multiple grid cells', () => {
    const index = new SpatialIndex<TestItem>(100)
    // Spans cells (0,0) through (1,1)
    index.insert(makeItem('big', 50, 50, 120, 120))

    // Point in cell (1,1) which is part of the item's span
    expect(index.queryPoint(160, 160)).toEqual([expect.objectContaining({ id: 'big' })])
    // Point in a cell the item spans but OUTSIDE the item's AABB (cell 1,0: y=5 < item's y=50)
    expect(index.queryPoint(105, 5)).toEqual([])
    // Point inside the item bounds
    expect(index.queryPoint(100, 100)).toEqual([expect.objectContaining({ id: 'big' })])
  })

  it('removes items by id', () => {
    const index = new SpatialIndex<TestItem>()
    index.insert(makeItem('a', 0, 0, 100, 100))
    index.insert(makeItem('b', 50, 50, 100, 100))

    expect(index.remove('a')).toBe(true)
    expect(index.size).toBe(1)
    expect(index.queryPoint(50, 50)).toEqual([expect.objectContaining({ id: 'b' })])

    expect(index.remove('nonexistent')).toBe(false)
  })

  it('updates an item when inserting with an existing id', () => {
    const index = new SpatialIndex<TestItem>()
    index.insert(makeItem('a', 0, 0, 100, 100, 'old'))
    index.insert(makeItem('a', 500, 500, 50, 50, 'new'))

    expect(index.size).toBe(1)
    expect(index.queryPoint(50, 50)).toEqual([])
    expect(index.queryPoint(525, 525)).toEqual([expect.objectContaining({ id: 'a', label: 'new' })])
  })

  it('rebuilds from scratch', () => {
    const index = new SpatialIndex<TestItem>()
    index.insert(makeItem('old', 0, 0, 10, 10))

    index.rebuild([
      makeItem('a', 0, 0, 100, 100),
      makeItem('b', 200, 200, 50, 50),
      makeItem('c', 400, 400, 10, 10),
    ])

    expect(index.size).toBe(3)
    expect(index.queryPoint(50, 50)).toEqual([expect.objectContaining({ id: 'a' })])
    expect(index.get('old')).toBeUndefined()
  })

  it('handles negative coordinates', () => {
    const index = new SpatialIndex<TestItem>(100)
    index.insert(makeItem('neg', -150, -150, 100, 100))

    expect(index.queryPoint(-100, -100)).toEqual([expect.objectContaining({ id: 'neg' })])
    expect(index.queryRect(-200, -200, 100, 100)).toEqual([expect.objectContaining({ id: 'neg' })])
  })

  it('returns all entries via entries()', () => {
    const index = new SpatialIndex<TestItem>()
    index.insert(makeItem('a', 0, 0, 10, 10))
    index.insert(makeItem('b', 100, 100, 10, 10))

    const all = index.entries()
    expect(all.map((e) => e.id).sort()).toEqual(['a', 'b'])
  })

  it('handles large datasets efficiently', () => {
    const index = new SpatialIndex<TestItem>(100)
    const items: TestItem[] = []
    for (let i = 0; i < 1000; i++) {
      items.push(makeItem(`n${i}`, (i % 100) * 110, Math.floor(i / 100) * 110, 50, 50))
    }
    index.rebuild(items)

    expect(index.size).toBe(1000)
    // Point query should be fast and accurate — n0 is at (0, 0, 50, 50)
    const hits = index.queryPoint(25, 25)
    expect(hits).toHaveLength(1)
    expect(hits[0].id).toBe('n0')

    // Rect query spanning multiple cells
    const rectHits = index.queryRect(0, 0, 300, 300)
    expect(rectHits.length).toBeGreaterThan(1)
  })
})
