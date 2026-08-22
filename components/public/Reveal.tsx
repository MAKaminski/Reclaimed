'use client'

import { useCallback, useRef } from 'react'
import { useReveal } from './useReveal'

const OBSERVER: IntersectionObserverInit = { threshold: 0.2 }

/**
 * Line-by-line entrance for a headline.
 *
 * NO MASK, NO CLIPPING, NO OPACITY. Earlier versions wrapped each line in an
 * `overflow: hidden` span and translated it 110% — the signature editorial
 * reveal — and the headline rendered as blank space. Every other element on the
 * page painted; only the text inside the mask spans did not.
 *
 * The headline is the single most important string on this site. It does not
 * get clever markup. Each line is a plain block that slides half a line into
 * place, so the worst case if the animation never runs is text sitting a few
 * pixels low, which nobody will ever notice.
 */
export function Reveal({
  lines, as: Tag = 'h1', className = '',
}: {
  lines: readonly string[]
  as?: 'h1' | 'h2' | 'p'
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)

  const stagger = useCallback((root: HTMLElement) => {
    root.querySelectorAll<HTMLElement>('.reveal__line').forEach((line, i) => {
      line.style.setProperty('--reveal-delay', `${i * 70}ms`)
    })
  }, [])

  useReveal(ref, 'is-revealed', OBSERVER, stagger)

  return (
    <Tag ref={ref as never} className={`reveal ${className}`.trim()}>
      {lines.map((line, i) => (
        <span className="reveal__line" key={line}>
          {line}
          {i < lines.length - 1 && ' '}
        </span>
      ))}
    </Tag>
  )
}
