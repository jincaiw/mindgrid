/**
 * 主题语音备注的展示口径与**能力检测**（纯函数 / 常量）。
 *
 * 抽出来的理由与 `attachment.ts` / 图片那条一样：这些判断**可以也应该被单测钉住**，
 * 尤其是"不支持时该说什么"——它决定了用户看到的是"点了没反应"还是一句能照做的说明。
 *
 * 录音本身（`MediaRecorder` / `getUserMedia`）是平台能力，只能真引擎验证；
 * 所以这里只收"输入是什么、输出是什么"的纯逻辑，把副作用留给调用方。
 */

/**
 * 录制音频的 MIME 候选，**按偏好排序**。
 *
 * - `audio/webm;codecs=opus`：Chromium 系（含桌面端 WebView 与浏览器降级链路）体积/质量最好；
 * - `audio/mp4`：Safari / WKWebView 只认它（WebKit 不实现 webm 录制）；
 * - 都不支持时**不要**在这里编一个：交给调用方让 `MediaRecorder` 自选，
 *   然后从 `recorder.mimeType` 读回真实值 —— 猜一个不支持的 type 会让构造直接抛错。
 */
export const VOICE_NOTE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const

/** 按候选顺序挑第一个被支持的 MIME；一个都不支持时返回 `undefined`（交给浏览器自选）。 */
export function pickVoiceNoteMimeType(
  isTypeSupported: (type: string) => boolean,
): string | undefined {
  for (const candidate of VOICE_NOTE_MIME_CANDIDATES) {
    // 探测函数本身可能抛（某些实现对不认识的 type 直接抛而不是返回 false）
    try {
      if (isTypeSupported(candidate)) {
        return candidate
      }
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * 由 MIME 推资源文件的扩展名。
 *
 * 只用于**资源区里的文件名**（内容按内容哈希去重，扩展名只为可读性与"导出后能用系统播放器打开"）。
 * 认不出来时给 `bin`，不编造。
 */
export function voiceNoteFileExtension(mimeType: string | null | undefined): string {
  const normalized = (mimeType ?? '').toLowerCase().split(';')[0]?.trim() ?? ''
  switch (normalized) {
    case 'audio/webm':
      return 'webm'
    case 'audio/mp4':
    case 'audio/m4a':
    case 'audio/x-m4a':
      return 'm4a'
    case 'audio/ogg':
      return 'ogg'
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav'
    default:
      return 'bin'
  }
}

/**
 * 时长的显示口径：`m:ss`，超过一小时用 `h:mm:ss`。
 *
 * 缺省、非有限值或负值一律返回空串 —— 调用方据此**不显示时长**，
 * 而不是显示 `0:00` 或 `NaN:NaN`。
 */
export function formatVoiceDuration(durationMs: number | null | undefined): string {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    return ''
  }
  const totalSeconds = Math.floor(durationMs / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
  }
  return `${Math.floor(totalSeconds / 60)}:${ss}`
}

/** 录音能力的输入（由调用方从运行时读出来，便于单测注入）。 */
export interface VoiceNoteCapabilities {
  hasMediaRecorder: boolean
  hasUserMedia: boolean
}

export type VoiceNoteUnsupportedReason = 'no-media-recorder' | 'no-user-media'

export type VoiceNoteSupport =
  | { supported: true }
  | { supported: false; reason: VoiceNoteUnsupportedReason; message: string }

export const VOICE_NOTE_NO_MEDIA_RECORDER_MESSAGE =
  '当前运行环境不支持录音（缺少 MediaRecorder）。'
export const VOICE_NOTE_NO_USER_MEDIA_MESSAGE =
  '当前运行环境无法访问麦克风（缺少 getUserMedia）。'
export const VOICE_NOTE_PERMISSION_DENIED_MESSAGE =
  '未获得麦克风权限。请在 系统设置 → 隐私与安全性 → 麦克风 中允许 MindGrid 后重试。'
export const VOICE_NOTE_NOT_FOUND_MESSAGE = '没有找到可用的麦克风设备。'
export const VOICE_NOTE_BUSY_MESSAGE = '麦克风被其它应用占用或无法读取，请关闭占用它的应用后重试。'
export const VOICE_NOTE_EMPTY_MESSAGE = '没有录到声音。请确认麦克风可用后重试。'

/**
 * 能力检测。
 *
 * ⚠️ 顺序有讲究：**先查 MediaRecorder 再查 getUserMedia**。
 * 两者都缺时，用户真正需要知道的是"这个环境根本不支持录音"，
 * 而不是"缺 getUserMedia"——前者是结论，后者是实现细节。
 */
export function resolveVoiceNoteSupport(caps: VoiceNoteCapabilities): VoiceNoteSupport {
  if (!caps.hasMediaRecorder) {
    return {
      supported: false,
      reason: 'no-media-recorder',
      message: VOICE_NOTE_NO_MEDIA_RECORDER_MESSAGE,
    }
  }
  if (!caps.hasUserMedia) {
    return { supported: false, reason: 'no-user-media', message: VOICE_NOTE_NO_USER_MEDIA_MESSAGE }
  }
  return { supported: true }
}

/**
 * 把录音过程中的异常翻成用户能照做的一句话。
 *
 * 为什么要按 `name` 分类而不是直接把 `error.message` 抛给用户：
 * 浏览器给的是 `Permission denied` / `Requested device not found` 这类英文实现细节，
 * 用户既看不懂也不知道下一步做什么。**「未授权」这条尤其重要**——
 * 它是最常见的一种，且只有它能给出"去系统设置里允许"这个可执行动作。
 */
export function describeVoiceNoteError(error: unknown): string {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return VOICE_NOTE_PERMISSION_DENIED_MESSAGE
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return VOICE_NOTE_NOT_FOUND_MESSAGE
    case 'NotReadableError':
    case 'TrackStartError':
      return VOICE_NOTE_BUSY_MESSAGE
    default: {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message ?? '').trim()
          : ''
      return message.length > 0 ? `录音失败：${message}` : '录音失败。'
    }
  }
}
