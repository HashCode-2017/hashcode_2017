const NB = '\u2009' // thin space: groups digits without the comma's visual noise

export const int = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, NB)
export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`

export function ms(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`
  return `${n.toFixed(n < 10 ? 1 : 0)} ms`
}

export function bytes(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} kB`
  return `${n} B`
}

/** 1_000_241_830 -> "1.00 B". Keeps huge request totals readable in a tile. */
export function compact(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`
  return String(n)
}

export const mb = (n: number) => `${int(n)} MB`
