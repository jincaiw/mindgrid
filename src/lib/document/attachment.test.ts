import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_DIALOG_OPTIONS,
  displayAttachmentName,
  formatAttachmentSize,
} from './attachment'

describe('formatAttachmentSize', () => {
  it('按量级切换单位', () => {
    expect(formatAttachmentSize(0)).toBe('0 B')
    expect(formatAttachmentSize(999)).toBe('999 B')
    expect(formatAttachmentSize(1024)).toBe('1.0 KB')
    expect(formatAttachmentSize(20 * 1024)).toBe('20 KB')
    expect(formatAttachmentSize(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(formatAttachmentSize(40 * 1024 * 1024)).toBe('40 MB')
  })

  it('缺省或非法值返回空串（调用方据此不显示，而不是显示 NaN B）', () => {
    expect(formatAttachmentSize(undefined)).toBe('')
    expect(formatAttachmentSize(null)).toBe('')
    expect(formatAttachmentSize(Number.NaN)).toBe('')
    expect(formatAttachmentSize(-1)).toBe('')
  })
})

describe('displayAttachmentName', () => {
  it('只取最后一段（文档内容可能带路径分隔符）', () => {
    expect(displayAttachmentName('方案.pdf')).toBe('方案.pdf')
    expect(displayAttachmentName('docs/方案.pdf')).toBe('方案.pdf')
    expect(displayAttachmentName('C:\\Users\\me\\方案.pdf')).toBe('方案.pdf')
  })

  it('缺省与非法名回落到占位文本', () => {
    expect(displayAttachmentName(undefined)).toBe('未命名附件')
    expect(displayAttachmentName('   ')).toBe('未命名附件')
    expect(displayAttachmentName('..')).toBe('未命名附件')
    expect(displayAttachmentName('/')).toBe('未命名附件')
  })
})

describe('ATTACHMENT_DIALOG_OPTIONS', () => {
  it('任意文件都能附加：单选、只能选文件、**不限制扩展名**', () => {
    expect(ATTACHMENT_DIALOG_OPTIONS.multiple).toBe(false)
    expect(ATTACHMENT_DIALOG_OPTIONS.directory).toBe(false)
    // 与图片那条的关键差别：附件不该被扩展名白名单挡住
    expect('filters' in ATTACHMENT_DIALOG_OPTIONS).toBe(false)
  })
})
