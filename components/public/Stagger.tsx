'use client'

import { useCallback, useRef } from 'react'
import { useReveal } from './useReveal'

const OBSERVER: IntersectionObserverInit = { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }

/**
 * Viewport stagger — children fade and rise in sequence as the group enters.
 *
 * The delay is capped at the eighth item: a twelve-item grid staggered linearly
 * ends with an element arriving half a second after the one above it, which
 * reads as lag rather than choreography. Safety rules live in useReveal.
 */
export function Stagger({
  children, className = '', as: Tag = 'div',
}: {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'ul' | 'ol'
}) {
  const ref = useRef<HTMLElement>(null)

  const delays = useCallback((root: HTMLElement) => {
    Array.from(root.children).forEach((child, i) => {
      ;(child as HTMLElement).style.setProperty('--item-delay', `${Math.min(i, 7) * 45}ms`)
    })
  }, [])

  useReveal(ref, 'is-in', OBSERVER, delays)

  return (
    <Tag ref={ref as never} className={`stagger ${className}`.trim()}>
      {children}
    </Tag>
  )
}
