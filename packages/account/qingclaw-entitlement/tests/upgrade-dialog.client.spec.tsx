// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UpgradeDialog, type UpgradeDialogProps } from '../src/client/UpgradeDialog.tsx'

const request = { packageName: '@qinglion/desk-a', title: '自媒体工作台' }

afterEach(cleanup)

function props(overrides: Partial<UpgradeDialogProps> = {}): UpgradeDialogProps {
  const t = ((key: string, params?: Record<string, string>) => params?.name === undefined ? key : `${key}:${params.name}`) as UpgradeDialogProps['t']
  const useRequest = ((select: (value: typeof request | undefined) => unknown) => select(request)) as UpgradeDialogProps['useRequest']
  return {
    useRequest, t, dismiss: vi.fn(), openUpgrade: vi.fn(),
    ...overrides,
  } as UpgradeDialogProps
}

it('renders the workbench name and the upgrade action', () => {
  const openUpgrade = vi.fn()
  render(<UpgradeDialog {...props({ openUpgrade })} />)
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.getByText('body:自媒体工作台')).toBeTruthy()
  screen.getByText('upgrade').click()
  expect(openUpgrade).toHaveBeenCalledOnce()
})

it('closes from the secondary action', () => {
  const dismiss = vi.fn()
  render(<UpgradeDialog {...props({ dismiss })} />)
  screen.getByText('later').click()
  expect(dismiss).toHaveBeenCalledOnce()
})

it('renders nothing without a request', () => {
  const useRequest = ((select: (value: undefined) => unknown) => select(undefined)) as UpgradeDialogProps['useRequest']
  const { container } = render(<UpgradeDialog {...props({ useRequest })} />)
  expect(container.firstChild).toBeNull()
})
