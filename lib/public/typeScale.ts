/**
 * The public type scale — and why it is declared in POINTS.
 *
 * § 44-12-239(f) sizes the legend at "at least 12 point type OR in a font
 * larger than the font utilized in the solicitation, WHICHEVER IS LARGER."
 * `requiredLegendPointSize()` implements that as max(12, floor(largest) + 1).
 *
 * The consequence is easy to miss until go-live: once we are registered, THE
 * LEGEND IS BY CONSTRUCTION THE LARGEST TEXT ON THE PAGE. There is no design in
 * which a 48pt hero coexists with a discreet legend — that hero would force a
 * 49pt notice.
 *
 * So the scale is capped here, in one constant, and CI forbids raw `fontSize:`
 * literals anywhere in the public tree. Raising the hero raises the legend.
 * The tradeoff is visible in a diff rather than discovered in production.
 *
 * WHERE THE CAP IS SET, AND WHY 36 AND NOT 150.
 *
 * The reference design system this page's visual language comes from uses
 * `--fs-display: clamp(3rem, 12vw, 12.5rem)` — up to 200px, or 150pt. Adopting
 * that verbatim would force a 151pt legal notice the day registration goes
 * active: a page that is mostly one disclaimer.
 *
 * 36pt (48px) is the compromise. It gives the hero real editorial presence,
 * and the resulting 37pt legend reads as a prominent disclosure banner rather
 * than an absurdity — which is, arguably, exactly what § 44-12-239(f) is asking
 * for. The drama in this design comes from motion, contrast, space and
 * composition, none of which the statute constrains at all.
 *
 * Raise this and the legend rises with it, one point above. That is the whole
 * tradeoff, in one number.
 *
 * 1pt = 4/3 CSS px. `globals.css` mirrors these as --fs-* in px.
 */

export const PUBLIC_TYPE_SCALE = {
  small: 9.75,   // 13px
  body: 12,      // 16px
  h3: 15,        // 20px
  h2: 24,        // 32px
  display: 36,   // 48px — the hero, and the cap that sets the legend budget
} as const

export type PublicTypeStep = keyof typeof PUBLIC_TYPE_SCALE

/** The largest step. The legend renders one point above this once we are live. */
export const PUBLIC_MAX_POINT_SIZE = Math.max(
  ...Object.values(PUBLIC_TYPE_SCALE),
)

export function pointsToPx(pt: number): number {
  return Math.round(pt * (4 / 3))
}
