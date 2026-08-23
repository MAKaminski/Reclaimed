import { ImageResponse } from 'next/og'

/**
 * The touch icon, drawn rather than shipped.
 *
 * Same reasoning as `app/(public)/opengraph-image.tsx`: this repo deliberately
 * has no `public/` directory and no binary assets, so the icon is generated at
 * build time from the same geometry as `app/icon.svg`.
 *
 * Note this file sits at the app root, not under `app/(public)/`, so it is
 * outside `verify:templates`' public-surface scan. That is incidental, not a
 * loophole — there is no copy here to gate.
 */

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Apple masks the corners itself, so the plate is drawn edge to edge.
          background: '#00544d',
        }}
      >
        <svg width="112" height="112" viewBox="0 0 32 32">
          <g
            fill="none"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 22.5V16a7 7 0 0 1 14 0v4" />
            <path d="M19 20l4 4.5 4-4.5" />
          </g>
        </svg>
      </div>
    ),
    size,
  )
}
