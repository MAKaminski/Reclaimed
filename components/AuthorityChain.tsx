import {
  EVIDENCE_KIND_LABEL,
  LINK_TYPE_LABEL,
  type ChainLink,
  type ChainVerdict,
} from '@/lib/db/authority'

/**
 * "Who may legally sign?" rendered as a chain, because that is what it is.
 *
 * § 44-12-224(b) voids a representative's claim on a defective agreement, so a
 * signature obtained from someone without authority does not fail politely — it
 * destroys the claim after the work is done. The verdict therefore leads with
 * the defects rather than the confidence number: a score invites overriding it,
 * a named defect invites fixing it.
 *
 * Read-only on purpose. authority_links.evidence_document_id is NOT NULL, which
 * is the schema refusing to let a link be asserted without a document behind it;
 * honouring that means the authoring flow lives with document upload, not here.
 */
export function AuthorityChain({ verdict, links }: {
  verdict: ChainVerdict | null
  links: ChainLink[]
}) {
  if (verdict === null && links.length === 0) {
    return (
      <p style={{ fontSize: '0.8125rem', color: '#57534e', maxWidth: '46rem', margin: 0 }}>
        No authority chain has been built for this property. For an
        individually-owned property with a living owner that is expected — the
        chain matters where entitlement is not obvious: entity owners, dissolved
        companies, deceased owners, heirs.
      </p>
    )
  }

  const ok = verdict?.submittable === true

  return (
    <div style={{ maxWidth: '46rem' }}>
      <div
        style={{
          border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
          background: ok ? '#f0fdf4' : '#fef2f2',
          borderRadius: '0.5rem',
          padding: '0.9rem 1rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <strong style={{ color: ok ? '#166534' : '#991b1b' }}>
            {ok ? 'Chain is submittable' : 'Not submittable'}
          </strong>
          {verdict?.chainConfidence !== null && verdict !== null && (
            <span style={{ fontSize: '0.8125rem', color: '#57534e', fontVariantNumeric: 'tabular-nums' }}>
              weakest link {verdict.chainConfidence?.toFixed(2)}
              {verdict.threshold !== null && ` · threshold ${verdict.threshold.toFixed(2)}`}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#a8a29e' }}>
            O.C.G.A. § 44-12-224(b)
          </span>
        </div>

        {verdict !== null && verdict.reasons.length > 0 && (
          <ul style={{
            margin: '0.5rem 0 0', paddingLeft: '1.1rem',
            fontSize: '0.8125rem', color: '#7f1d1d',
          }}>
            {verdict.reasons.map((r) => <li key={r} style={{ marginBottom: '0.15rem' }}>{r}</li>)}
          </ul>
        )}
      </div>

      {links.length > 0 && (
        <ol style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0' }}>
          {links.map((link, i) => (
            <li key={link.sequence} style={{ display: 'flex', gap: '0.75rem' }}>
              {/* Rail: the chain is a sequence, and a gap in it is a defect the
                  verdict names. Drawing it as connected steps makes a missing
                  sequence number visible rather than merely reported. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: '1.5rem', height: '1.5rem', borderRadius: '50%', flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  fontSize: '0.7rem', fontWeight: 600,
                  background: STATUS_STYLE[link.reviewStatus].dot,
                  color: STATUS_STYLE[link.reviewStatus].dotText,
                }}>
                  {link.sequence}
                </div>
                {i < links.length - 1 && (
                  <div style={{ width: 1, flex: 1, minHeight: '1.25rem', background: '#e7e5e4' }} />
                )}
              </div>

              <div style={{ paddingBottom: '1rem', flex: 1 }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.875rem' }}>
                    {LINK_TYPE_LABEL[link.linkType] ?? link.linkType.replace(/_/g, ' ')}
                  </strong>
                  <span style={{
                    fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em',
                    color: STATUS_STYLE[link.reviewStatus].text,
                  }}>
                    {link.reviewStatus}
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.75rem', color: '#78716c',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {link.confidence.toFixed(2)}
                  </span>
                </div>

                {(link.fromRef !== null || link.toRef !== null) && (
                  <div style={{ fontSize: '0.8125rem', color: '#57534e', marginTop: '0.15rem' }}>
                    {link.fromRef ?? '—'} <span style={{ color: '#a8a29e' }}>→</span> {link.toRef ?? '—'}
                  </div>
                )}

                {link.entityName !== null && (
                  <div style={{ fontSize: '0.75rem', color: '#57534e', marginTop: '0.15rem' }}>
                    {link.entityName}
                    {link.entityStatus !== null && (
                      <span style={{
                        color: link.entityStatus === 'active' ? '#15803d' : '#a16207',
                        marginLeft: '0.35rem',
                      }}>
                        · {link.entityStatus.replace(/_/g, ' ')}
                        {link.entityStatus !== 'active' &&
                          ' — DOR publishes no requirements for this case (DOR-QUESTIONS #3); a named human must review'}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {link.evidenceKind === null ? (
                    <span style={{ color: '#b91c1c' }}>No evidence document</span>
                  ) : link.evidenceInvalidatedAt !== null ? (
                    <span style={{ color: '#b91c1c' }}>
                      {EVIDENCE_KIND_LABEL[link.evidenceKind] ?? link.evidenceKind} — INVALIDATED{' '}
                      {link.evidenceInvalidatedAt.slice(0, 10)}
                    </span>
                  ) : (
                    <span style={{ color: '#78716c' }}>
                      {EVIDENCE_KIND_LABEL[link.evidenceKind] ?? link.evidenceKind}
                      {link.evidenceDescription !== null && ` · ${link.evidenceDescription}`}
                    </span>
                  )}
                </div>

                {link.reviewNote !== null && (
                  <p style={{ fontSize: '0.75rem', color: '#57534e', margin: '0.25rem 0 0', fontStyle: 'italic' }}>
                    {link.reviewNote}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const STATUS_STYLE: Record<ChainLink['reviewStatus'], { dot: string; dotText: string; text: string }> = {
  asserted: { dot: '#e7e5e4', dotText: '#57534e', text: '#a16207' },
  reviewed: { dot: '#166534', dotText: '#ffffff', text: '#15803d' },
  rejected: { dot: '#b91c1c', dotText: '#ffffff', text: '#b91c1c' },
}
