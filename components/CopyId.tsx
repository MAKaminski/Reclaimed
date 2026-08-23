'use client'

import { useState } from 'react'

/**
 * The property ID is the only thing that links our row to the state's record —
 * California has no per-property URL, so the workflow is genuinely "copy this,
 * paste it into their search". Making that one click is the whole point.
 */
export function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(id).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        })
      }}
      title={`Copy ${id} to the clipboard`}
      style={{
        font: 'inherit',
        color: copied ? '#15803d' : '#a8a29e',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
      }}
    >
      {copied ? 'copied ✓' : id}
    </button>
  )
}
