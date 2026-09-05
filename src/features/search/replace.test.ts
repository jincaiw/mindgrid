import { describe, expect, it } from 'vitest'
import type { TopicSearchEntry } from '../canvas/topic-search'
import {
  countOccurrences,
  planReplaceAll,
  planReplaceOne,
  replaceLiteral,
  summarizePlan,
} from './replace'

function entry(topicId: string, text: string): TopicSearchEntry {
  return { topicId, text, depth: 0, path: [text], sheetId: 's1', sheetTitle: '画布一' }
}

describe('replaceLiteral', () => {
  it('替换全部出现处', () => {
    expect(replaceLiteral('a-b-a', 'a', 'X')).toBe('X-b-X')
  })

  it('查询为空时返回 null（不产生写入）', () => {
    expect(replaceLiteral('abc', '', 'X')).toBeNull()
  })

  it('未命中时返回 null，调用方据此跳过无变化的写入', () => {
    expect(replaceLiteral('abc', 'z', 'X')).toBeNull()
  })

  it('替换为空串等于删除匹配文本', () => {
    expect(replaceLiteral('hello world', 'world', '')).toBe('hello ')
  })

  it('大小写不敏感：与 searchTopics 的检索口径一致', () => {
    // 这是批次 C3 修掉的真 bug：检索能命中 'MindGrid'（查 'mind'），
    // 但旧实现的字面量 split 找不到，替换被静默跳过
    expect(replaceLiteral('MindGrid mind', 'mind', 'X')).toBe('XGrid X')
  })

  it('保留未匹配部分的原始大小写', () => {
    expect(replaceLiteral('Hello HELLO hello', 'hello', 'X')).toBe('X X X')
    expect(replaceLiteral('KeepCase MATCH keepCase', 'MATCH', 'z')).toBe('KeepCase z keepCase')
  })

  it('把查询内容当字面量处理，不做正则解析', () => {
    // 旧实现用 split/join 也是字面量，这里守住不要退化成 new RegExp
    expect(replaceLiteral('a.b.c', '.', 'X')).toBe('aXbXc')
    expect(replaceLiteral('a*b', '*', 'X')).toBe('aXb')
  })

  it('不会因正则元字符抛错', () => {
    expect(() => replaceLiteral('a(b[c', '(', 'X')).not.toThrow()
    expect(replaceLiteral('a(b[c', '(', 'X')).toBe('aXb[c')
  })

  it('相邻重复匹配全部替换', () => {
    expect(replaceLiteral('aaaa', 'aa', 'b')).toBe('bb')
  })
})

describe('countOccurrences', () => {
  it('大小写不敏感计数', () => {
    expect(countOccurrences('Mind mind MIND', 'mind')).toBe(3)
  })

  it('空查询返回 0', () => {
    expect(countOccurrences('abc', '')).toBe(0)
  })

  it('未命中返回 0', () => {
    expect(countOccurrences('abc', 'z')).toBe(0)
  })
})

describe('planReplaceOne', () => {
  it('产出写入条目并带上替换处数', () => {
    expect(planReplaceOne(entry('t1', 'a-b-a'), 'a', 'X')).toEqual({
      topicId: 't1',
      nextText: 'X-b-X',
      replacedCount: 2,
    })
  })

  it('结果为空时返回 null', () => {
    expect(planReplaceOne(null, 'a', 'X')).toBeNull()
    expect(planReplaceOne(undefined, 'a', 'X')).toBeNull()
  })

  it('命中来自祖先路径而非主题自身文本时返回 null', () => {
    // searchTopics 的匹配范围含 path，这类条目替换后文本不变，
    // 不应产生一次无意义的撤销记录
    const fromPath = entry('t2', '子节点')
    fromPath.path = ['MindGrid', '子节点']
    expect(planReplaceOne(fromPath, 'mindgrid', 'X')).toBeNull()
  })
})

describe('planReplaceAll', () => {
  it('按 topicId 去重，同一主题只写入一次', () => {
    const plan = planReplaceAll(
      [entry('t1', 'a-a'), entry('t1', 'a-a'), entry('t2', 'a')],
      'a',
      'X',
    )
    expect(plan.map((item) => item.topicId)).toEqual(['t1', 't2'])
  })

  it('只产出文本真的会变的条目', () => {
    const plan = planReplaceAll(
      [entry('t1', 'a'), entry('t2', 'nothing here'), entry('t3', 'a-a')],
      'a',
      'X',
    )
    expect(plan.map((item) => item.topicId)).toEqual(['t1', 't3'])
  })

  it('空查询返回空计划（避免把每个主题都重写一遍）', () => {
    expect(planReplaceAll([entry('t1', 'a'), entry('t2', 'b')], '', 'X')).toEqual([])
  })

  it('空结果集返回空计划', () => {
    expect(planReplaceAll([], 'a', 'X')).toEqual([])
  })
})

describe('summarizePlan', () => {
  it('汇总主题数与总处数', () => {
    const plan = planReplaceAll([entry('t1', 'a-a'), entry('t2', 'a')], 'a', 'X')
    expect(summarizePlan(plan)).toEqual({ topicCount: 2, occurrenceCount: 3 })
  })

  it('空计划汇总为 0', () => {
    expect(summarizePlan([])).toEqual({ topicCount: 0, occurrenceCount: 0 })
  })
})
