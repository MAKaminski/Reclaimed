/**
 * The compliance core. Every guardrail in build-spec §1 lives behind this
 * barrel, so a reviewer can see the whole surface in one import list.
 *
 * These are pure functions with no I/O except the explicitly-marked HTTP client.
 */

export * from './env'
export * from './money'
export * from './computeFee'
export * from './legend'
export * from './legendPdf'
export * from './brandGuard'
export * from './registration'
export * from './windows'
export * from './blockedHosts'
export * from './stateRules'
export * from './channels'
export * from './legendSurfaces'
export * from './offerState'
export * from './featureFlags'
