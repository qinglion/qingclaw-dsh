// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { WorkbenchPanelIcon, workbenchPanelIcon } from '../src/client/WorkbenchPanelIcon.tsx'

afterEach(cleanup)

it('draws the catalog logo and falls back to the sparkle when it is absent or fails', () => {
  const { container, rerender } = render(<WorkbenchPanelIcon {...({ size: 18 } as never)} />)
  expect(container.querySelector('img')).toBeNull()
  rerender(<WorkbenchPanelIcon {...({ size: 18, iconUrl: 'https://beta.qingclaw.com/logo.webp' } as never)} />)
  const image = container.querySelector('img')
  expect(image?.getAttribute('src')).toBe('https://beta.qingclaw.com/logo.webp')
  fireEvent.error(image as HTMLImageElement)
  expect(container.querySelector('img')).toBeNull()
})

it('binds one installed workbench logo to its sidebar launcher', () => {
  const Launcher = workbenchPanelIcon('https://beta.qingclaw.com/logo.webp')
  const { container } = render(<Launcher {...({ size: 18 } as never)} />)
  expect(container.querySelector('img')?.getAttribute('src')).toBe('https://beta.qingclaw.com/logo.webp')
  cleanup()
  const Plain = workbenchPanelIcon()
  expect(render(<Plain {...({ size: 18 } as never)} />).container.querySelector('img')).toBeNull()
})
