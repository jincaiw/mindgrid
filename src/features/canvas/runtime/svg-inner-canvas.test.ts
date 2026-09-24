import { describe, expect, it, vi } from 'vitest'
import { drawSvgInner, parseSvgInner, tokenizePath } from './svg-inner-canvas'

/** 创建记录调用序列的模拟 Canvas 2D 上下文。 */
function createCtx() {
  const calls: { method: string; args: unknown[] }[] = []
  const ctx = {
    beginPath: vi.fn(() => calls.push({ method: 'beginPath', args: [] })),
    closePath: vi.fn(() => calls.push({ method: 'closePath', args: [] })),
    moveTo: vi.fn((...a: unknown[]) => calls.push({ method: 'moveTo', args: a })),
    lineTo: vi.fn((...a: unknown[]) => calls.push({ method: 'lineTo', args: a })),
    arc: vi.fn((...a: unknown[]) => calls.push({ method: 'arc', args: a })),
    ellipse: vi.fn((...a: unknown[]) => calls.push({ method: 'ellipse', args: a })),
    bezierCurveTo: vi.fn((...a: unknown[]) => calls.push({ method: 'bezierCurveTo', args: a })),
    quadraticCurveTo: vi.fn((...a: unknown[]) =>
      calls.push({ method: 'quadraticCurveTo', args: a }),
    ),
    fill: vi.fn(() => calls.push({ method: 'fill', args: [] })),
    stroke: vi.fn(() => calls.push({ method: 'stroke', args: [] })),
    fillText: vi.fn((...a: unknown[]) => calls.push({ method: 'fillText', args: a })),
    save: vi.fn(),
    restore: vi.fn(),
    set fillStyle(v: unknown) {
      calls.push({ method: 'fillStyle', args: [v] })
    },
    get fillStyle() {
      return ''
    },
    set strokeStyle(v: unknown) {
      calls.push({ method: 'strokeStyle', args: [v] })
    },
    get strokeStyle() {
      return ''
    },
    set lineWidth(v: unknown) {
      calls.push({ method: 'lineWidth', args: [v] })
    },
    get lineWidth() {
      return 1
    },
    set lineCap(v: unknown) {
      calls.push({ method: 'lineCap', args: [v] })
    },
    get lineCap() {
      return 'butt'
    },
    set lineJoin(v: unknown) {
      calls.push({ method: 'lineJoin', args: [v] })
    },
    get lineJoin() {
      return 'miter'
    },
    set globalAlpha(v: unknown) {
      calls.push({ method: 'globalAlpha', args: [v] })
    },
    get globalAlpha() {
      return 1
    },
    set font(v: unknown) {
      calls.push({ method: 'font', args: [v] })
    },
    get font() {
      return ''
    },
    set textAlign(v: unknown) {
      calls.push({ method: 'textAlign', args: [v] })
    },
    get textAlign() {
      return 'left'
    },
    set textBaseline(v: unknown) {
      calls.push({ method: 'textBaseline', args: [v] })
    },
    get textBaseline() {
      return 'alphabetic'
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

describe('tokenizePath', () => {
  it('parses packed numbers without separators', () => {
    // "4.1.6-3" 应被切分为 4.1 / 0.6 / -3
    const cmds = tokenizePath('M7 1l1.8 3.7 4.1.6-3 2.9z')
    expect(cmds[0]).toEqual({ op: 'M', args: [7, 1] })
    expect(cmds[1].op).toBe('l')
    expect(cmds[1].args).toEqual([1.8, 3.7, 4.1, 0.6, -3, 2.9])
    expect(cmds[2]).toEqual({ op: 'z', args: [] })
  })

  it('parses horizontal/vertical shorthands and multiple subpaths', () => {
    const cmds = tokenizePath('M4 6h6M4 8h6')
    expect(cmds.map((c) => c.op)).toEqual(['M', 'h', 'M', 'h'])
    expect(cmds[1].args).toEqual([6])
  })

  it('parses arc command with all seven parameters', () => {
    const cmds = tokenizePath('M 7.00 1.00 A 6 6 0 1 1 4.51 2.46')
    expect(cmds[1].op).toBe('A')
    expect(cmds[1].args).toEqual([6, 6, 0, 1, 1, 4.51, 2.46])
  })

  /**
   * 弧线的两个 flag 在 SVG 里是**单字符** `0`/`1`，且与前后的数字之间允许没有分隔符：
   * `a3.5 3.5 0 017 0` 就是 `0 0 1 7 0`（大弧 0 / 扫掠 1 / 终点 7,0）。
   *
   * 这条是回归：任何"按数字整体切分"的分词器会把 `017` 读成数字 `17`，
   * 于是这条弧只剩 5 个参数、不足 7 个，`buildPath` 整个跳过 ——
   * **弧线被静默丢掉**。实测后果：`people` 标记的身体、回形针的弯钩在 PNG 里缺一块，
   * SVG 导出与屏幕却完全正常。
   */
  it('parses compact arc flags (flag 紧跟数字，中间没有分隔符)', () => {
    const compact = tokenizePath('M1.5 11.5a3.5 3.5 0 017 0z')
    expect(compact[1].op).toBe('a')
    expect(compact[1].args).toEqual([3.5, 3.5, 0, 0, 1, 7, 0])

    // 变体：`00-5-5` = 0,0,-5,-5（两个 flag 粘在一起，后面紧跟负数）
    const negative = tokenizePath('M9.5 4.5a3.5 3.5 0 00-5-5')
    expect(negative[1].args).toEqual([3.5, 3.5, 0, 0, 0, -5, -5])

    // `007 7` = 0,0,7,7
    const packed = tokenizePath('M7 1.5a5 5 0 007 7')
    expect(packed[1].args).toEqual([5, 5, 0, 0, 0, 7, 7])
  })

  it('allows arc arguments to repeat without a new command letter', () => {
    // 两段弧写成一条命令：flag 的单字符语义必须一直保持
    const cmds = tokenizePath('a2 2 0 0110 10 2 2 0 0110 10')
    expect(cmds).toHaveLength(1)
    expect(cmds[0].args).toEqual([2, 2, 0, 0, 1, 10, 10, 2, 2, 0, 0, 1, 10, 10])
  })

  it('returns empty array for empty or garbage input', () => {
    expect(tokenizePath('')).toEqual([])
    expect(tokenizePath('   ')).toEqual([])
  })
})

describe('parseSvgInner', () => {
  it('parses circle with paint attributes', () => {
    const elements = parseSvgInner('<circle cx="7" cy="7" r="6" fill="#f6be00"/>')
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({ kind: 'circle', cx: 7, cy: 7, r: 6, fill: '#f6be00' })
  })

  it('parses path with stroke and fill-opacity', () => {
    const elements = parseSvgInner(
      '<path d="M3.5 1.5v11" fill="none" stroke="#e5484d" stroke-width="1.4" stroke-linecap="round" fill-opacity="0.18"/>',
    )
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({
      kind: 'path',
      d: 'M3.5 1.5v11',
      fill: null, // fill="none" → 不填充
      stroke: '#e5484d',
      strokeWidth: 1.4,
      lineCap: 'round',
      fillOpacity: 0.18,
    })
  })

  it('parses text with anchor and baseline', () => {
    const elements = parseSvgInner(
      '<text x="7" y="7" font-size="8" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">?</text>',
    )
    expect(elements[0]).toMatchObject({
      kind: 'text',
      x: 7,
      y: 7,
      content: '?',
      fontSize: 8,
      fontWeight: 700,
      fill: '#fff',
      textAnchor: 'center',
      textBaseline: 'middle',
    })
  })

  it('skips unsupported elements instead of throwing', () => {
    const elements = parseSvgInner('<rect x="0" y="0" width="4" height="4"/><circle cx="1" cy="1" r="1"/>')
    expect(elements).toHaveLength(1)
    expect(elements[0].kind).toBe('circle')
  })

  it('returns empty array for malformed markup', () => {
    // DOMParser 对非法片段会产出 parsererror 文档，本模块按「无图标」降级
    expect(parseSvgInner('<circle cx="7"')).toEqual([])
  })
})

describe('drawSvgInner', () => {
  it('draws a filled circle at the given origin', () => {
    const { ctx, calls } = createCtx()
    drawSvgInner(ctx, '<circle cx="7" cy="7" r="6" fill="#f6be00"/>', 100, 200)

    const arcCall = calls.find((c) => c.method === 'arc')
    expect(arcCall).toBeDefined()
    // 原点 (100,200) + 圆心 (7,7) × scale 1
    expect(arcCall!.args[0]).toBe(107)
    expect(arcCall!.args[1]).toBe(207)
    expect(arcCall!.args[2]).toBe(6)
    expect(calls.some((c) => c.method === 'fillStyle' && c.args[0] === '#f6be00')).toBe(true)
    expect(calls.some((c) => c.method === 'fill')).toBe(true)
    // 无 stroke 属性 → 不描边
    expect(calls.some((c) => c.method === 'stroke')).toBe(false)
  })

  it('scales geometry with the requested size', () => {
    const { ctx, calls } = createCtx()
    drawSvgInner(ctx, '<circle cx="7" cy="7" r="6" fill="#000"/>', 0, 0, 28)

    const arcCall = calls.find((c) => c.method === 'arc')!
    // size 28 → scale 2
    expect(arcCall.args[0]).toBe(14)
    expect(arcCall.args[1]).toBe(14)
    expect(arcCall.args[2]).toBe(12)
  })

  it('draws stroked path with implicit repeated lineto pairs', () => {
    const { ctx, calls } = createCtx()
    drawSvgInner(ctx, '<path d="M7 1l2 2 3 3" fill="none" stroke="#fff" stroke-width="1.2"/>', 10, 20)

    const moves = calls.filter((c) => c.method === 'moveTo')
    const lines = calls.filter((c) => c.method === 'lineTo')
    expect(moves).toHaveLength(1)
    expect(moves[0].args).toEqual([17, 21]) // 10+7, 20+1
    // 隐式重复：两组 lineto
    expect(lines).toHaveLength(2)
    expect(lines[0].args).toEqual([19, 23]) // +2,+2
    expect(lines[1].args).toEqual([22, 26]) // 再 +3,+3
    expect(calls.some((c) => c.method === 'stroke')).toBe(true)
  })

  /**
   * 紧凑 flag 写法必须真的画出弧线（回归：旧实现整段跳过）。
   *
   * `people` 标记的身体就是这种写法；少了这条，PNG 里那一块是空的而没有任何报错。
   */
  it('actually rasterizes an arc written with compact flags', () => {
    const { ctx, calls } = createCtx()
    drawSvgInner(ctx, '<path d="M1.5 11.5a3.5 3.5 0 017 0z" fill="#5b8cff"/>', 0, 0)

    const arcCalls = calls.filter((c) => c.method === 'arc')
    expect(arcCalls, '紧凑 flag 的弧线整段被丢掉了').toHaveLength(1)
    // 起点 (1.5,11.5) → 终点 (8.5,11.5)，半径 3.5 → 圆心 (5,11.5)
    expect(arcCalls[0].args[0]).toBeCloseTo(5, 6)
    expect(arcCalls[0].args[1]).toBeCloseTo(11.5, 6)
    expect(arcCalls[0].args[2]).toBeCloseTo(3.5, 6)
  })

  it('applies fill-opacity through globalAlpha and restores it', () => {
    const { ctx, calls } = createCtx()
    drawSvgInner(ctx, '<path d="M3.5 2.5h7z" fill="#e5484d" fill-opacity="0.18"/>', 0, 0)

    const alphas = calls.filter((c) => c.method === 'globalAlpha').map((c) => c.args[0])
    expect(alphas).toContain(0.18)
    // 绘制结束后恢复为 1
    expect(alphas[alphas.length - 1]).toBe(1)
  })

  it('draws centered text and restores text state', () => {
    const { ctx, calls } = createCtx()
    drawSvgInner(
      ctx,
      '<text x="7" y="7" font-size="8" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">?</text>',
      5,
      5,
    )

    const textCall = calls.find((c) => c.method === 'fillText')!
    expect(textCall.args[0]).toBe('?')
    expect(textCall.args[1]).toBe(12) // 5 + 7
    expect(textCall.args[2]).toBe(12)
    expect(calls.some((c) => c.method === 'textAlign' && c.args[0] === 'center')).toBe(true)
    expect(calls.some((c) => c.method === 'textBaseline' && c.args[0] === 'middle')).toBe(true)
    // 绘制结束后复原，避免污染调用方后续绘制
    const aligns = calls.filter((c) => c.method === 'textAlign').map((c) => c.args[0])
    expect(aligns[aligns.length - 1]).toBe('left')
  })

  it('converts arcs to ctx.arc with correct center and sweep direction', () => {
    const { ctx, calls } = createCtx()
    // 半径 6 的 3/4 圆弧（large-arc=1, sweep=1）
    drawSvgInner(
      ctx,
      '<path d="M 1 7 A 6 6 0 1 1 7 13" fill="none" stroke="#5b8cff" stroke-width="2"/>',
      0,
      0,
    )

    const arcCall = calls.find((c) => c.method === 'arc')!
    expect(arcCall).toBeDefined()
    // 圆心必为 (7,7)：两端点 (1,7) 与 (7,13) 到圆心距离都为 6
    expect(arcCall.args[0]).toBeCloseTo(7, 5)
    expect(arcCall.args[1]).toBeCloseTo(7, 5)
    expect(arcCall.args[2]).toBeCloseTo(6, 5)
    // sweep=1 → 顺时针 → 终止角增量为正
    const [startAngle, endAngle] = [arcCall.args[3] as number, arcCall.args[4] as number]
    expect(endAngle - startAngle).toBeGreaterThan(0)
  })

  it('is a no-op for empty or unsupported input', () => {
    const { ctx, calls } = createCtx()
    drawSvgInner(ctx, '', 0, 0)
    drawSvgInner(ctx, '<rect x="0" y="0" width="1" height="1"/>', 0, 0)

    expect(calls).toHaveLength(0)
  })
})
