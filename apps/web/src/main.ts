/** Browser entry for the Web client. */
import '@deepseek-ai/dsh-client-ui-theme/brand-font.css'
import { AppWebEntry, applyIndexInjections } from '@deepseek-ai/dsh-client-web'

interface DesktopBootGlobal {
  dshDesktopBoot?: {
    failed(message: string): Promise<void>
    ready(): Promise<{ injections: Parameters<typeof applyIndexInjections>[0]; streamBaseUrl: string }>
  }
}
const desktop = (globalThis as DesktopBootGlobal).dshDesktopBoot
const reportFailure = (reason: unknown): void => {
  if (desktop === undefined) throw reason
  void desktop.failed(reason instanceof Error ? reason.message : String(reason)).catch(console.error)
}

try {
  const el = document.getElementById('root')
  if (el === null) throw new Error('web app: missing #root')
  // The Desktop carriers hold the Host rows until after this module starts, so
  // the boot entry is constructed only once those rows are in place: the rows
  // paint the first frame, and the shell's own loading card must never reach
  // the screen ahead of them.
  const start = (): void => {
    void new AppWebEntry(el).run(desktop === undefined ? undefined : reportFailure)
  }
  if (desktop === undefined) {
    start()
  } else {
    const gate = (globalThis as { __DSH_BOOT_READY__?: PromiseWithResolvers<void> }).__DSH_BOOT_READY__
    if (gate === undefined) throw new Error('desktop web: boot readiness is missing')
    void desktop.ready().then(async ({ injections, streamBaseUrl }) => {
      const transport = globalThis as { __DSH_TRANSPORT__?: { ownsHost: boolean; streamBaseUrl: string } }
      transport.__DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl }
      await applyIndexInjections(injections, src => new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = src
        script.onload = () => { resolve() }
        script.onerror = () => { reject(new Error('desktop web: failed to load ' + src)) }
        document.head.append(script)
      }))
      start()
      gate.resolve()
    }).catch((error: unknown) => {
      // A carrier that cannot hand over its rows still gets the boot page, and
      // the rejected gate routes the failure to the native recovery surface.
      start()
      gate.reject(error)
    })
  }
} catch (reason) {
  reportFailure(reason)
}
