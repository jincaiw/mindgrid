import { describe, expect, it, vi } from 'vitest'
import { runPrint } from './print-controller'

const BYTES = new Uint8Array([1, 2, 3])

function makeContext(overrides: Partial<Parameters<typeof runPrint>[0]> = {}) {
  const showSheet = vi.fn()
  const printNative = vi.fn(async () => undefined)
  const notify = vi.fn()
  return {
    context: {
      renderImage: vi.fn(async () => BYTES),
      showSheet,
      printNative,
      title: '产品规划',
      notify,
      ...overrides,
    },
    showSheet,
    printNative,
    notify,
  }
}

describe('runPrint', () => {
  it('先把位图放进打印页，再打开打印面板', () => {
    // 顺序就是全部：反过来做（先开面板）会打出一张白纸，而且**不报错**，
    // 只能靠人眼发现。所以这里断言的是调用先后而不是"都调过了"。
    const order: string[] = []
    const { context } = makeContext({
      showSheet: () => order.push('showSheet'),
      printNative: async () => {
        order.push('printNative')
      },
    })

    return runPrint(context).then((printed) => {
      expect(printed).toBe(true)
      expect(order).toEqual(['showSheet', 'printNative'])
    })
  })

  it('把文档名一起交给打印页（纸张页眉）', async () => {
    const { context, showSheet } = makeContext()

    await runPrint(context)

    expect(showSheet).toHaveBeenCalledWith(BYTES, '产品规划')
  })

  it('没有可打印内容时不打开面板，改为提示', async () => {
    const { context, printNative, notify, showSheet } = makeContext({
      renderImage: vi.fn(async () => null),
    })

    const printed = await runPrint(context)

    expect(printed).toBe(false)
    expect(showSheet).not.toHaveBeenCalled()
    expect(printNative).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('当前没有可打印的内容')
  })

  it('空字节数组也算没有内容（空图不该走出一条白纸路径）', async () => {
    const { context, printNative, notify } = makeContext({
      renderImage: vi.fn(async () => new Uint8Array(0)),
    })

    await runPrint(context)

    expect(printNative).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('当前没有可打印的内容')
  })

  it('渲染失败时给出去导出的替代路径，不把异常抛给调用方', async () => {
    const { context, printNative, notify } = makeContext({
      renderImage: vi.fn(async () => {
        throw new Error('boom')
      }),
    })

    const printed = await runPrint(context)

    expect(printed).toBe(false)
    expect(printNative).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('打印内容生成失败，请改用「文件 → 导出 PDF」')
  })

  it('原样转达 Rust 侧给出失败原因（不要把 Err(String) 吞成一句套话）', async () => {
    const { context, notify } = makeContext({
      printNative: vi.fn(async () => {
        throw '无法打开打印面板：printer offline'
      }),
    })

    await runPrint(context)

    expect(notify).toHaveBeenCalledWith('无法打开打印面板：printer offline')
  })

  it('面板打开失败但异常不是字符串时，回落到通用文案', async () => {
    const { context, notify } = makeContext({
      printNative: vi.fn(async () => {
        throw { weird: true }
      }),
    })

    await runPrint(context)

    expect(notify).toHaveBeenCalledWith('无法打开打印面板')
  })
})
