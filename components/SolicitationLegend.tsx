/**
 * The ONLY way to render the § 44-12-239(f) solicitation legend in React.
 *
 * Do not inline the legend text anywhere else. The CI gate in
 * scripts/verify-outbound-templates.ts fails the build if any template under
 * templates/outbound/** renders without this component — INCLUDING previews,
 * so it can never be forgotten in the one place a human looks.
 */

import { renderLegend } from '@/lib/compliance/legend'

export interface SolicitationLegendProps {
  /**
   * The LARGEST font size used anywhere in the body of this solicitation, in
   * points. The statute says the legend must be at least 12pt OR larger than the
   * font used, WHICHEVER IS LARGER — so this is a computed value, and passing
   * the wrong body size produces a non-compliant notice.
   */
  maxBodyPointSize: number
  className?: string
}

export function SolicitationLegend({
  maxBodyPointSize,
  className,
}: SolicitationLegendProps) {
  // Throws LegendUnverifiedError if the legend is not byte-verified.
  const legend = renderLegend(maxBodyPointSize)

  return (
    <p
      data-solicitation-legend="true"
      data-point-size={legend.pointSizePt}
      className={className}
      style={{
        fontSize: `${legend.pointSizePt}pt`,
        textTransform: 'uppercase',
        fontWeight: 700,
        lineHeight: 1.3,
        margin: '1em 0',
      }}
    >
      {legend.text}
    </p>
  )
}
