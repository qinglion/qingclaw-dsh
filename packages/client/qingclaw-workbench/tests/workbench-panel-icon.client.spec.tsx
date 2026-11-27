// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, expect, it } from 'vitest'
import { WorkbenchPanelIcon, workbenchPanelIcon } from '../src/client/WorkbenchPanelIcon.tsx'

afterEach(cleanup)

const logo = 'https://beta.qingclaw.com/logo.webp'

it('draws the catalog logo and falls back to the sparkle when it is absent or fails', () => {
  const { container, rerender } = render(createElement(WorkbenchPanelIcon, { size: 18 } as never))
  expect(container.querySelector('img')).toBeNull()

  rerender(createElement(WorkbenchPanelIcon, { size: 18, iconUrl: logo } as never))
  const image = container.querySelector('img')
  expect(image?.getAttribute('src')).toBe(logo)

  fireEvent.error(image as HTMLImageElement)
  expect(container.querySelector('img')).toBeNull()
})

it('binds one installed workbench logo to its sidebar launcher', () => {
  const { container } = render(createElement(workbenchPanelIcon(logo), { size: 18 } as never))
  expect(container.querySelector('img')?.getAttribute('src')).toBe(logo)

  cleanup()
  expect(render(createElement(workbenchPanelIcon(), { size: 18 } as never)).container.querySelector('img')).toBeNull()
})
