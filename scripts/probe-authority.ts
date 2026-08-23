/**
 * Probe the authority chain end to end — inside a transaction that is ROLLED BACK.
 *
 *   pnpm probe:authority
 *
 * The authority chain is the step the business rests on — § 44-12-224(b) voids a
 * representative's claim on a defective agreement — and it existed only in the
 * schema. Nothing rendered it, so chain_submittable() had never been exercised
 * against real rows and the "Prove" phase of the board was a permanent zero.
 *
 * This began as a fixture SEEDER and had to become a probe, which is worth
 * recording because the reason is a real property of the schema:
 *
 *     authority_links   ON DELETE DO INSTEAD NOTHING
 *     evidence_documents ON DELETE DO INSTEAD NOTHING
 *
 * Authority evidence is APPEND-ONLY. You cannot un-assert a link; you reject it
 * on review, and the rejection is itself a record. That is correct — the whole
 * point is that nobody can quietly delete the evidence a claim rested on — but
 * it means synthetic "evidence of legal authority" written into this database
 * could never be removed. Seeding demo rows into it is therefore a one-way
 * operation on the exact table where ambiguity is least acceptable.
 *
 * So nothing is persisted. Three chains are built inside a transaction, the
 * verdicts are read back, and the transaction is rolled back. What that proves
 * is what the seeder would have proved — that the schema, the function and the
 * queries behind the UI agree — without leaving a synthetic authority record in
 * a compliance system.
 *
 * Three chains, chosen for three DIFFERENT verdicts, because a fixture that only
 * shows the happy path proves the least interesting thing:
 *
 *   PEACHTREE VENTURES, LLC     complete, reviewed, active entity  -> submittable
 *   ATHENS CAPITAL PARTNERS LP  entity administratively dissolved  -> manual review
 *   MARIETTA PROPERTIES, INC    a sequence gap and an unreviewed link -> blocked
 *
 * Still fenced, because the transaction is open for the duration: it refuses to
 * run outside rehearsal mode, it creates its own ephemeral properties rather than
 * relying on seeded ones, and it refuses to touch any property_id that already
 * exists.
 */

import { getOperatingMode } from '@/lib/compliance/operatingMode'
import { closeSql, getSql } from '@/lib/db/client'

/** Not a real bucket. Nothing here is persisted, but the value should still
 *  be unmistakable if it ever appeared in a log. */
const FIXTURE_PREFIX = 'fixture://authority/'

interface LinkSpec {
  sequence: number
  linkType: string
  fromRef: string
  toRef: string
  confidence: number
  reviewStatus: 'asserted' | 'reviewed' | 'rejected'
  evidenceKind: string
  entity?: { name: string; status: string }
}

interface ChainSpec {
  propertyId: string
  label: string
  expect: string
  links: LinkSpec[]
}

const CHAINS: ChainSpec[] = [
  {
    propertyId: 'GA0004821993',
    label: 'PEACHTREE VENTURES, LLC',
    expect: 'submittable — every link evidenced and reviewed, entity active',
    links: [
      { sequence: 1, linkType: 'owner_name_to_entity', fromRef: 'PEACHTREE VENTURES, LLC',
        toRef: 'SOS 07041234', confidence: 0.97, reviewStatus: 'reviewed',
        evidenceKind: 'sos_entity_record', entity: { name: 'PEACHTREE VENTURES, LLC', status: 'active' } },
      { sequence: 2, linkType: 'entity_status', fromRef: 'SOS 07041234', toRef: 'active',
        confidence: 0.96, reviewStatus: 'reviewed', evidenceKind: 'sos_entity_record' },
      { sequence: 3, linkType: 'authorized_signer', fromRef: 'SOS 07041234', toRef: 'DANIELLE OKAFOR, Manager',
        confidence: 0.93, reviewStatus: 'reviewed', evidenceKind: 'corporate_resolution' },
      { sequence: 4, linkType: 'signer_identity', fromRef: 'DANIELLE OKAFOR, Manager', toRef: 'GA DL ****4417',
        confidence: 0.95, reviewStatus: 'reviewed', evidenceKind: 'government_id' },
    ],
  },
  {
    propertyId: 'GA0004822233',
    label: 'ATHENS CAPITAL PARTNERS LP',
    expect: 'manual review — entity administratively dissolved (DOR-QUESTIONS #3)',
    links: [
      { sequence: 1, linkType: 'owner_name_to_entity', fromRef: 'ATHENS CAPITAL PARTNERS LP',
        toRef: 'SOS 09118876', confidence: 0.94, reviewStatus: 'reviewed',
        evidenceKind: 'sos_entity_record',
        entity: { name: 'ATHENS CAPITAL PARTNERS LP', status: 'admin_dissolved' } },
      { sequence: 2, linkType: 'entity_status', fromRef: 'SOS 09118876', toRef: 'admin_dissolved 2019-11-02',
        confidence: 0.91, reviewStatus: 'reviewed', evidenceKind: 'sos_entity_record' },
      { sequence: 3, linkType: 'authorized_signer', fromRef: 'SOS 09118876', toRef: 'R. PATEL, General Partner',
        confidence: 0.78, reviewStatus: 'asserted', evidenceKind: 'authorization_letter' },
    ],
  },
  {
    propertyId: 'GA0004822456',
    label: 'MARIETTA PROPERTIES, INC',
    // sequence 1 then 3: max(sequence)=3 but count=2, so sequence_contiguous is
    // false and the verdict must say a step was skipped.
    expect: 'blocked — sequence gap plus an unreviewed link',
    links: [
      { sequence: 1, linkType: 'owner_name_to_entity', fromRef: 'MARIETTA PROPERTIES, INC',
        toRef: 'SOS 05553321', confidence: 0.92, reviewStatus: 'reviewed',
        evidenceKind: 'sos_entity_record', entity: { name: 'MARIETTA PROPERTIES, INC', status: 'active' } },
      { sequence: 3, linkType: 'signer_identity', fromRef: 'UNKNOWN OFFICER', toRef: 'unverified',
        confidence: 0.41, reviewStatus: 'asserted', evidenceKind: 'other' },
    ],
  },
]

async function main(): Promise<void> {
  const mode = getOperatingMode()
  const sql = getSql()

  if (mode.mode !== 'rehearsal') {
    console.error(
      '\n✗ Refusing to run outside rehearsal mode.\n\n' +
      '  This builds rows that look like evidence of legal authority to sign a\n' +
      '  claim. They are rolled back, but they exist for the life of the\n' +
      '  transaction, and § 44-12-224(b) makes an unauthorised signature fatal\n' +
      `  to the claim.\n\n  Current mode: ${mode.mode} — ${mode.reason}\n`,
    )
    process.exit(1)
  }

  const [staff] = await sql<Array<{ id: string }>>`
    select id from staff where role = 'admin' order by created_at limit 1`
  if (staff === undefined) {
    console.error('\n✗ No admin staff row exists. Sign in once first.\n')
    process.exit(1)
  }

  console.log('\nAuthority chain probe — everything below is rolled back\n')

  // sql.begin() rolls back automatically if the callback throws. Throwing a
  // sentinel at the end is how the rollback is made unconditional: there is no
  // path through this function that commits.
  class Rollback extends Error {
    constructor(readonly report: string[]) { super('probe complete') }
  }

  try {
    await sql.begin(async (tx) => {
      const report: string[] = []
      let created = 0

      for (const chain of CHAINS) {
        // The probe creates its own properties rather than depending on seeded
        // ones. It used to require a FIXTURE-DEMO row, which quietly turned this
        // into a no-op the moment the demo rows were deleted — a probe that
        // silently stops probing is worse than no probe.
        //
        // Refusing to touch an EXISTING property is the safety property that
        // matters, and it is stronger this way: if the id is already present,
        // something real is there and we stop rather than attach synthetic
        // authority evidence to it.
        const [existing] = await tx<Array<{ property_id: string }>>`
          select property_id from properties where property_id = ${chain.propertyId}`
        if (existing !== undefined) {
          report.push(`  ✗ ${chain.propertyId} already exists — skipped, will not touch a real record`)
          continue
        }

        await tx`
          insert into properties (property_id, owner_name, owner_class, source_key)
          values (${chain.propertyId}, ${chain.label}, 'entity', ${'PROBE-EPHEMERAL'})`

        for (const link of chain.links) {
          let entityId: string | null = null
          if (link.entity !== undefined) {
            const [ent] = await tx<Array<{ id: string }>>`
              insert into entities (sos_control_number, legal_name, status)
              values (${'FIXTURE-' + chain.propertyId + '-' + link.sequence},
                      ${link.entity.name}, ${link.entity.status}::entity_status)
              returning id`
            entityId = ent?.id ?? null
          }

          const [doc] = await tx<Array<{ id: string }>>`
            insert into evidence_documents
              (kind, storage_path, sha256, byte_size, uploaded_by, description)
            values (
              ${link.evidenceKind}::evidence_kind,
              ${FIXTURE_PREFIX + chain.propertyId + '/' + link.sequence},
              ${'fixture-' + chain.propertyId.toLowerCase() + '-' + link.sequence},
              1024, ${staff.id},
              ${'SYNTHETIC rehearsal evidence — not a real document'}
            ) returning id`

          await tx`
            insert into authority_links
              (property_id, sequence, link_type, from_ref, to_ref, entity_id,
               evidence_document_id, confidence, review_status, asserted_by,
               reviewed_by, reviewed_at, review_note)
            values (
              ${chain.propertyId}, ${link.sequence}, ${link.linkType}::authority_link_type,
              ${link.fromRef}, ${link.toRef}, ${entityId}, ${doc!.id},
              ${link.confidence}, ${link.reviewStatus}::link_review_status, ${staff.id},
              ${link.reviewStatus === 'reviewed' ? staff.id : null},
              ${link.reviewStatus === 'reviewed' ? new Date().toISOString() : null},
              ${link.reviewStatus === 'reviewed' ? 'SYNTHETIC rehearsal review' : null}
            )`
          created += 1
        }
      }

      report.push(`  ${created} link(s) built across ${CHAINS.length} chains.\n`)

      for (const chain of CHAINS) {
        const [v] = await tx<Array<{
          submittable: boolean; chain_confidence: string | null
          threshold: string | null; reasons: string[]
        }>>`select * from chain_submittable(${chain.propertyId})`

        const verdict = v?.submittable === true ? 'SUBMITTABLE' : 'blocked'
        report.push(`  ${chain.propertyId}  ${chain.label}`)
        report.push(`    verdict   ${verdict}  (weakest link ${v?.chain_confidence ?? '—'}` +
          `, threshold ${v?.threshold ?? '—'})`)
        report.push(`    expected  ${chain.expect}`)
        for (const r of v?.reasons ?? []) report.push(`      · ${r}`)

        // The shape the UI reads, proven against the same rows.
        const links = await tx<Array<Record<string, unknown>>>`
          select al.sequence, al.link_type, al.review_status, e.kind, ent.status
          from authority_links al
          join evidence_documents e on e.id = al.evidence_document_id
          left join entities ent on ent.id = al.entity_id
          where al.property_id = ${chain.propertyId} order by al.sequence`
        report.push(`    links     ${links.length} readable with evidence joined`)
        report.push('')
      }

      throw new Rollback(report)
    })
  } catch (error) {
    if (error instanceof Rollback) {
      for (const line of error.report) console.log(line)
      console.log('  ↩ rolled back — nothing persisted.\n')
    } else {
      throw error
    }
  }

  // Prove it, rather than asserting it.
  const [after] = await sql<Array<{ links: string; docs: string; ents: string }>>`
    select (select count(*) from authority_links)::text    as links,
           (select count(*) from evidence_documents)::text as docs,
           (select count(*) from entities)::text           as ents`
  console.log(`  after rollback: authority_links=${after?.links} ` +
    `evidence_documents=${after?.docs} entities=${after?.ents}\n`)

  await closeSql()
}

void main()
