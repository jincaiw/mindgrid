import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import { ToastRegion } from './toast-region'

it('renders an action button when repair is available', () => {
  const onAction = vi.fn()

  renderWithApp(
    <ToastRegion message="打开文档失败" actionLabel="修复为副本" onAction={onAction} />,
  )

  fireEvent.click(screen.getByRole('button', { name: '修复为副本' }))

  expect(onAction).toHaveBeenCalledTimes(1)
})

it('renders nothing when there is no message', () => {
  const { container } = renderWithApp(<ToastRegion message={null} />)

  expect(container).toBeEmptyDOMElement()
})
