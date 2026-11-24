/**
 * QingClaw first-frame splash. The shell paints its own loading card as soon as
 * the application module runs, which is too late for brand chrome: the Host
 * injects this style during head parsing and this script before the module
 * executes, so the splash covers the viewport from the first paint and hands
 * the screen to the application when the shell boot node leaves the document.
 * @module @deepseek-ai/dsh-client-ui-brand-qingclaw/src/boot-splash
 */
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'

/** Element id of the injected splash; also its CSS scope. */
export const BOOT_SPLASH_ID = 'qingclaw-boot'

/** Brand name, one animated glyph per character. The locale-owning dictionary
 * is src/client/locales.ts; this splash runs before the locale service exists,
 * so it repeats the confirmed name rather than waiting for a translation. */
const BRAND_NAME = '青狮龙虾'
/** Latin caption under the brand name. */
const BRAND_LATIN = 'QINGCLAW'
/** Boot status line. */
const STATUS = '正在唤醒青狮…'

/** QingClaw brand inks; the artwork keeps them instead of following theme tokens. */
const SLATE = '#48707A'
const TEAL = '#4BB6B0'

/** Placement of the back layer inside the 100-unit viewBox. */
const BACK_PLACEMENT = 'translate(18 7) scale(.84) translate(25.4 5) scale(2.39)'
/** Placement of the front layer inside the 100-unit viewBox. */
const FRONT_PLACEMENT = 'translate(-5 0) translate(25.4 5) scale(2.39)'

/** Qinglion pinion mass shared by both layers of the mark. */
const PINION = 'M290.107 50.116a18.292 18.292 0 0 0 0 36.582h2.47V72.716a4.309 4.309 0 0 1 0-8.618V50.116Z'
/** Small foot mass under the pinion. */
const FOOT = 'M282.627 97.034a10.16 10.16 0 0 0-10.146 10.029h20.293a10.16 10.16 0 0 0-10.147-10.029Z'
/** Folded plane that keeps the product-family accent. */
const FOLD = 'M290.3 109.044h1.211a18.286 18.286 0 0 1-14.479-7.4 10.232 10.232 0 0 0-1.81 2.169 27.689 27.689 0 0 0 15.078 5.231Z'

/** Author placements of the three masses inside the pinion frame. */
const PINION_SHIFT = 'translate(-272.027 -49.103)'
const FOOT_SHIFT = 'translate(-272.205 -69.409)'
const FOLD_SHIFT = 'translate(-273.396 -71.409)'

/** Clip and gradient ids that confine the highlight to the artwork. */
const SHINE_CLIP = 'qcb-shine-clip'
const SHINE_GRADIENT = 'qcb-shine-gradient'

/**
 * Draw one mass of the mark as markup.
 * @param placement - Layer placement inside the viewBox.
 * @param shift - Author placement of the mass.
 * @param d - Path data.
 * @param fill - Brand ink, or undefined for a clip shape.
 * @returns the path element markup.
 */
function mass(placement: string, shift: string, d: string, fill: string | undefined): string {
  const paint = fill === undefined ? '' : ' fill="' + fill + '"'
  return '<path d="' + d + '" transform="' + placement + ' ' + shift + '"' + paint + '/>'
}

/** Clip shape shared by the mark's highlight. */
const CLIP_MASSES = [
  mass(BACK_PLACEMENT, PINION_SHIFT, PINION, undefined),
  mass(BACK_PLACEMENT, FOOT_SHIFT, FOOT, undefined),
  mass(FRONT_PLACEMENT, PINION_SHIFT, PINION, undefined),
  mass(FRONT_PLACEMENT, FOOT_SHIFT, FOOT, undefined),
  mass(FRONT_PLACEMENT, FOLD_SHIFT, FOLD, undefined),
].join('')

/** Back layer of the mark: the slate pinion and foot. */
const BACK_LAYER = [
  mass(BACK_PLACEMENT, PINION_SHIFT, PINION, SLATE),
  mass(BACK_PLACEMENT, FOOT_SHIFT, FOOT, SLATE),
].join('')

/** Front layer of the mark: the teal disc and the slate folded plane. */
const FRONT_LAYER = [
  mass(FRONT_PLACEMENT, PINION_SHIFT, PINION, TEAL),
  mass(FRONT_PLACEMENT, FOOT_SHIFT, FOOT, TEAL),
  mass(FRONT_PLACEMENT, FOLD_SHIFT, FOLD, SLATE),
].join('')

/**
 * Render one animated brand glyph.
 * @param character - The character to draw.
 * @param index - Stagger index carried by the glyph's animation delay.
 * @returns the glyph span markup.
 */
function glyph(character: string, index: number): string {
  return '<span class="qcb-glyph" aria-hidden="true" style="--qcb-glyph:' + String(index) + '">'
    + character + '</span>'
}

/** Splash content, injected once by the script. */
const MARKUP = [
  '<div class="qcb-aura"></div>',
  '<div class="qcb-card">',
  '<div class="qcb-stage">',
  '<div class="qcb-bloom"></div>',
  '<svg class="qcb-mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">',
  '<defs>',
  '<clipPath id="' + SHINE_CLIP + '">' + CLIP_MASSES + '</clipPath>',
  '<linearGradient id="' + SHINE_GRADIENT + '">',
  '<stop offset="0%" stop-color="#fff" stop-opacity="0"/>',
  '<stop offset="50%" stop-color="#fff" stop-opacity="0.75"/>',
  '<stop offset="100%" stop-color="#fff" stop-opacity="0"/>',
  '</linearGradient>',
  '</defs>',
  '<g class="qcb-back">' + BACK_LAYER + '</g>',
  '<g class="qcb-front">' + FRONT_LAYER + '</g>',
  '<rect class="qcb-shine" x="-46" y="0" width="46" height="100"'
    + ' fill="url(#' + SHINE_GRADIENT + ')" clip-path="url(#' + SHINE_CLIP + ')"/>',
  '</svg>',
  '</div>',
  '<div class="qcb-lockup">',
  '<div class="qcb-name" aria-label="' + BRAND_NAME + '">',
  Array.from(BRAND_NAME).map(glyph).join(''),
  '</div>',
  '<div class="qcb-latin">' + BRAND_LATIN + '</div>',
  '</div>',
  '</div>',
  '<div class="qcb-status" role="status">',
  '<span class="qcb-dot"></span>',
  '<span>' + STATUS + '</span>',
  '</div>',
].join('')

/**
 * Stylesheet for the splash. Every selector is scoped to the splash id and
 * every animation carries the 'qcb-' prefix, so the document keeps only this
 * element's own rules; colors are the QingClaw brand inks because the theme
 * tokens may not have arrived yet.
 */
export const BOOT_SPLASH_STYLE = `#qingclaw-boot {
  --qcb-canvas: #fff;
  --qcb-ink: #0c1417;
  --qcb-ink-faint: #647c80;
  --qcb-slate: #48707a;
  --qcb-teal: #4bb6b0;
  --qcb-aura: rgb(75 182 176 / 17%);
  --qcb-aura-mid: rgb(75 182 176 / 6%);
  --qcb-aura-fade: rgb(75 182 176 / 0%);
  --qcb-glow: rgb(75 182 176 / 45%);

  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--qcb-canvas);
  color: var(--qcb-ink);
  opacity: 1;
  transition: opacity 320ms ease-out;
}

body[data-ds-dark-theme] #qingclaw-boot {
  --qcb-canvas: #090d14;
  --qcb-ink: #f2f8f8;
  --qcb-ink-faint: #6e8c90;
  --qcb-slate: #7f9ea2;
  --qcb-aura: rgb(75 182 176 / 26%);
  --qcb-aura-mid: rgb(75 182 176 / 9%);
  --qcb-glow: rgb(75 182 176 / 55%);
}

#qingclaw-boot.qcb-out {
  opacity: 0;
  pointer-events: none;
}

#qingclaw-boot .qcb-aura {
  position: absolute;
  inset: 0;
  margin: auto;
  width: min(104vmin, 820px);
  height: min(104vmin, 820px);
  border-radius: 50%;
  corner-shape: round;
  background: radial-gradient(
    closest-side,
    var(--qcb-aura) 0%,
    var(--qcb-aura-mid) 40%,
    var(--qcb-aura-fade) 74%
  );
  pointer-events: none;
  animation: qcb-aura-in 1.1s ease-out both, qcb-breathe 13s ease-in-out 1.1s infinite;
}

#qingclaw-boot .qcb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 34px;
  padding-bottom: 12px;
}

#qingclaw-boot .qcb-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: 260px;
  height: 168px;
}

#qingclaw-boot .qcb-mark {
  position: relative;
  width: 168px;
  height: 168px;
  overflow: visible;
  animation: qcb-mark-settle 7s ease-in-out 1.4s infinite;
}

#qingclaw-boot .qcb-back,
#qingclaw-boot .qcb-front {
  transform-box: view-box;
  transform-origin: 50% 50%;
}

#qingclaw-boot .qcb-back {
  animation: qcb-dock-back 620ms cubic-bezier(0.2, 0.75, 0.25, 1) 60ms both;
}

#qingclaw-boot .qcb-front {
  animation: qcb-dock-front 620ms cubic-bezier(0.2, 0.75, 0.25, 1) 120ms both;
}

#qingclaw-boot .qcb-shine {
  opacity: 0;
  animation: qcb-shine 7.6s ease-in-out 2.6s infinite;
}

#qingclaw-boot .qcb-bloom {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 340px;
  height: 340px;
  border-radius: 50%;
  corner-shape: round;
  background: radial-gradient(closest-side, var(--qcb-glow), var(--qcb-aura-fade) 68%);
  opacity: 0;
  pointer-events: none;
  animation: qcb-bloom 900ms ease-out 460ms;
}

#qingclaw-boot .qcb-lockup {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

#qingclaw-boot .qcb-name {
  display: flex;
  align-items: baseline;
  font-size: 34px;
  line-height: 46px;
  font-weight: 500;
  letter-spacing: 0.2em;
  padding-left: 0.2em;
  color: var(--qcb-ink);
}

#qingclaw-boot .qcb-glyph {
  display: inline-block;
  opacity: 0;
  transform: translateY(16px);
  animation: qcb-glyph-in 560ms cubic-bezier(0.2, 0.7, 0.25, 1) forwards;
  animation-delay: calc(400ms + var(--qcb-glyph, 0) * 80ms);
}

#qingclaw-boot .qcb-latin {
  font-size: 10px;
  line-height: 16px;
  font-weight: 500;
  letter-spacing: 0.66em;
  padding-left: 0.66em;
  color: var(--qcb-slate);
  opacity: 0;
  animation: qcb-latin-settle 700ms cubic-bezier(0.2, 0.7, 0.25, 1) 760ms forwards;
}

#qingclaw-boot .qcb-status {
  position: absolute;
  bottom: 46px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.18em;
  color: var(--qcb-ink-faint);
  opacity: 0;
  animation: qcb-fade-in 600ms ease-out 900ms forwards;
}

#qingclaw-boot .qcb-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  corner-shape: round;
  background: var(--qcb-teal);
  animation: qcb-dot-pulse 2s ease-in-out infinite;
}

@keyframes qcb-aura-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes qcb-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
}

@keyframes qcb-mark-settle {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}

@keyframes qcb-dock-back {
  from { opacity: 0; transform: translate(-26px, 18px); }
  to { opacity: 1; transform: none; }
}

@keyframes qcb-dock-front {
  from { opacity: 0; transform: translate(30px, -16px); }
  to { opacity: 1; transform: none; }
}

@keyframes qcb-bloom {
  0% { opacity: 0; transform: scale(0.5); }
  30% { opacity: 0.9; }
  100% { opacity: 0; transform: scale(1.3); }
}

@keyframes qcb-glyph-in {
  to { opacity: 1; transform: none; }
}

@keyframes qcb-latin-settle {
  from { opacity: 0; letter-spacing: 1em; }
  to { opacity: 1; letter-spacing: 0.66em; }
}

@keyframes qcb-fade-in {
  to { opacity: 1; }
}

@keyframes qcb-shine {
  0% { opacity: 0; transform: translateX(-140px); }
  8% { opacity: 1; }
  42% { opacity: 1; }
  50% { opacity: 0; transform: translateX(140px); }
  100% { opacity: 0; transform: translateX(140px); }
}

@keyframes qcb-dot-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}

@media (max-height: 520px) {
  #qingclaw-boot .qcb-status {
    position: static;
    margin-top: 26px;
  }

  #qingclaw-boot .qcb-mark {
    width: 120px;
    height: 120px;
  }

  #qingclaw-boot .qcb-stage {
    width: 200px;
    height: 120px;
  }
}

@media (prefers-reduced-motion: reduce) {
  #qingclaw-boot .qcb-aura,
  #qingclaw-boot .qcb-mark,
  #qingclaw-boot .qcb-back,
  #qingclaw-boot .qcb-front,
  #qingclaw-boot .qcb-bloom,
  #qingclaw-boot .qcb-glyph,
  #qingclaw-boot .qcb-latin,
  #qingclaw-boot .qcb-status,
  #qingclaw-boot .qcb-dot,
  #qingclaw-boot .qcb-shine {
    animation: none;
  }

  #qingclaw-boot .qcb-glyph,
  #qingclaw-boot .qcb-latin,
  #qingclaw-boot .qcb-status {
    opacity: 1;
    transform: none;
  }

  #qingclaw-boot .qcb-shine {
    opacity: 0;
  }

  #qingclaw-boot {
    transition: none;
  }
}`

/** Milliseconds the splash spends fading out before it leaves the document. */
export const BOOT_SPLASH_FADE_MS = 320
/** Absolute cap: a shell that never draws its boot page still gets the screen back. */
export const BOOT_SPLASH_TIMEOUT_MS = 12_000

/**
 * Build the body script that mounts the splash and retires it.
 * @returns the inline script text.
 */
export function bootSplashScript(): string {
  return `(function () {
  var ID = ${JSON.stringify(BOOT_SPLASH_ID)}
  if (document.getElementById(ID) !== null) return
  var started = Date.now()
  var element = document.createElement('div')
  element.id = ID
  element.setAttribute('aria-busy', 'true')
  element.innerHTML = ${JSON.stringify(MARKUP)}
  document.body.appendChild(element)

  var seenBoot = false
  function finish() {
    if (element.classList.contains('qcb-out')) return
    element.setAttribute('aria-busy', 'false')
    element.className = 'qcb-out'
    setTimeout(function () { element.remove() }, ${String(BOOT_SPLASH_FADE_MS)})
  }

  var timer = setInterval(function () {
    var boot = document.querySelector('[data-dsh-boot]')
    var root = document.getElementById('root')
    if (boot !== null) seenBoot = true
    var application = root !== null && Array.prototype.some.call(root.children, function (child) {
      return child !== boot && !child.hasAttribute('data-dsh-boot')
    })
    // The shell drops the spinner when it switches to its own failure report;
    // that report has to stay readable, so the splash yields to it.
    var failed = boot !== null && boot.querySelector('[data-dsh-boot-spinner]') === null
    var expired = Date.now() - started > ${String(BOOT_SPLASH_TIMEOUT_MS)}
    if (failed || application || (seenBoot && boot === null) || expired) {
      clearInterval(timer)
      finish()
    }
  }, 120)
})()`
}

/**
 * Index-injection rows that paint the splash before the shell boots.
 * @returns the head style row followed by the body script row.
 */
export function bootSplashInjections(): IndexInjection[] {
  return [
    { kind: 'style', text: BOOT_SPLASH_STYLE },
    { kind: 'script', placement: 'body', text: bootSplashScript() },
  ]
}
