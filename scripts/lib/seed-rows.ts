/**
 * Shared row-shape builders for the four tables that BOTH
 * scripts/generate-supabase-seed.ts (supabase/seed.sql, one-time SQL text)
 * and tests/parity/reset-supabase-seed.ts (per-test fast reset, supabase-js
 * `.insert()` rows) construct from the Phase-1 TypeScript seed object
 * (src/lib/data/seed.ts).
 *
 * Node-side only (no DOM/browser APIs) — deliberately placed outside src/
 * so it can never end up in the Next.js client bundle, even accidentally
 * via a future import from src/lib/data/index.ts or supabase-repo.ts.
 *
 * Each function returns a plain JS object with the exact field values the
 * row should carry (already defaulted where the two original call sites
 * agreed on a default, e.g. `detail ?? null`, `structure ?? []`). Column
 * *order* and wire-format (SQL literal text vs. supabase-js object) stay
 * with each call site — only the data-shape/derivation logic is shared.
 *
 * goals/blocks/recovery_snapshots/activities are only ever built by the
 * generator (reset-supabase-seed.ts never mutates them — see that file's
 * top comment), so they have no shared builder here.
 */

import type { ChatMessage, PainArea, PlannedSession, Proposal } from "../../src/lib/domain/types";

export interface PlannedSessionRow {
  id: string;
  user_id: string;
  date: string;
  title: string;
  type: string;
  detail: string | null;
  structure: PlannedSession["structure"];
  status: string;
  provenance: string;
  payload: {
    distanceMi: PlannedSession["distanceMi"];
    paceTarget: PlannedSession["paceTarget"];
    zone: PlannedSession["zone"];
  };
}

export function toPlannedSessionRow(session: PlannedSession, userId: string): PlannedSessionRow {
  return {
    id: session.id,
    user_id: userId,
    date: session.date,
    title: session.title,
    type: session.type,
    detail: session.detail ?? null,
    structure: session.structure ?? [],
    status: session.status,
    provenance: session.provenance,
    payload: {
      distanceMi: session.distanceMi,
      paceTarget: session.paceTarget,
      zone: session.zone,
    },
  };
}

export interface ProposalRow {
  id: string;
  user_id: string;
  scope: string;
  session_id: string;
  status: string;
  payload: {
    headline: Proposal["headline"];
    subhead: Proposal["subhead"];
    rationale: Proposal["rationale"];
    badge: Proposal["badge"];
    before: Proposal["before"];
    after: Proposal["after"];
    drivers: Proposal["drivers"];
    reviewedAt: Proposal["reviewedAt"];
    chatHeadline: Proposal["chatHeadline"];
  };
}

export function toProposalRow(proposal: Proposal, userId: string): ProposalRow {
  return {
    id: proposal.id,
    user_id: userId,
    scope: proposal.scope,
    session_id: proposal.targetSessionId,
    status: proposal.status,
    payload: {
      headline: proposal.headline,
      subhead: proposal.subhead,
      rationale: proposal.rationale,
      badge: proposal.badge,
      before: proposal.before,
      after: proposal.after,
      drivers: proposal.drivers,
      reviewedAt: proposal.reviewedAt,
      chatHeadline: proposal.chatHeadline,
    },
  };
}

export interface PainAreaRow {
  id: string;
  user_id: string;
  name: string;
  severity: PainArea["severity"];
  trend: string;
  payload: {
    side: PainArea["side"];
    label: PainArea["label"];
    trendDays: PainArea["trendDays"];
  };
}

export function toPainAreaRow(pain: PainArea, userId: string): PainAreaRow {
  return {
    id: pain.id,
    user_id: userId,
    name: pain.name,
    severity: pain.severity,
    trend: pain.trend,
    payload: { side: pain.side, label: pain.label, trendDays: pain.trendDays },
  };
}

export interface ChatMessageRow {
  id: string;
  user_id: string;
  role: string;
  body: string;
  time_label: string | null;
  proposal_refs: ChatMessage["proposalRefs"] | null;
  seq: number;
  payload: Record<string, never>;
}

export function toChatMessageRow(message: ChatMessage, index: number, userId: string): ChatMessageRow {
  return {
    id: message.id,
    user_id: userId,
    role: message.role,
    body: message.text,
    time_label: message.time ?? null,
    proposal_refs: message.proposalRefs ?? null,
    seq: index,
    payload: {},
  };
}
