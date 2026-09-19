/** Palette values mirrored into JS for canvas drawing (CSS vars can't be read
 *  per-pixel cheaply). Keep in sync with theme/tokens.css. */
export const BG = '#07080A'
export const PANEL = '#0E1013'
export const PANEL2 = '#141619'
export const PANEL3 = '#1B1E22'
export const LINE = 'rgba(255,255,255,0.075)'

export const DC = '#C68603'
export const DC_BRIGHT = '#FCAB03'
export const DC_DIM = '#684502'
export const CA = '#07A6C4'
export const CA_BRIGHT = '#0DD3F8'
export const CA_DIM = '#025767'
export const ALERT = '#FF0673'

export const INK0 = '#FCFCFC'
export const INK2 = '#868686'
export const INK3 = '#5D5D5D'
export const INK4 = '#3D3D3D'

/** Sequential, one hue, monotonic lightness — magnitude only, never identity. */
export const SEQ = ['#01343F', '#014B59', '#046375', '#037C92', '#0196B1', '#08B1D0', '#04CCF0']
export const AMB = ['#402801', '#5B3B02', '#774F03', '#956300', '#B37902', '#D38F04', '#F3A608']

export function ramp(steps: string[], t: number) {
  if (!Number.isFinite(t)) return steps[0]
  const i = Math.max(0, Math.min(steps.length - 1, Math.round(t * (steps.length - 1))))
  return steps[i]
}

/** Blend two hexes in sRGB — good enough for edge tinting. */
export function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export function alpha(hex: string, a: number) {
  const p = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${p[0]},${p[1]},${p[2]},${a})`
}

/** Device-pixel-ratio aware canvas sizing. Returns CSS-pixel dimensions. */
export function fitCanvas(cv: HTMLCanvasElement) {
  const r = cv.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.floor(r.width))
  const h = Math.max(1, Math.floor(r.height))
  if (cv.width !== w * dpr || cv.height !== h * dpr) {
    cv.width = w * dpr
    cv.height = h * dpr
  }
  const ctx = cv.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
}
