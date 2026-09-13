/**
 * 打印页状态的持有者：负责 object URL 的建立与释放。
 *
 * 单独成文件而不是和 PrintSheet 放一起：组件文件里混导出 hook 会触发
 * `react(only-export-components)`（Fast refresh 需要文件只导出组件），
 * 那会让 oxlint 基线从 16 条涨到 17 条——基线是不变式，多出来的必定是自己引入的。
 *
 * 不释放旧 URL 会**整幅位图一直占着内存**（大图好几 MB），且每次打印都再泄漏一份。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PrintSheetState } from './print-sheet'

export function usePrintSheet() {
  const [sheet, setSheet] = useState<PrintSheetState | null>(null)
  const urlRef = useRef<string | null>(null)

  const show = useCallback((bytes: Uint8Array, title: string) => {
    // renderSceneToPngBytes 交回来的是普通 ArrayBuffer 支撑的 Uint8Array；
    // 签名上的 `Uint8Array<ArrayBufferLike>` 只是 TS 不知道 backing store 具体是什么。
    // 这里不做转移、不长期持有该视图，故按实际类型断言一次即可（无需再复制一份几 MB）。
    const url = URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
    )
    const previousUrl = urlRef.current
    urlRef.current = url
    setSheet({ url, title })

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl)
    }
  }, [])

  useEffect(
    () => () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    },
    [],
  )

  return { printSheet: sheet, showPrintSheet: show }
}
