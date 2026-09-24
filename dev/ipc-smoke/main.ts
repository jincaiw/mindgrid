/**
 * 真机 IPC 冒烟：把**整个命令面**在真 Tauri 运行时里跑一遍，只看参数契约。
 *
 * 为什么要有它：v0.4.20 修的那个缺陷（顶层参数键该是 lowerCamelCase）从 V1 起存在、
 * 40+ 命令全废、活了 19 个版本 —— 根因是**整套自动化都跑在浏览器降级链路上**
 * （jsdom 单测与 Chromium 取证脚本都走 `invokeBrowserCommand`），
 * 而真机取证只做到"启动截图"，启动又只调无参数命令。
 * 这个页面把"真机 + 真 IPC + 带参数"这条路补上。
 *
 * 判据只有一条：**报错里不允许出现 `invalid args` / `missing required key`**。
 * 因为绝大部分命令用**不存在的 id** 去调，业务层必然回一个"找不到…"的领域错误 ——
 * 那是**通过**（说明参数被正确接收、函数体真的跑到了）；
 * 只有参数解析失败才是契约坏了。
 *
 * 副作用控制：所有调用要么只读，要么因为 id 不存在而在业务层提前失败。
 * 会真正改动全局状态或用户文件的命令**一律不调**（见 `SKIPPED`，理由逐条写明）。
 * `setDocumentTheme` 是唯一必须"原值回写"的（它不校验 id），已单独处理。
 */
import * as api from '../../src/lib/ipc/commands'

const BOGUS = '__ipc_smoke_missing__'
const BOGUS_SHEET = '__ipc_smoke_missing_sheet__'
const TMP = '/tmp/mindgrid-ipc-smoke'

/** 参数解析失败的判据（Tauri 侧的原文形如 `invalid args \`topicId\` for command \`select_topic\``）。 */
const ARG_FAILURE = /invalid args|missing required key/i
/** JS 层面的崩（命令不存在、函数签名变了…），同样算失败。 */
const JS_FAILURE = /is not a function|Cannot read|undefined is not|not a function/i

type Verdict = 'OK' | 'DOMAIN-ERR' | 'ARG-FAIL' | 'JS-FAIL' | 'SKIP'

interface Outcome {
  label: string
  verdict: Verdict
  detail: string
}

const cases: Array<[string, () => Promise<unknown>]> = [
  // —— 只读 / 可安全写的文件操作（都写到 /tmp）——
  ['get_document_state', () => api.getDocumentState()],
  ['read_asset_data_url', () => api.readAssetDataUrl(BOGUS)],
  ['export_markdown_file', () => api.exportMarkdownFile(`${TMP}.md`)],
  ['export_opml_file', () => api.exportOpmlFile(`${TMP}.opml`)],
  ['export_svg_file', () => api.exportSvgFile(`${TMP}.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>')],
  ['export_png_file', () => api.exportPngFile(`${TMP}.png`, new Uint8Array(0))],
  ['export_pdf_file', () => api.exportPdfFile(`${TMP}.pdf`, new Uint8Array(0))],
  ['export_recovery_copy', () => api.exportRecoveryCopy(`${TMP}.mgd`)],
  ['save_document_file', () => api.saveDocumentFile(`${TMP}-save.mgd`)],
  ['open_recent_file', () => api.openRecentFile(9999)],
  ['open_document_file', () => api.openDocumentFile('/nonexistent-mindgrid-smoke.mgd')],
  ['import_markdown_file', () => api.importMarkdownFile('/nonexistent-smoke.md')],
  ['import_opml_file', () => api.importOpmlFile('/nonexistent-smoke.opml')],
  ['import_docx_file', () => api.importDocxFile('/nonexistent-smoke.docx')],
  ['merge_document_file', () => api.mergeDocumentFile('/nonexistent-smoke.mgd')],
  ['clear_repair_report', () => api.clearRepairReport()],

  // —— 画布（sheet）——
  ['select_sheet', () => api.selectSheet(BOGUS_SHEET)],
  ['rename_sheet', () => api.renameSheet(BOGUS_SHEET, 'smoke')],
  ['delete_sheet', () => api.deleteSheet(BOGUS_SHEET)],
  ['move_sheet', () => api.moveSheet(BOGUS_SHEET, 'up')],
  ['set_sheet_chart_type', () => api.setSheetChartType(BOGUS_SHEET, 'logic')],
  ['set_sheet_branch_style', () => api.setSheetBranchStyle(BOGUS_SHEET, null)],
  ['set_sheet_numbering', () => api.setSheetNumbering(BOGUS_SHEET, null)],
  ['set_sheet_illustrations', () => api.setSheetIllustrations(BOGUS_SHEET, [])],
  ['set_sheet_layout_direction', () => api.setSheetLayoutDirection(BOGUS_SHEET, 'right')],

  // —— 主题（topic）：选择 / 结构 / 位置 ——
  ['select_topic', () => api.selectTopic(BOGUS)],
  ['rename_topic', () => api.renameTopic(BOGUS, 'smoke')],
  ['delete_topic', () => api.deleteTopic(BOGUS)],
  ['delete_topics', () => api.deleteTopics([BOGUS], 'smoke')],
  ['delete_topic_only', () => api.deleteTopicOnly([BOGUS])],
  ['create_child_topic', () => api.createChildTopic(BOGUS)],
  ['create_sibling_topic', () => api.createSiblingTopic(BOGUS, 'after')],
  ['create_parent_topic', () => api.createParentTopic(BOGUS)],
  ['toggle_topic_collapsed', () => api.toggleTopicCollapsed(BOGUS)],
  ['set_topics_collapsed', () => api.setTopicsCollapsed([BOGUS], true)],
  ['set_topic_position', () => api.setTopicPosition(BOGUS, 12, 34)],
  [
    'set_topics_position',
    () => api.setTopicsPosition([{ topicId: BOGUS, offsetX: 12, offsetY: 34 }], 'smoke'),
  ],
  ['apply_topic_style_to_siblings', () => api.applyTopicStyleToSiblings(BOGUS)],
  [
    'move_topic',
    () => api.moveTopic(BOGUS, BOGUS, 'smoke', 0),
  ],
  ['move_topics', () => api.moveTopics([BOGUS], BOGUS, 'smoke')],
  ['move_topic_in_parent', () => api.moveTopicInParent(BOGUS, 'up')],
  [
    'move_topic_to_sheet',
    () => api.moveTopicToSheet(BOGUS, BOGUS_SHEET, BOGUS, 'smoke'),
  ],
  [
    'move_topics_to_sheet',
    () => api.moveTopicsToSheet([BOGUS], BOGUS_SHEET, BOGUS, 'smoke'),
  ],
  [
    'copy_topic_to_sheet',
    () => api.copyTopicToSheet(BOGUS, BOGUS_SHEET, BOGUS, 'smoke'),
  ],
  [
    'copy_topics_to_sheet',
    () => api.copyTopicsToSheet([BOGUS], BOGUS_SHEET, BOGUS, 'smoke'),
  ],
  ['paste_topics', () => api.pasteTopics([], BOGUS)],
  ['create_sheet_from_topic', () => api.createSheetFromTopic(BOGUS, 'smoke')],

  // —— 主题富字段 ——
  ['set_topic_notes', () => api.setTopicNotes(BOGUS, 'smoke')],
  ['set_topic_link', () => api.setTopicLink(BOGUS, null)],
  ['set_topic_image', () => api.setTopicImage(BOGUS, '/nonexistent-smoke.png')],
  ['remove_topic_image', () => api.removeTopicImage(BOGUS)],
  ['set_topic_attachment', () => api.setTopicAttachment(BOGUS, '/nonexistent-smoke.pdf', 'x.pdf')],
  ['remove_topic_attachment', () => api.removeTopicAttachment(BOGUS)],
  ['open_topic_attachment', () => api.openTopicAttachment(BOGUS)],
  ['set_topic_voice_note', () => api.setTopicVoiceNote(BOGUS, 'data:audio/webm;base64,AAAA', 1000)],
  // 方程不引用资源，但同样走「主题 id 不存在 → 业务层提前失败」这条安全路径：
  // 参数被正确接收才会进到"找不到主题"，这正是本夹具要判的东西。
  ['set_topic_equation', () => api.setTopicEquation(BOGUS, { latex: 'a^2', display: true })],
  ['set_topic_equation', () => api.setTopicEquation(BOGUS, null)],
  ['remove_topic_voice_note', () => api.removeTopicVoiceNote(BOGUS)],
  ['set_topic_markers', () => api.setTopicMarkers(BOGUS, [])],
  ['set_topic_stickers', () => api.setTopicStickers(BOGUS, [])],
  ['set_topic_callout', () => api.setTopicCallout(BOGUS, null)],
  ['set_topic_labels', () => api.setTopicLabels(BOGUS, [])],
  ['set_topic_task', () => api.setTopicTask(BOGUS, null)],
  ['set_topic_style_ref', () => api.setTopicStyleRef(BOGUS, null)],
  ['set_topic_style_overrides', () => api.setTopicStyleOverrides(BOGUS, null)],
  ['set_topic_structure', () => api.setTopicStructure(BOGUS, null)],

  // —— 关系 / 边界 / 摘要 ——
  ['create_relationship', () => api.createRelationship(BOGUS, BOGUS, null)],
  ['delete_relationship', () => api.deleteRelationship(BOGUS)],
  ['create_boundary', () => api.createBoundary(BOGUS_SHEET, [BOGUS], null)],
  ['delete_boundary', () => api.deleteBoundary(BOGUS_SHEET, BOGUS)],
  ['create_summary', () => api.createSummary(BOGUS_SHEET, [BOGUS], 'smoke')],
  ['delete_summary', () => api.deleteSummary(BOGUS_SHEET, BOGUS)],
]

/**
 * 刻意不调的命令与理由（这些要么改全局状态、要么会写用户文件，
 * 而它们的参数契约由**源码漂移守卫**（`src/lib/ipc/transport.test.ts`）静态覆盖）：
 */
export const SKIPPED: Record<string, string> = {
  create_document: '会重置当前文档',
  create_document_from_template: '会重置当前文档',
  create_sheet: '会新建画布（无 id 可失败）',
  create_floating_topic: '会真的新建一个浮动主题',
  undo_document_command: '会改动用户的撤销历史',
  redo_document_command: '会改动用户的撤销历史',
  save_document_to_current_file: '会写用户的 .mgd 文件',
  repair_document_file: '需要真实的损坏文件',
  clear_recent_files: '会清空用户的「最近打开」列表',
  set_document_setting: '键值会落进文档设置（且 key/value 是单词参数，无命名风险）',
}

function classify(label: string, error: unknown): Outcome {
  const message = error instanceof Error ? error.message : String(error)
  const flat = message.replace(/\s+/g, ' ')
  if (ARG_FAILURE.test(flat)) {
    return { label, verdict: 'ARG-FAIL', detail: flat.slice(0, 160) }
  }
  if (error instanceof TypeError || JS_FAILURE.test(flat)) {
    return { label, verdict: 'JS-FAIL', detail: flat.slice(0, 160) }
  }
  // 领域错误（"找不到主题"…）＝ 参数被正确接收、函数体跑到了 → 通过
  return { label, verdict: 'DOMAIN-ERR', detail: flat.slice(0, 96) }
}

async function run(): Promise<Outcome[]> {
  const outcomes: Outcome[] = []
  for (const [label, call] of cases) {
    try {
      await call()
      outcomes.push({ label, verdict: 'OK', detail: '' })
    } catch (error) {
      outcomes.push(classify(label, error))
    }
  }

  // `set_document_theme` 不校验 id（传什么就存什么），所以只能用**原值回写**来测契约。
  // 当前没有主题时直接跳过，避免把文档的主题清成 null。
  try {
    const state = await api.getDocumentState()
    const currentThemeId = state?.document.theme?.id ?? null
    if (currentThemeId) {
      try {
        await api.setDocumentTheme(currentThemeId)
        outcomes.push({ label: 'set_document_theme', verdict: 'OK', detail: '原值回写' })
      } catch (error) {
        outcomes.push(classify('set_document_theme', error))
      }
    } else {
      outcomes.push({
        label: 'set_document_theme',
        verdict: 'SKIP',
        detail: '当前文档没有主题，跳过（避免清空）',
      })
    }
  } catch (error) {
    outcomes.push({ label: 'set_document_theme', verdict: 'SKIP', detail: String(error).slice(0, 80) })
  }

  return outcomes
}

/** 结论摘要：窗口标题里只用 ASCII，便于外部脚本正则匹配。 */
function summarize(outcomes: Outcome[]) {
  const total = outcomes.length
  const argFail = outcomes.filter((o) => o.verdict === 'ARG-FAIL')
  const jsFail = outcomes.filter((o) => o.verdict === 'JS-FAIL')
  const ok = outcomes.filter((o) => o.verdict === 'OK')
  const domainErr = outcomes.filter((o) => o.verdict === 'DOMAIN-ERR')
  const skipped = outcomes.filter((o) => o.verdict === 'SKIP')
  const bad = [...argFail, ...jsFail].map((o) => o.label)
  const verdict = argFail.length || jsFail.length ? 'FAIL' : 'PASS'
  // `ok` 是非 0 才有说服力：全 DOMAIN-ERR 只说明"参数被接受了"，但 `ok` 说明
  // 至少有一条命令真的走通了（例如原值回写的 set_document_theme、或只读命令）。
  const title =
    `IPCSMOKE v1 ${verdict} total=${total} ok=${ok.length} domainerr=${domainErr.length}` +
    ` skipped=${skipped.length} argfail=${argFail.length} jsfail=${jsFail.length}` +
    (bad.length ? ` bad=${bad.slice(0, 4).join(',')}` : '')
  return { title, argFail, jsFail, ok, domainErr, skipped, total }
}

async function publish() {
  const outcomes = await run()
  const summary = summarize(outcomes)

  const out = document.getElementById('out')
  if (out) {
    out.textContent = [
      summary.title,
      '',
      ...outcomes.map(
        (o) => `${o.verdict.padEnd(11)} ${o.label.padEnd(32)} ${o.detail}`,
      ),
    ].join('\n')
  }

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    // 标题是**外部可读**的：锁屏时截图只有壁纸，但窗口名照样能读到（见 dev/read-window-title.swift）
    await getCurrentWindow().setTitle(summary.title)
  } catch (error) {
    if (out) out.textContent += `\n\n（写窗口标题失败：${String(error)}）`
  }

  // 打印到控制台，方便 `tauri dev` 时直接看
  console.info(summary.title)
  for (const o of outcomes) {
    if (o.verdict === 'ARG-FAIL' || o.verdict === 'JS-FAIL') {
      console.error(`${o.verdict} ${o.label}: ${o.detail}`)
    }
  }
}

void publish()
