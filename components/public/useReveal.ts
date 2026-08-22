'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Shared arming logic for the scroll reveals.
 *
 * These effects work by HIDING an element and relying on script to show it
 * again, which makes them a liability on a site whose entire purpose is telling
 * people how to claim their own money. Three guards, in order of importance:
 *
 * 1. Never arm unless the compositor is provably running. In a hidden or
 *    background document the browser throttles requestAnimationFrame, CSS
 *    transitions, AND IntersectionObserver — so the hide lands and the reveal
 *    may not. Arming inside rAF means a document that never paints never hides
 *    anything. (Found the hard way: measuring a hidden tab showed elements
 *    armed, never revealed, and stuck at opacity 0.)
 * 2. A failsafe timer reveals regardless if the observer never fires.
 * 3. Reduced motion skips the whole thing, so nothing is ever hidden.
 *
 * The animation is a nicety. The text is not.
 */
export function useReveal(
  ref: RefObject<HTMLElement | null>,
  revealedClass: 'is-revealed' | 'is-in',
  options: IntersectionObserverInit,
  onArm?: (root: HTMLElement) => void,
): void {
  useEffect(() => {
    const root = ref.current
    if (root === null) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (document.visibilityState !== 'visible') return

    let armed = false
    let observer: IntersectionObserver | null = null
    let failsafe = 0

    const raf = window.requestAnimationFrame(() => {
      armed = true
      onArm?.(root)
      root.classList.add('is-armed')

      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add(revealedClass)
          observer?.unobserve(entry.target)
        }
      }, options)
      observer.observe(root)

      failsafe = window.setTimeout(() => root.classList.add(revealedClass), 1600)
    })

    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(failsafe)
      observer?.disconnect()
      // If we never armed, nothing was hidden and there is nothing to undo.
      if (!armed) root.classList.remove('is-armed')
    }
  }, [ref, revealedClass, options, onArm])
}
