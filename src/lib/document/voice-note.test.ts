import { describe, expect, it } from 'vitest'
import {
  describeVoiceNoteError,
  formatVoiceDuration,
  pickVoiceNoteMimeType,
  resolveVoiceNoteSupport,
  VOICE_NOTE_BUSY_MESSAGE,
  VOICE_NOTE_MIME_CANDIDATES,
  VOICE_NOTE_NOT_FOUND_MESSAGE,
  VOICE_NOTE_NO_MEDIA_RECORDER_MESSAGE,
  VOICE_NOTE_NO_USER_MEDIA_MESSAGE,
  VOICE_NOTE_PERMISSION_DENIED_MESSAGE,
  voiceNoteFileExtension,
} from './voice-note'

describe('formatVoiceDuration', () => {
  it('用 m:ss，超过一小时用 h:mm:ss', () => {
    expect(formatVoiceDuration(0)).toBe('0:00')
    // 不足一秒向下取整：0.9 秒显示 0:00 而不是 0:01
    expect(formatVoiceDuration(999)).toBe('0:00')
    expect(formatVoiceDuration(1000)).toBe('0:01')
    expect(formatVoiceDuration(59_000)).toBe('0:59')
    expect(formatVoiceDuration(60_000)).toBe('1:00')
    expect(formatVoiceDuration(3_599_000)).toBe('59:59')
    expect(formatVoiceDuration(3_600_000)).toBe('1:00:00')
    expect(formatVoiceDuration(3_661_000)).toBe('1:01:01')
  })

  it('非法值返回空串，调用方据此不显示时长（而不是显示 0:00 / NaN:NaN）', () => {
    expect(formatVoiceDuration(null)).toBe('')
    expect(formatVoiceDuration(undefined)).toBe('')
    expect(formatVoiceDuration(-1)).toBe('')
    expect(formatVoiceDuration(Number.NaN)).toBe('')
    expect(formatVoiceDuration(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('pickVoiceNoteMimeType', () => {
  it('按候选顺序取第一个被支持的', () => {
    expect(pickVoiceNoteMimeType((type) => type === 'audio/webm')).toBe('audio/webm')
    expect(pickVoiceNoteMimeType(() => true)).toBe(VOICE_NOTE_MIME_CANDIDATES[0])
  })

  it('都不支持时返回 undefined（交给 MediaRecorder 自选，而不是编一个）', () => {
    expect(pickVoiceNoteMimeType(() => false)).toBeUndefined()
  })

  it('探测函数抛异常时继续试下一个（某些实现对不认识的 type 直接抛）', () => {
    const probed: string[] = []
    const result = pickVoiceNoteMimeType((type) => {
      probed.push(type)
      if (type === VOICE_NOTE_MIME_CANDIDATES[0]) {
        throw new Error('unsupported')
      }
      return type === 'audio/mp4'
    })
    expect(result).toBe('audio/mp4')
    // 抛过一次之后仍然继续往后试，而不是直接放弃
    expect(probed.length).toBeGreaterThan(1)
  })
})

describe('voiceNoteFileExtension', () => {
  it('按 MIME 主体映射（带参数的取分号前）', () => {
    expect(voiceNoteFileExtension('audio/webm;codecs=opus')).toBe('webm')
    expect(voiceNoteFileExtension('audio/webm')).toBe('webm')
    expect(voiceNoteFileExtension('audio/mp4')).toBe('m4a')
    expect(voiceNoteFileExtension('audio/ogg;codecs=opus')).toBe('ogg')
    expect(voiceNoteFileExtension('audio/mpeg')).toBe('mp3')
  })

  it('认不出来给 bin，不编造', () => {
    expect(voiceNoteFileExtension('audio/unknown')).toBe('bin')
    expect(voiceNoteFileExtension('')).toBe('bin')
    expect(voiceNoteFileExtension(null)).toBe('bin')
  })
})

describe('resolveVoiceNoteSupport', () => {
  it('两者都有才算支持', () => {
    expect(resolveVoiceNoteSupport({ hasMediaRecorder: true, hasUserMedia: true })).toEqual({
      supported: true,
    })
  })

  it('先报"不支持录音"这条结论，而不是缺哪个实现细节', () => {
    // 两个都缺时报 no-media-recorder：用户需要知道的是"这里录不了音"，
    // 不是"缺 getUserMedia"
    const both = resolveVoiceNoteSupport({ hasMediaRecorder: false, hasUserMedia: false })
    expect(both).toEqual({
      supported: false,
      reason: 'no-media-recorder',
      message: VOICE_NOTE_NO_MEDIA_RECORDER_MESSAGE,
    })

    const onlyUserMedia = resolveVoiceNoteSupport({
      hasMediaRecorder: false,
      hasUserMedia: true,
    })
    expect(onlyUserMedia.supported).toBe(false)
    if (!onlyUserMedia.supported) {
      expect(onlyUserMedia.reason).toBe('no-media-recorder')
    }

    const onlyRecorder = resolveVoiceNoteSupport({
      hasMediaRecorder: true,
      hasUserMedia: false,
    })
    expect(onlyRecorder.supported).toBe(false)
    if (!onlyRecorder.supported) {
      expect(onlyRecorder.reason).toBe('no-user-media')
      expect(onlyRecorder.message).toBe(VOICE_NOTE_NO_USER_MEDIA_MESSAGE)
    }
  })
})

describe('describeVoiceNoteError', () => {
  it('未授权给出"去系统设置里允许"这句可执行说明', () => {
    expect(describeVoiceNoteError(Object.assign(new Error('x'), { name: 'NotAllowedError' }))).toBe(
      VOICE_NOTE_PERMISSION_DENIED_MESSAGE,
    )
    expect(describeVoiceNoteError(Object.assign(new Error('x'), { name: 'SecurityError' }))).toBe(
      VOICE_NOTE_PERMISSION_DENIED_MESSAGE,
    )
  })

  it('无设备 / 被占用分别有各自的说明', () => {
    expect(describeVoiceNoteError(Object.assign(new Error('x'), { name: 'NotFoundError' }))).toBe(
      VOICE_NOTE_NOT_FOUND_MESSAGE,
    )
    expect(describeVoiceNoteError(Object.assign(new Error('x'), { name: 'NotReadableError' }))).toBe(
      VOICE_NOTE_BUSY_MESSAGE,
    )
  })

  it('其它错误带上原始信息，完全没有信息时给一句通用说明', () => {
    expect(describeVoiceNoteError(new Error('boom'))).toBe('录音失败：boom')
    expect(describeVoiceNoteError({})).toBe('录音失败。')
    expect(describeVoiceNoteError('字符串异常')).toBe('录音失败。')
  })
})
