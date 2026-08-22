'use client'

import { useState, useTransition } from 'react'
import { advanceStage, sendSolicitation, fileClaim, type ActionResult } from '@/app/property/actions'
import type { WorkflowStage } from '@/lib/db/workflow'

/**
 * The stage controls.
 *
 * Transmitting actions are SHOWN, not hidden. A missing button teaches nothing;
 * a button that explains why it refused teaches the rule. In rehearsal the two
 * send actions and the file action return the statutory reason.
 */

interface Props {
  propertyId: string
  stage: WorkflowStage
  mode: 'rehearsal' | 'live'
  canFile: boolean
}

const NEXT: Partial<Record<WorkflowStage, { to: WorkflowStage; label: string }>> = {
  identified:       { to: 'locating',         label: 'Start locating the signer' },
  locating:         { to: 'chain_review',     label: 'Send chain for review' },
  chain_review:     { to: 'ready_to_contact', label: 'Approve chain — ready to contact' },
  ready_to_contact: { to: 'contacted',        label: 'Record solicitation sent' },
  contacted:        { to: 'agreement_sent',   label: 'Record agreement posted' },
  agreement_sent:   { to: 'signed',           label: 'Record signed agreement received' },
  signed:           { to: 'filed',            label: 'Record claim filed' },
  filed:            { to: 'approved',         label: 'Record DOR approval' },
  approved:         { to: 'paid',             label: 'Record payment received' },
}

export function StageActions({ propertyId, stage, mode, canFile }: Props) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => setResult(await fn()))

  const next = NEXT[stage]

  return (
    <div style={{ maxWidth: '46rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {/* Artifacts — these transmit nothing, so they always work. */}
        <a href={`/api/property/${propertyId}/letter`} target="_blank" rel="noreferrer" style={secondary}>
          Generate solicitation letter (PDF)
        </a>

        {next !== undefined && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => advanceStage(propertyId, next.to))}
            style={primary}
          >
            {pending ? 'Working…' : next.label}
          </button>
        )}

        {/* The transmitting actions. Shown deliberately. */}
        {stage === 'ready_to_contact' && (
          <button type="button" disabled={pending}
            onClick={() => run(() => sendSolicitation(propertyId))} style={gated}>
            Post it for real {mode === 'rehearsal' && '🔒'}
          </button>
        )}
        {stage === 'signed' && (
          <button type="button" disabled={pending}
            onClick={() => run(() => fileClaim(propertyId))} style={gated}>
            File with DOR {(!canFile || mode === 'rehearsal') && '🔒'}
          </button>
        )}

        <button type="button" disabled={pending}
          onClick={() => run(() => advanceStage(propertyId, 'closed_lost', 'Closed by staff'))}
          style={secondary}>
          Close
        </button>
      </div>

      {result !== null && (
        <p role="status" style={{
          marginTop: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '0.375rem',
          fontSize: '0.8125rem', whiteSpace: 'pre-wrap',
          background: result.ok ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}`,
          color: result.ok ? '#14532d' : '#7f1d1d',
        }}>
          {result.message}
        </p>
      )}
    </div>
  )
}

const base: React.CSSProperties = {
  padding: '0.5rem 0.85rem', borderRadius: '0.375rem', fontSize: '0.8125rem',
  cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
}
const primary: React.CSSProperties = { ...base, background: '#1c1917', color: '#fafaf9', border: 0 }
const secondary: React.CSSProperties = { ...base, background: '#fff', color: '#1c1917', border: '1px solid #d6d3d1' }
const gated: React.CSSProperties = { ...base, background: '#fff', color: '#7f1d1d', border: '1px solid #fecaca' }
