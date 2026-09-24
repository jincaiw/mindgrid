/**
 * 录音的薄封装：把 `MediaRecorder` + `getUserMedia` 收成一个"开始 → 停止 → 得到结果"的句柄。
 *
 * 为什么要单独一层：
 * 1. **麦克风轨道必须无条件释放**。任何一条路径漏掉 `track.stop()`，系统就一直是"正在使用麦克风"
 *    （菜单栏亮着录音指示、其它应用拿不到设备），而且**不会有任何报错**。
 *    集中在一处比散在组件里靠人记更可靠。
 * 2. **真实 MIME 要读回来**，不要用我们请求的那个：浏览器可能回退到别的格式，
 *    写进文档的元数据必须是实际值，否则导出后的扩展名/可播性对不上。
 * 3. 时长按**时间轴**自己算：`MediaRecorder` 不给时长，而 webm 容器（边录边写）
 *    常常没有正确的 duration 头 —— 靠 `audio.duration` 读出来会是 `Infinity`。
 *
 * 这一层不碰文档与 UI，只产出 `Blob`；落库由调用方走 `set_topic_voice_note`。
 */

import {
  describeVoiceNoteError,
  pickVoiceNoteMimeType,
  resolveVoiceNoteSupport,
  VOICE_NOTE_EMPTY_MESSAGE,
  type VoiceNoteCapabilities,
} from '../../lib/document/voice-note'

export interface VoiceRecording {
  blob: Blob
  /** **真实**使用的 MIME（从 `recorder.mimeType` 读回）。 */
  mimeType: string
  /** 实际录制时长（毫秒，按时间轴计）。 */
  durationMs: number
  byteSize: number
}

export interface VoiceRecorderHandle {
  /** 停止并返回结果；没录到任何数据时以 `VOICE_NOTE_EMPTY_MESSAGE` 拒绝。 */
  stop(): Promise<VoiceRecording>
  /** 放弃这次录音：停止轨道、丢弃数据，不产生任何资源。 */
  cancel(): void
  /** 已录制的毫秒数（供实时计时显示）。 */
  elapsedMs(): number
}

/** 读取当前运行时的录音能力。 */
export function readVoiceNoteCapabilities(): VoiceNoteCapabilities {
  return {
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    hasUserMedia:
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function',
  }
}

/** 当前环境能否录音；不能时带上原因与可直接展示的说明。 */
export function checkVoiceNoteSupport() {
  return resolveVoiceNoteSupport(readVoiceNoteCapabilities())
}

/** `Blob` → data URL（落库通道统一吃 data URL，与图片/附件一致）。 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => reject(new Error('读取录音数据失败'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 开始录音。失败时（不支持 / 未授权 / 无设备 / 被占用）以**中文说明**拒绝，
 * 调用方可直接展示 `error.message`。
 */
export async function startVoiceRecording(): Promise<VoiceRecorderHandle> {
  const support = checkVoiceNoteSupport()
  if (!support.supported) {
    throw new Error(support.message)
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    // 未授权是最常见的一种，describeVoiceNoteError 会给出"去系统设置里允许"这句可执行说明
    throw new Error(describeVoiceNoteError(error))
  }

  /**
   * 停止轨道。**所有出口都走它** —— 漏掉一次就是"麦克风一直被占用"且无任何报错。
   * 幂等：重复调用安全。
   */
  const releaseTracks = () => {
    for (const track of stream.getTracks()) {
      try {
        track.stop()
      } catch {
        // 已经停了 / 实现不允许 —— 忽略，不能因为清理动作失败把主流程打断
      }
    }
  }

  const preferredMime = pickVoiceNoteMimeType((type) => MediaRecorder.isTypeSupported(type))
  let recorder: MediaRecorder
  try {
    recorder = preferredMime
      ? new MediaRecorder(stream, { mimeType: preferredMime })
      : new MediaRecorder(stream)
  } catch (error) {
    releaseTracks()
    throw new Error(describeVoiceNoteError(error))
  }

  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data)
    }
  }

  const startedAt = Date.now()
  // 给一个分片周期：部分实现只在 stop 时才吐一块，另一些在开始后若从不 flush
  // 会给出空 blob。250ms 既够细也不至于把数据切太碎。
  recorder.start(250)

  let settled = false
  /**
   * 是否已经**请求**停止。
   *
   * ⚠️ 必须与 `settled` 分开，而且要在 `stop()` 里**同步置位**。
   * 实测踩到的坑：调用方 `await recorder.stop()` 之前先清了自己的 state，
   * 触发 effect cleanup 调到这里 `cancel()`；此时 `onstop` 还没跑（它是排队的宏任务），
   * `settled` 仍是 false → `cancel()` 把已经攒下的分片清空 →
   * **落库的只有最后一个 250ms 分片，没有 WebM 文件头**，
   * 表现是"录音能存下来、时长也对，但点播放报 `DEMUXER_ERROR_COULD_NOT_OPEN`"。
   * 只看单测永远发现不了（jsdom 连 MediaRecorder 都没有）。
   */
  let stopping = false

  const finish = (): VoiceRecording => {
    settled = true
    releaseTracks()
    const mimeType = recorder.mimeType || preferredMime || 'audio/webm'
    const blob = new Blob(chunks, { type: mimeType })
    return {
      blob,
      mimeType,
      durationMs: Math.max(0, Date.now() - startedAt),
      byteSize: blob.size,
    }
  }

  return {
    elapsedMs: () => Math.max(0, Date.now() - startedAt),
    cancel: () => {
      // 已经请求过停止 / 已经收尾：绝不能清分片，否则上面那条坑会重现。
      // 这样 `cancel()` 与 `stop()` 的**调用顺序**就不再影响结果。
      if (settled || stopping) return
      settled = true
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop()
        }
      } catch {
        // ignore
      }
      chunks.length = 0
      releaseTracks()
    },
    stop: () =>
      new Promise<VoiceRecording>((resolve, reject) => {
        if (settled || stopping) {
          reject(new Error('录音已经结束'))
          return
        }
        stopping = true
        recorder.onerror = () => {
          releaseTracks()
          settled = true
          reject(new Error('录音过程中出错'))
        }
        recorder.onstop = () => {
          const result = finish()
          if (result.blob.size === 0) {
            reject(new Error(VOICE_NOTE_EMPTY_MESSAGE))
            return
          }
          resolve(result)
        }
        try {
          if (recorder.state === 'inactive') {
            // 已经停了（例如轨道被系统回收）：按现有数据收尾
            const result = finish()
            if (result.blob.size === 0) {
              reject(new Error(VOICE_NOTE_EMPTY_MESSAGE))
              return
            }
            resolve(result)
            return
          }
          recorder.stop()
        } catch (error) {
          releaseTracks()
          settled = true
          reject(new Error(describeVoiceNoteError(error)))
        }
      }),
  }
}
