import type { ComparisonState } from './reconciliation-state';

export const HEAL_BATCH_SIZE = 200;
export const HEAL_MAX_IDS_PER_RUN = 2000;
export const HEAL_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
export const HEAL_TIME_BUDGET_MS = 30 * 60 * 1000;
export const HEAL_MAX_ATTEMPTS = 3;
export const HEAL_RATE_LIMIT_RETRIES = 3;

export type HealSkipReason = 'not-stalled' | 'local-higher' | 'too-soon' | 'attempts-exhausted';

export type HealDecision =
    | { heal: false; reason: HealSkipReason }
    | { heal: true; realRun: boolean };

// Real (republishing) runs only with the separate heal key; without it the run is a dry run.
export function decideHeal(input: {
    state: ComparisonState;
    gap: number;
    attempts: number;
    lastRequestedAt: Date | null;
    now: Date;
    healKeyConfigured: boolean;
}): HealDecision {
    if (input.state !== 'stalled') return { heal: false, reason: 'not-stalled' };
    if (input.gap <= 0) return { heal: false, reason: 'local-higher' };
    if (input.attempts >= HEAL_MAX_ATTEMPTS) return { heal: false, reason: 'attempts-exhausted' };
    const waited = input.lastRequestedAt
        ? input.now.getTime() - input.lastRequestedAt.getTime()
        : Infinity;
    if (waited < HEAL_RETRY_AFTER_MS) return { heal: false, reason: 'too-soon' };
    return { heal: true, realRun: input.healKeyConfigured };
}

export function toBatches(ids: readonly string[]): string[][] {
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += HEAL_BATCH_SIZE)
        batches.push(ids.slice(i, i + HEAL_BATCH_SIZE));
    return batches;
}

export interface BatchTally {
    republished: number;
    wouldRepublish: number;
    notFound: string[];
}

export type BatchCheck =
    | { ok: true; tally: BatchTally }
    | { ok: false; reason: 'dry-run-ignored' | 'unknown-status' | 'id-set-mismatch' };

export function checkBatch(
    sent: readonly string[],
    results: ReadonlyArray<{ entityId: string; status: string }>,
    dryRun: boolean,
): BatchCheck {
    const sentSet = new Set(sent);
    const seen = new Set(results.map(r => r.entityId));
    if (seen.size !== sentSet.size || [...seen].some(id => !sentSet.has(id))) {
        return { ok: false, reason: 'id-set-mismatch' };
    }
    const tally: BatchTally = { republished: 0, wouldRepublish: 0, notFound: [] };
    for (const r of results) {
        if (r.status === 'republished') {
            if (dryRun) return { ok: false, reason: 'dry-run-ignored' };
            tally.republished += 1;
        } else if (r.status === 'would_republish') {
            if (!dryRun) return { ok: false, reason: 'unknown-status' };
            tally.wouldRepublish += 1;
        } else if (r.status === 'not_found') {
            tally.notFound.push(r.entityId);
        } else {
            return { ok: false, reason: 'unknown-status' };
        }
    }
    return { ok: true, tally };
}

export type HealOutcome =
    | 'healed'
    | 'dry-run-only'
    | 'no-id-source'
    | 'nothing-missing'
    | 'dry-run-ignored'
    | 'unknown-status'
    | 'id-set-mismatch'
    | 'all-not-found'
    | 'batch-failed';

// Outcomes that count as a failed attempt (alarm after HEAL_MAX_ATTEMPTS); the rest are neutral or a success.
export const FAILED_OUTCOMES: readonly HealOutcome[] = [
    'dry-run-ignored',
    'unknown-status',
    'id-set-mismatch',
    'all-not-found',
    'batch-failed',
];

export function isAlarmOutcome(outcome: HealOutcome | null, attempts: number): boolean {
    return (
        attempts >= HEAL_MAX_ATTEMPTS ||
        outcome === 'dry-run-ignored' ||
        outcome === 'all-not-found'
    );
}

// A real heal is judged by the first quiet comparison after it: a smaller gap is a success, a flat one a failed
// attempt (republished ids that create no order stay in the diff). Busy or too-soon comparisons leave the verdict pending.
export function judgeHeal(input: {
    attempts: number;
    pending: boolean;
    quiet: boolean;
    previousGap: number;
    newGap: number;
}): { attempts: number; pending: boolean } {
    if (!input.pending || !input.quiet) return { attempts: input.attempts, pending: input.pending };
    return {
        attempts: input.newGap < input.previousGap ? 0 : input.attempts + 1,
        pending: false,
    };
}
