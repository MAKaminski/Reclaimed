import { getStateRules, getSeedMeta } from '@/lib/compliance/stateRules'
import { readRegistrationState, checkRegistration } from '@/lib/compliance/registration'
import { CHANNEL_POLICY, type Channel } from '@/lib/compliance/channels'
import { ALL_FLAGS, isFlagEnabled } from '@/lib/compliance/featureFlags'
import { getLegendAttestation } from '@/lib/compliance/legend'

export default function Home() {
  const ga = getStateRules('GA')
  const meta = getSeedMeta()
  const state = readRegistrationState()
  const attestation = getLegendAttestation()

  const gates: Array<[string, boolean, string]> = [
    ['Solicit owners', checkRegistration('solicit', state).permitted, '§ 44-12-239.2(a)(10)'],
    ['Generate agreements', checkRegistration('generate_agreement', state).permitted, '§ 44-12-224(c)(6)'],
    ['Submit claims', checkRegistration('submit_claim', state).permitted, '§ 44-12-239.2(a)(10)'],
    ['Receive DOR bulk data', checkRegistration('receive_data', state).permitted, '§ 44-12-239.1(a)'],
  ]

  return (
    <>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>CDR Operations</h1>
      <p style={{ color: '#57534e', marginTop: 0 }}>
        Georgia unclaimed property recovery. Staff only — there is no public data
        surface, by design (§ 44-12-239.1(b)).
      </p>
      <p style={{ marginTop: '0.5rem' }}>
        <a href="/workflow" style={{ color: '#1c1917' }}>
          Workflow — who does what, and what you can do right now →
        </a>
      </p>

      <Section title="Operational gates">
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {gates.map(([label, permitted, cite]) => (
              <tr key={label} style={{ borderTop: '1px solid #e7e5e4' }}>
                <td style={{ padding: '0.5rem 0' }}>{label}</td>
                <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>
                  {permitted ? 'permitted' : 'blocked'}
                </td>
                <td style={{ padding: '0.5rem 0', color: '#78716c', fontSize: '0.8125rem' }}>
                  {cite}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Georgia rules in force">
        <Fact label="Fee cap" value={`${ga.feeCapPct}% of min(claimed, value), costs included`} />
        <Fact label="Advance fees" value={ga.advanceFeesPermitted ? 'PERMITTED' : 'PROHIBITED'} />
        <Fact label="Payee model" value={String(ga.payeeModel)} />
        <Fact label="Properties per agreement" value={`${ga.maxPropertiesPerRecoveryAgreement} recovery / ${ga.maxPropertiesPerPurchaseAgreement} purchase`} />
        <Fact label="Unenforceability window" value={`${ga.unenforceabilityDays} days`} />
        <Fact label="Rules verified" value={String(meta.researchedAt)} />
      </Section>

      <Section title="Outbound channels">
        {(Object.keys(CHANNEL_POLICY) as Channel[]).map((channel) => (
          <Fact
            key={channel}
            label={channel}
            value={
              CHANNEL_POLICY[channel].enabled
                ? 'enabled'
                : CHANNEL_POLICY[channel].implemented
                  ? 'disabled'
                  : 'not implemented'
            }
          />
        ))}
      </Section>

      <Section title="Legally-unresolved flags">
        {ALL_FLAGS.map((flag) => (
          <Fact
            key={flag.envVar}
            label={flag.envVar}
            value={isFlagEnabled(flag) ? 'ON — see startup warning' : 'off'}
          />
        ))}
      </Section>

      <Section title="Solicitation legend">
        <Fact label="Status" value={attestation.status} />
        <Fact label="Source" value={attestation.source ?? '—'} />
        <Fact label="Verified at" value={attestation.verifiedAt ?? '—'} />
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#78716c' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', padding: '0.35rem 0', borderTop: '1px solid #e7e5e4' }}>
      <span style={{ minWidth: '14rem', color: '#57534e' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}
