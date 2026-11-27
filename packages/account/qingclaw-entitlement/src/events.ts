/** The upgrade prompt a lapsed user's enable attempt raises for the browser. */
export interface UpgradeRequired {
  /** The workbench bundle the user tried to enable. */
  readonly packageName: string
  /** Catalog title for the prompt, or the package name when the catalog has none. */
  readonly title: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A lapsed user tried to enable a workbench; the browser shows the upgrade prompt.
     * @mode emit
     * @param request - the workbench and its display title.
     */
    'qingclaw-entitlement/upgrade-required'(request: { readonly packageName: string; readonly title: string }): void
  }
}
