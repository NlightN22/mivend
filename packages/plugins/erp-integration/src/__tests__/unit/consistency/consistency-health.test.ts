import { describe, expect, it } from 'vitest';

import { ConsistencyClientError } from '../../../consistency/consistency-client-error';
import {
    evaluateSummary,
    healthFromError,
    isUnavailable,
} from '../../../consistency/consistency-health';
import type { ConsistencySummary } from '../../../consistency/consistency-types';
import { parseSummary } from '../../../consistency/consistency-parse';
import { wireSummary } from './consistency-fixtures';

const INTERVAL = 10 * 60_000;
const FINISHED = new Date('2026-10-30T12:00:00.000Z');

function summaryFinishedAt(finishedAt: string | null, status = 'ok'): ConsistencySummary {
    const base = wireSummary() as { lastCheck: Record<string, unknown> };
    return parseSummary(
        wireSummary({
            lastCheck: { ...base.lastCheck, finishedAt, status, durationMs: finishedAt ? 1 : null },
        }),
    );
}

describe('evaluateSummary stale rule', () => {
    const at = (offsetMs: number): Date => new Date(FINISHED.getTime() + offsetMs);

    it('is ok exactly at 3x the schedule and stale just after', () => {
        const summary = summaryFinishedAt(FINISHED.toISOString());
        expect(evaluateSummary(summary, null, INTERVAL, at(3 * INTERVAL)).health).toBe('ok');
        expect(evaluateSummary(summary, null, INTERVAL, at(3 * INTERVAL + 1)).health).toBe('stale');
    });

    it('uses the previous finish while a check is running', () => {
        const running = summaryFinishedAt(null, 'running');
        expect(evaluateSummary(running, FINISHED, INTERVAL, at(INTERVAL)).health).toBe('ok');
        expect(evaluateSummary(running, FINISHED, INTERVAL, at(4 * INTERVAL)).health).toBe('stale');
    });

    it('falls back to startedAt for a first run that never finished', () => {
        const running = summaryFinishedAt(null, 'running');
        const started = new Date('2026-10-30T11:50:00.000Z');
        expect(
            evaluateSummary(running, null, INTERVAL, new Date(started.getTime() + 4 * INTERVAL))
                .health,
        ).toBe('stale');
    });
});

describe('healthFromError', () => {
    it.each([
        ['unauthorized', 'unauthorized'],
        ['forbidden', 'unauthorized'],
        ['no-check-yet', 'no-check-yet'],
        ['rate-limited', 'rate-limited'],
        ['unreachable', 'unreachable'],
        ['server-error', 'unreachable'],
        ['bad-request', 'invalid-response'],
        ['malformed', 'invalid-response'],
    ] as const)('%s -> %s', (kind, health) => {
        expect(healthFromError(new ConsistencyClientError(kind, 'm')).health).toBe(health);
    });

    it('only ok and rate-limited are not reported as unavailable', () => {
        expect(isUnavailable('ok')).toBe(false);
        expect(isUnavailable('rate-limited')).toBe(false);
        expect(isUnavailable('stale')).toBe(true);
        expect(isUnavailable('no-check-yet')).toBe(true);
    });
});
