/**
 * 「插入 → 语音备注」的真引擎取证。
 *
 * ## 为什么必须有这一条
 *
 * 录音链路的核心（`MediaRecorder` / `getUserMedia` / `<audio>`）**jsdom 里一样都没有**：
 * jsdom 没有音频实现，`play()` 也不会真的播。单测只能钉住"图标该不该渲染"这类纯逻辑，
 * 剩下的必须真引擎。而这里的难点是"沙箱里没有麦克风"——用 Chromium 的
 * **假设备**解决：
 *
 *   --use-fake-device-for-media-stream  造一个假麦克风（持续产生音频）
 *   --use-fake-ui-for-media-stream      自动通过权限提示（否则脚本会被弹窗卡住）
 *   --autoplay-policy=no-user-gesture-required  允许脚本触发的播放
 *
 * ## 验什么
 *
 * 1. 不支持时的**降级**：把 `MediaRecorder` 抹掉后，面板必须给出**明确说明**，
 *    而不是留一个点了没反应的按钮（这是"先补能力检测与降级提示"那条要求的落地）。
 * 2. 录制 → 落库：录 2 秒 → 停止 → 文档里出现 `voiceNote`（含 mimeType 与真实时长）。
 * 3. 节点指示器：该主题上出现话筒按钮，提示里带时长。
 * 4. 播放：点指示器后 `<audio>` 拿到 `data:audio/...` 且真的在播（`paused === false`）。
 * 5. 事件不冒泡：点指示器不会把主题变成"选中"（否则用户每点一次播放就改选中集）。
 *
 * 用法：node dev/capture-voice-note.mjs [baseUrl] [outDir]
 * 前置：vite dev 已在 baseUrl 上监听（**必须 --host 127.0.0.1**）
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421').replace(/\/$/, '')
const outDir = process.argv[3] ?? 'outputs/native/v0.4.19'

const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const results = []
function check(label, condition, detail) {
  results.push({ label, pass: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? '  —— ' + detail : ''}`)
}

/** 读浏览器降级链路里的文档（录音落在 topic.voiceNote 上）。 */
const READ_VOICE_NOTE = `(() => {
  const raw = window.localStorage.getItem('mindgrid:recovery:v1')
  if (!raw) return { error: 'no recovery snapshot' }
  const doc = JSON.parse(raw).document
  const sheet = doc.sheets.find((s) => s.id === doc.activeSheetId) ?? doc.sheets[0]
  const walk = (topic, out) => {
    if (topic.voiceNote) out.push({ id: topic.id, text: topic.text, voiceNote: topic.voiceNote })
    for (const child of topic.children ?? []) walk(child, out)
    return out
  }
  return { found: walk(sheet.rootTopic, []) }
})()`

/** 面板上的语音备注小节状态。 */
const READ_PANEL = `(() => {
  const section = [...document.querySelectorAll('.panel__section')].find(
    (el) => (el.querySelector('.panel__section-label')?.textContent ?? '').trim() === '语音备注',
  )
  const root = section ?? document
  return {
    sectionFound: Boolean(section),
    text: root.textContent ?? '',
    hasRecordButton: Boolean(root.querySelector('button[aria-label="开始录音"]')),
    hasStopButton: Boolean(root.querySelector('button[aria-label="停止并保存录音"]')),
    hasPlayButton: Boolean(root.querySelector('button[aria-label="播放语音备注"]')),
    errorText: root.querySelector('[role="alert"]')?.textContent ?? '',
  }
})()`

/** 画布上该主题的话筒图标状态。 */
const READ_INDICATOR = (topicText) => `(() => {
  const nodes = [...document.querySelectorAll('.mindmap-node')]
  const node = nodes.find((el) => (el.querySelector('.mindmap-node__title')?.textContent ?? '').includes(${JSON.stringify(topicText)}))
  if (!node) return { error: 'node not found' }
  const indicator = node.querySelector('.mindmap-node__voice-indicator')
  return {
    found: Boolean(indicator),
    title: indicator?.getAttribute('title') ?? '',
    ariaLabel: indicator?.getAttribute('aria-label') ?? '',
    playing: indicator?.className.includes('--playing') ?? false,
    nodeSelected: node.className.includes('mindmap-node--selected'),
  }
})()`

async function main() {
  await mkdir(outDir, { recursive: true })

  // ---------- 场景 1：不支持录音时必须明说，而不是留个死按钮 ----------
  {
    const browser = await chromium.launch({ executablePath })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    // 在页面脚本跑起来之前把 MediaRecorder 抹掉，模拟"这个运行时不支持录音"
    await page.addInitScript(() => {
      // @ts-expect-error 故意删除
      delete window.MediaRecorder
    })
    await page.goto(baseUrl, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    await page.locator('.mindmap-node--depth-1').first().click()
    await page.waitForTimeout(300)
    // 语音备注小节在「样式」子页（默认停在「画布」）—— 必须按 id 定位，
    // 按文字匹配会点到工具栏里同名的按钮（这个坑本项目踩过）
    await page.locator('#inspector-tab-style').click()
    await page.waitForTimeout(400)
    const panel = await page.evaluate(READ_PANEL)
    await page.screenshot({ path: path.join(outDir, '01-unsupported-degradation.png') })
    check(
      '场景1：不支持录音时给出明确说明（不是死按钮）',
      panel.text.includes('不支持录音') && !panel.hasRecordButton,
      `面板文案含"不支持录音"=${panel.text.includes('不支持录音')}，有录音按钮=${panel.hasRecordButton}`,
    )
    await browser.close()
  }

  // ---------- 场景 2：假麦克风跑通完整链路 ----------
  const browser = await chromium.launch({
    executablePath,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForTimeout(1500)

  // 选中一个非根主题（音符要挂在它上面）
  const topicText = await page.evaluate(
    `(() => {
       const node = document.querySelector('.mindmap-node--depth-1')
       return node ? (node.querySelector('.mindmap-node__title')?.textContent ?? '').trim() : ''
     })()`,
  )
  check('有一个一级分支可供挂录音', topicText.length > 0, topicText)
  await page.locator('.mindmap-node--depth-1').first().click()
  await page.waitForTimeout(300)
  await page.locator('#inspector-tab-style').click()
  await page.waitForTimeout(400)

  const beforePanel = await page.evaluate(READ_PANEL)
  check(
    '面板出现「语音备注」小节，且能力检测通过（给出的是录音按钮）',
    beforePanel.sectionFound && beforePanel.hasRecordButton,
    `小节存在=${beforePanel.sectionFound}，录音按钮=${beforePanel.hasRecordButton}`,
  )

  // —— 录制 2.2 秒 ——
  await page.locator('button[aria-label="开始录音"]').click()
  await page.waitForTimeout(600)
  const recordingPanel = await page.evaluate(READ_PANEL)
  check('录音中：出现"停止并保存"与计时', recordingPanel.hasStopButton, recordingPanel.text.slice(0, 80))
  await page.screenshot({ path: path.join(outDir, '02-recording.png') })
  await page.waitForTimeout(1600)
  await page.locator('button[aria-label="停止并保存录音"]').click()
  await page.waitForTimeout(900)

  const stored = await page.evaluate(READ_VOICE_NOTE)
  const storedEntry = stored.found?.[0]
  check(
    '录音落进文档：voiceNote 带 assetId / MIME / 真实时长',
    Boolean(storedEntry) &&
      typeof storedEntry.voiceNote.assetId === 'string' &&
      storedEntry.voiceNote.assetId.length > 0 &&
      String(storedEntry.voiceNote.mimeType).startsWith('audio/') &&
      storedEntry.voiceNote.durationMs >= 1500 &&
      storedEntry.voiceNote.durationMs <= 6000,
    JSON.stringify(storedEntry?.voiceNote ?? stored),
  )
  check(
    'MIME 是真实录到的格式（不是我们请求值的臆测）',
    /^audio\//.test(String(storedEntry?.voiceNote?.mimeType ?? '')),
    String(storedEntry?.voiceNote?.mimeType ?? '(空)'),
  )

  const panelAfter = await page.evaluate(READ_PANEL)
  check(
    '面板显示时长，并给出播放/移除入口',
    panelAfter.hasPlayButton && /\d:\d\d/.test(panelAfter.text),
    panelAfter.text.replace(/\s+/g, ' ').slice(0, 100),
  )

  const indicator = await page.evaluate(READ_INDICATOR(topicText))
  check(
    '节点上出现话筒图标，提示里带时长',
    indicator.found && /语音备注/.test(indicator.title),
    `title=${indicator.title}`,
  )

  // 断言：落库的字节必须是**完整的 WebM**（以 EBML 魔数 1A 45 DF A3 开头）。
  //
  // 这一条直接钉住本轮真引擎跑出来的那个缺陷：`cancel()` 在 `onstop` 之前清掉了已收集的
  // 分片 → 存下来的只有最后一个 250ms 分片、**没有文件头**。它表现成
  // "录音能存、时长也对、图标也在，就是点播放报 DEMUXER_ERROR_COULD_NOT_OPEN" ——
  // 只看字节数、时长或 DOM 结构**完全看不出来**。
  await page.locator('button[aria-label="播放语音备注"]').click()
  await page.waitForTimeout(600)
  const storedHead = await page.evaluate(
    `(() => {
       const audio = document.querySelector('.panel__voice-note-audio')
       const src = audio?.src ?? ''
       const comma = src.indexOf(',')
       const head = src.slice(comma + 1, comma + 1 + 16)
       let bytes = []
       try { bytes = Array.from(atob(head)).map((c) => c.charCodeAt(0)) } catch {}
       return { srcPrefix: src.slice(0, 28), bytes }
     })()`,
  )
  await page.evaluate(`document.querySelector('.panel__voice-note-audio')?.pause()`)
  check(
    '落库字节是完整 WebM（EBML 魔数 1A 45 DF A3）',
    storedHead.bytes.slice(0, 4).join(',') === '26,69,223,163',
    `${storedHead.srcPrefix} / 头四字节 ${JSON.stringify(storedHead.bytes.slice(0, 4))}`,
  )

  // 播放前先把选中态**挪走**（下面的断言是"点图标不该改变选中"，主题本来就选中时
  // 那条断言恒真、没有鉴别力）。挪到根主题上。
  await page.locator('.mindmap-node--depth-0').click()
  await page.waitForTimeout(300)
  const selectedBefore = await page.evaluate(READ_INDICATOR(topicText))
  check('播放前该主题是未选中态（让下面的断言有鉴别力）', !selectedBefore.nodeSelected)

  // —— 播放：点节点上的图标 ——
  await page.evaluate(
    `(() => {
       const node = [...document.querySelectorAll('.mindmap-node')].find((el) =>
         (el.querySelector('.mindmap-node__title')?.textContent ?? '').includes(${JSON.stringify(topicText)}))
       node?.querySelector('.mindmap-node__voice-indicator')?.click()
     })()`,
  )
  await page.waitForTimeout(900)
  const playback = await page.evaluate(
    `(() => {
       const audio = document.querySelector('.canvas-voice-audio')
       return {
         srcPrefix: (audio?.currentSrc || audio?.src || '').slice(0, 24),
         paused: audio?.paused ?? null,
         currentTime: audio?.currentTime ?? null,
         readyState: audio?.readyState ?? null,
       }
     })()`,
  )
  await page.screenshot({ path: path.join(outDir, '03-playing.png') })
  const playErrors = await page.evaluate(`window.__playErrors ?? []`)
  console.log('    [诊断] play() 拒绝原因:', JSON.stringify(playErrors))
  const audioDiag = await page.evaluate(
    `(() => { const a = document.querySelector('.canvas-voice-audio'); return { error: a?.error ? a.error.code + '/' + a.error.message : null, networkState: a?.networkState, readyState: a?.readyState } })()`,
  )
  console.log('    [诊断] audio:', JSON.stringify(audioDiag))
  check(
    '点节点图标即播放：audio 拿到 data:audio，且真的在播',
    String(playback.srcPrefix).startsWith('data:audio') && playback.paused === false,
    JSON.stringify(playback),
  )

  const indicatorPlaying = await page.evaluate(READ_INDICATOR(topicText))
  check(
    '播放中图标进入"播放中"态，且**没有**把主题变成选中（stopPropagation 生效）',
    indicatorPlaying.playing && !indicatorPlaying.nodeSelected,
    `playing=${indicatorPlaying.playing}，点击后 selected=${indicatorPlaying.nodeSelected}（点击前为 false）`,
  )

  check(
    '整条链路没有未捕获异常（退出码之外的第三个判据）',
    pageErrors.length === 0,
    pageErrors.slice(0, 2).join(' | ') || '无',
  )

  // —— 移除：撤销通道已验证过，这里只确认按钮真的清掉 ——
  // 面板跟着**选中**的主题走：上面为了做"选中态不变"的对照把选中挪到了根主题，
  // 所以这里要先选回带录音的那个主题，否则移除按钮根本不在面板上。
  await page
    .locator('.mindmap-node', { hasText: topicText })
    .first()
    .click()
  await page.waitForTimeout(400)
  await page.locator('button[aria-label="移除语音备注"]').click()
  await page.waitForTimeout(700)
  const removed = await page.evaluate(READ_VOICE_NOTE)
  const stillThere = (removed.found ?? []).some((entry) => entry.id === storedEntry?.id)
  check('移除后文档里不再有该语音备注', !stillThere, `剩余 ${(removed.found ?? []).length} 条`)

  await writeFile(path.join(outDir, 'evidence.json'), JSON.stringify({ results, playback }, null, 2))
  await browser.close()

  const failed = results.filter((result) => !result.pass)
  console.log(`\n共 ${results.length} 条断言，失败 ${failed.length} 条`)
  if (failed.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
  process.exit(1)
})
