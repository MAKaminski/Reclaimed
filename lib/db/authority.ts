import { createClient } from '@/lib/db/supabase'

/**
 * The authority chain — "who may legally sign?"
 *
 * This is the step the whole business rests on. O.C.G.A. § 44-12-224(b) voids a
 * representative's claim on a defective agreement, so a signature from someone
 * who turns out not to have had authority does not merely fail: it destroys the
 * claim. For an entity-owned or deceased-owner property the answer is a CHAIN —
 * owner name to entity, entity to its current status, status to a successor,
 * successor to an authorized signer, signer to a verified identity — and the
 * chain is only as good as its weakest link.
 *
 * chain_submittable() is the only per-claim qualification gate in the system and
 * it deliberately returns REASONS rather than a score. A score invites overriding
 * it; a list of named defects invites fixing them.
 *
 * Everything here is read-only. Asserting a link means uploading an evidence
 * document, and evidence_documents.evidence_document_id is NOT NULL on
 * authority_links precisely so that a link cannot be asserted without one —
 * that flow belongs with document storage, not on a detail page.
 */

export interface ChainVerdict {
  submittable: boolean
  chainConfidence: number | null
  threshold: number | null
  reasons: string[]
}

export interface ChainLink {
  sequence: number
  linkType: string
  fromRef: string | null
  toRef: string | null
  confidence: number
  reviewStatus: 'asserted' | 'reviewed' | 'rejected'
  assertedAt: string
  reviewedAt: string | null
  reviewNote: string | null
  evidenceKind: string | null
  evidenceInvalidatedAt: string | null
  evidenceDescription: string | null
  entityStatus: string | null
  entityName: string | null
}

/** Reads as a sentence in the UI: "owner name → entity". */
export const LINK_TYPE_LABEL: Record<string, string> = {
  owner_name_to_entity: 'Owner name → entity',
  entity_status: 'Entity status',
  successor_entity: 'Successor entity',
  authorized_signer: 'Authorized signer',
  signer_identity: 'Signer identity',
  decedent_death: 'Death of owner',
  heir_enumeration: 'Heirs enumerated',
  individual_identity: 'Individual identity',
}

export const EVIDENCE_KIND_LABEL: Record<string, string> = {
  sos_entity_record: 'Secretary of State entity record',
  sos_officer_record: 'Secretary of State officer record',
  corporate_resolution: 'Corporate resolution',
  secretary_certificate: "Secretary's certificate",
  ein_letter_cp575: 'EIN letter (CP-575)',
  work_id_card: 'Work ID card',
  authorization_letter: 'Authorization letter',
  government_id: 'Government ID',
  death_certificate: 'Death certificate',
  will_or_codicil: 'Will or codicil',
  probate_document: 'Probate document',
  heir_affidavit: 'Heir affidavit',
  merger_certificate: 'Merger certificate',
  name_change_amendment: 'Name-change amendment',
  proof_of_payment: 'Proof of payment',
  signed_agreement: 'Signed agreement',
  other: 'Other',
}

/**
 * Returns null when the RPC is unavailable rather than throwing. The function
 * raises 42501 for a caller with no staff row, and a detail page that 500s on a
 * permission check teaches nothing; the caller renders the staff-gate message.
 */
export async function getChainVerdict(propertyId: string): Promise<ChainVerdict | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('chain_submittable', { p_property_id: propertyId })

  if (error !== null) return null
  // The function RETURNS TABLE(...), so PostgREST sends an array. The generated
  // client types have no schema for it, hence the single narrowing cast here
  // rather than `unknown` leaking into every field access below.
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
  const row = rows[0]
  if (row === undefined) return null

  return {
    submittable: row.submittable === true,
    chainConfidence: row.chain_confidence === null ? null : Number(row.chain_confidence),
    threshold: row.threshold === null ? null : Number(row.threshold),
    reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
  }
}

export async function getChainLinks(propertyId: string): Promise<ChainLink[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('authority_links')
    .select(
      'sequence,link_type,from_ref,to_ref,confidence,review_status,asserted_at,' +
      'reviewed_at,review_note,' +
      'evidence_documents(kind,invalidated_at,description),' +
      'entities(status,legal_name)',
    )
    .eq('property_id', propertyId)
    .order('sequence', { ascending: true })
    .returns<Array<Record<string, unknown>>>()

  if (error !== null) return []

  return (data ?? []).map((r) => {
    // PostgREST returns an embedded to-one as an object, but older/looser
    // relationship inference can hand back a single-element array. Normalising
    // here keeps that shape question out of the component.
    const ev = Array.isArray(r.evidence_documents) ? r.evidence_documents[0] : r.evidence_documents
    const ent = Array.isArray(r.entities) ? r.entities[0] : r.entities
    const evidence = (ev ?? null) as Record<string, unknown> | null
    const entity = (ent ?? null) as Record<string, unknown> | null

    return {
      sequence: Number(r.sequence),
      linkType: String(r.link_type),
      fromRef: (r.from_ref as string | null) ?? null,
      toRef: (r.to_ref as string | null) ?? null,
      confidence: Number(r.confidence),
      reviewStatus: r.review_status as ChainLink['reviewStatus'],
      assertedAt: String(r.asserted_at),
      reviewedAt: (r.reviewed_at as string | null) ?? null,
      reviewNote: (r.review_note as string | null) ?? null,
      evidenceKind: (evidence?.kind as string | undefined) ?? null,
      evidenceInvalidatedAt: (evidence?.invalidated_at as string | null | undefined) ?? null,
      evidenceDescription: (evidence?.description as string | null | undefined) ?? null,
      entityStatus: (entity?.status as string | undefined) ?? null,
      entityName: (entity?.legal_name as string | undefined) ?? null,
    }
  })
}
