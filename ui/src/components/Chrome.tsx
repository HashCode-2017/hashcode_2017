/** Room texture: a masked hairline grid, a vignette, and a little film grain.
 *  All inert to pointers, all behind the content. */
export function Chrome() {
  return (
    <>
      <div className="chrome-grid" />
      <div className="chrome-vig" />
      <svg className="chrome-grain" aria-hidden>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </>
  )
}
