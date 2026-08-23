import { cents, formatUsd } from '@/lib/compliance/money'
import type { CompositionRow } from '@/lib/db/holdings'

/**
 * Composition, with the reason each dimension is on the page.
 *
 * The question this answers is a fair one: why show property type, holder and
 * owner class at all? They look like metadata. They are not — each one decides
 * something that changes whether a record is worth touching, and the text under
 * each heading says which. A dashboard that shows a number without saying what
 * decision it informs is decoration.
 */

interface Dimension {
  key: string
  heading: string
  why: string
  rows: CompositionRow[] | null
  labelHeading: string
}

export function HoldingsComposition({ classes, types, holders }: {
  classes: CompositionRow[] | null
  types: CompositionRow[] | null
  holders: CompositionRow[] | null
}) {
  const dimensions: Dimension[] = [
    {
      key: 'class',
      heading: 'Who owns it',
      labelHeading: 'Class',
      why:
        'The one field that decides whether Georgia pays it out without us. SB 403 auto-pay ' +
        'under § 44-12-220(d.1)(1) reaches sole-owner natural-person cash only, so joint and ' +
        'entity-owned records are structurally outside it. The state is draining the tier we ' +
        'cannot serve and leaving the tier we can — this mix is the addressable market, not a ' +
        'demographic breakdown.',
      rows: classes,
    },
    {
      key: 'type',
      heading: 'What it is',
      labelHeading: 'NAUPA type',
      why:
        'Decides the documentary burden, and whether it is cash at all. Securities carry a ' +
        'CUSIP and a valuation date and may already have been sold, so what you receive is ' +
        'proceeds rather than shares. Safe deposit contents are often auctioned. Type is also ' +
        'what lets a record with no reported value become workable, through ' +
        'is_material_non_cash().',
      rows: types,
    },
    {
      key: 'holder',
      heading: 'Who reported it',
      labelHeading: 'Holder',
      why:
        'Concentration is leverage. One holder with hundreds of records is one documentation ' +
        'practice to learn rather than hundreds, and its claims answer to the same process. ' +
        'It cuts the other way too: a dissolved or merged holder is a chain-of-title problem ' +
        'before any owner-side work begins.',
      rows: holders,
    },
  ]

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {dimensions.map((d) => (
        <section key={d.key}>
          <h3 style={{ fontSize: 'var(--fs-h3)', margin: 0 }}>{d.heading}</h3>
          <p style={{
            margin: '0.3rem 0 0.75rem', fontSize: '0.8125rem',
            color: '#57534e', maxWidth: '52rem',
          }}>
            {d.why}
          </p>

          {d.rows === null ? (
            <p style={{ fontSize: '0.8125rem', color: '#a8a29e' }}>Staff access required.</p>
          ) : d.rows.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: '#a8a29e' }}>Nothing loaded.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{
                    textAlign: 'left', color: '#78716c',
                    fontSize: '0.75rem', textTransform: 'uppercase',
                  }}>
                    <th style={{ padding: '0.4rem 0.75rem 0.4rem 0' }}>{d.labelHeading}</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>Records</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>Reported value</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>
                      {d.key === 'holder' ? 'Outside auto-pay' : 'Joint'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => {
                    // For a holder, the commercially interesting subset is
                    // everything SB 403 cannot reach, which is joint PLUS
                    // entity-owned. For class and type the joint count alone is
                    // the meaningful one — entity is already its own row.
                    const outside = d.key === 'holder'
                      ? r.multiOwnerRows + r.entityRows
                      : r.multiOwnerRows
                    return (
                      <tr key={r.label} style={{ borderTop: '1px solid #e7e5e4' }}>
                        <td style={{ padding: '0.5rem 0.75rem 0.5rem 0' }}>{r.label}</td>
                        <td style={{
                          padding: '0.5rem 0.75rem', textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {r.rows.toLocaleString('en-US')}
                        </td>
                        <td style={{
                          padding: '0.5rem 0.75rem', textAlign: 'right',
                          fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        }}>
                          {formatUsd(cents(r.totalCents))}
                        </td>
                        <td style={{
                          padding: '0.5rem 0.75rem', textAlign: 'right',
                          color: outside > 0 ? '#166534' : '#a8a29e',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {outside.toLocaleString('en-US')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
