import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generic in-memory fake Supabase admin client shared by the Task 11 test
 * suites (strava-webhook, dedupe — matching.ts is pure and needs no DB
 * mock at all). Extends the narrower per-file fakes established by
 * whoop-sync.test.ts / cron-morning.test.ts (select/eq/order/limit/
 * maybeSingle/then) with the write-side chains Task 11's code paths need:
 * `.insert(...).select().single()`, `.upsert(...).select().single()`,
 * `.update(...).eq(...)` (thenable, no `.select()` required — matches real
 * supabase-js), `.delete().eq(...)`, plus `.is()`/`.not(col,"is",val)`
 * filters for dedupe's null/not-null candidate query.
 *
 * Every `.from(table)` call is bound to a real per-table row array (not a
 * single shared fixture reused across tables regardless of name, unlike
 * the simpler single-table fakes elsewhere) — Task 11's code genuinely
 * touches multiple tables in one call path (activities, planned_sessions,
 * profiles, integration_tokens, sync_runs), so table identity must be
 * real for these tests to mean anything.
 */

export type Row = Record<string, unknown>;
type Filter = ["eq" | "is" | "not-is", string, unknown];

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([kind, col, val]) => {
    // A key absent from the row object is a column the writer never set —
    // on real Postgres that column is NULL, so filters must treat undefined
    // as null (e.g. an imported Strava row never sets whoop_id; dedupe's
    // `.is("whoop_id", null)` candidate filter must still see it).
    const cell = row[col] === undefined ? null : row[col];
    if (kind === "eq") return cell === val;
    if (kind === "is") return cell === val;
    return cell !== val; // "not-is"
  });
}

function genId(): string {
  return globalThis.crypto.randomUUID();
}

export function makeTable(initial: Row[] = []) {
  let rows: Row[] = initial.map((r) => ({ ...r }));
  return {
    rows: () => rows,
    seed(row: Row) {
      rows.push({ ...row });
    },
    insert(payload: Row[]): Row[] {
      const inserted = payload.map((r) => ({ id: r.id ?? genId(), ...r }));
      rows.push(...inserted);
      return inserted;
    },
    upsert(payload: Row[], opts?: { onConflict?: string }): Row[] {
      const keyCols = opts?.onConflict?.split(",") ?? [];
      const affected: Row[] = [];
      for (const nr of payload) {
        const idx = keyCols.length
          ? rows.findIndex((r) => keyCols.every((c) => r[c] === nr[c]))
          : -1;
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...nr };
          affected.push(rows[idx]);
        } else {
          const inserted = { id: nr.id ?? genId(), ...nr };
          rows.push(inserted);
          affected.push(inserted);
        }
      }
      return affected;
    },
    update(patch: Row, filters: Filter[]): Row[] {
      const matched = rows.filter((r) => matches(r, filters));
      matched.forEach((r) => Object.assign(r, patch));
      return matched;
    },
    delete(filters: Filter[]): Row[] {
      const removed = rows.filter((r) => matches(r, filters));
      rows = rows.filter((r) => !matches(r, filters));
      return removed;
    },
  };
}

type Table = ReturnType<typeof makeTable>;

function makeQueryBuilder(table: Table) {
  type Op = "select" | "insert" | "upsert" | "update" | "delete";
  const state: {
    op: Op;
    payload?: Row[];
    updatePayload?: Row;
    upsertOpts?: { onConflict?: string };
    filters: Filter[];
    orderCol?: string;
    orderAsc: boolean;
    limitN?: number;
  } = { op: "select", filters: [], orderAsc: true };

  function execute(): Row[] {
    let result: Row[];
    switch (state.op) {
      case "select":
        result = table.rows().filter((r) => matches(r, state.filters));
        break;
      case "insert":
        result = table.insert(state.payload ?? []);
        break;
      case "upsert":
        result = table.upsert(state.payload ?? [], state.upsertOpts);
        break;
      case "update":
        result = table.update(state.updatePayload ?? {}, state.filters);
        break;
      case "delete":
        result = table.delete(state.filters);
        break;
    }
    if (state.orderCol) {
      const col = state.orderCol;
      result = [...result].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        if (av < bv) return state.orderAsc ? -1 : 1;
        if (av > bv) return state.orderAsc ? 1 : -1;
        return 0;
      });
    }
    if (state.limitN !== undefined) result = result.slice(0, state.limitN);
    return result;
  }

  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      state.filters.push(["eq", col, val]);
      return builder;
    },
    is(col: string, val: unknown) {
      state.filters.push(["is", col, val]);
      return builder;
    },
    not(col: string, _op: "is", val: unknown) {
      void _op;
      state.filters.push(["not-is", col, val]);
      return builder;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      state.orderCol = col;
      state.orderAsc = opts?.ascending ?? true;
      return builder;
    },
    limit(n: number) {
      state.limitN = n;
      return builder;
    },
    insert(payload: Row | Row[]) {
      state.op = "insert";
      state.payload = Array.isArray(payload) ? payload : [payload];
      return builder;
    },
    upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
      state.op = "upsert";
      state.payload = Array.isArray(payload) ? payload : [payload];
      state.upsertOpts = opts;
      return builder;
    },
    update(payload: Row) {
      state.op = "update";
      state.updatePayload = payload;
      return builder;
    },
    delete() {
      state.op = "delete";
      return builder;
    },
    maybeSingle() {
      const rows = execute();
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    single() {
      const rows = execute();
      return Promise.resolve(
        rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "no rows returned" } }
      );
    },
    then(resolve: (v: { data: Row[]; error: null }) => void, reject?: (e: unknown) => void) {
      try {
        resolve({ data: execute(), error: null });
      } catch (e) {
        if (reject) reject(e);
        else throw e;
      }
    },
  };
  return builder;
}

export function createFakeAdmin<TableName extends string>(tableNames: readonly TableName[]) {
  const tables = Object.fromEntries(tableNames.map((name) => [name, makeTable()])) as Record<
    TableName,
    Table
  >;
  const client = {
    from: (name: TableName) => makeQueryBuilder(tables[name]),
  };
  return { client: client as unknown as SupabaseClient, tables };
}
