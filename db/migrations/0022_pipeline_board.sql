-- ─────────────────────────────────────────────────────────────────────────────
-- 0022 — the pipeline board.
--
-- Three views plus one index, all serving the admin action board at /dashboard.
--
-- The reason these are DB views rather than JS tallies: `getStageCounts()`
-- previously selected every row of property_workflow and counted in JavaScript.
-- That is fine at fifty rows and wrong in principle, and it cannot produce the
-- one number the operator actually asks for first — how many scored
-- opportunities has nobody touched yet. That requires an anti-join, which
-- PostgREST cannot express in a single call.
--
-- All three are security_invoker so RLS applies as the caller, not the definer.
-- ─────────────────────────────────────────────────────────────────────────────

-- Stage x count x expected value x aging.
--
-- The LEFT JOINs are load-bearing. A property can sit in property_workflow and
-- fall out of properties_priority — retired, suppressed, or now under a live
-- agreement (see the predicates in 0015). It must still appear on the board
-- with a null value rather than silently vanishing from the operator's count.
create or replace view pipeline_board
with (security_invoker = true) as
select
  w.stage::text                                          as stage,
  count(*)                                               as property_count,
  coalesce(sum(s.expected_value_cents), 0)::bigint       as expected_value_cents,
  coalesce(sum(p.cash_amount_cents), 0)::bigint          as claim_value_cents,
  coalesce(
    extract(day from max(now() - w.entered_stage_at)), 0
  )::int                                                 as oldest_days_in_stage,
  count(*) filter (
    where w.entered_stage_at < now() - interval '14 days'
  )                                                      as stale_count
from property_workflow w
left join properties_priority    p on p.property_id = w.property_id
left join property_scores_latest s on s.property_id = w.property_id
group by w.stage;

comment on view pipeline_board is
  'Per-stage inventory for the admin action board. Aggregated in the database so '
  'the page does not read every workflow row to count them.';

-- The untouched pool — the answer to "how full is my pipeline".
--
-- Deliberately built ON work_queue rather than on properties_priority, so that
-- /dashboard and /queue can never disagree about what counts as an opportunity.
create or replace view pipeline_supply
with (security_invoker = true) as
select
  count(*)                                                as unworked_count,
  coalesce(sum(q.expected_value_cents), 0)::bigint        as unworked_expected_value_cents,
  count(*) filter (where q.expected_value_cents >= 50000) as high_value_count,
  max(q.scored_at)                                        as last_scored_at,
  min(q.scored_at)                                        as oldest_score_at
from work_queue q
where not exists (
  select 1 from property_workflow w where w.property_id = q.property_id
);

comment on view pipeline_supply is
  'Scored opportunities nobody has started working. high_value_count uses a $500 '
  'expected-value floor. Never backfill property_workflow to make this look '
  'smaller - entered_stage_at would stop meaning anything.';

-- Oldest in stage. The SLA seed: today it is aging, later it is aging vs target
-- with no change to the shape.
create or replace view pipeline_stuck
with (security_invoker = true) as
select
  w.property_id,
  w.stage::text                                         as stage,
  w.entered_stage_at,
  w.assigned_to,
  p.owner_name,
  p.owner_class::text                                   as owner_class,
  p.priority_reason::text                               as priority_reason,
  s.expected_value_cents,
  extract(day from now() - w.entered_stage_at)::int     as days_in_stage
from property_workflow w
left join properties_priority    p on p.property_id = w.property_id
left join property_scores_latest s on s.property_id = w.property_id
where w.stage <> 'closed_lost'
order by w.entered_stage_at asc;

comment on view pipeline_stuck is
  'Properties ranked by how long they have sat in their current stage.';

-- Stage-to-stage conversion is NOT computable from property_workflow, which
-- holds only the current stage. The transition history is already being written
-- correctly by log_workflow_change() into audit_log as {from, to} detail.
--
-- This index costs nothing now and makes the conversion view a ~15 line addition
-- later WITH NO BACKFILL, because the history is accruing from today.
create index if not exists audit_log_workflow_transitions_idx
  on audit_log ((detail ->> 'to'), occurred_at)
  where action = 'workflow_stage_change';
