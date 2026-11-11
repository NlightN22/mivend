import { describe, expect, it } from 'vitest';

import {
    DEFAULT_RULE_KEY,
    MAX_RETENTION_DAYS,
    SEED_RULES,
    resolveRetention,
    retentionProblems,
} from '../../retention-rules';

const base = { sourceType: DEFAULT_RULE_KEY, readDays: 90, unreadDays: 365 };

describe('resolveRetention', () => {
    it('gives a typed rule its own days and fills a missing one from the default', () => {
        const resolved = resolveRetention([
            base,
            { sourceType: 'a', readDays: 5, unreadDays: null },
            { sourceType: 'b', readDays: null, unreadDays: 20 },
            { sourceType: 'c', readDays: null, unreadDays: null },
        ]);

        expect(resolved).toEqual({
            defaultReadDays: 90,
            defaultUnreadDays: 365,
            sourceTypes: ['a', 'b', 'c'],
            readDays: [5, 90, 90],
            unreadDays: [365, 20, 365],
        });
    });

    it('does not list the default row as a typed rule', () => {
        expect(resolveRetention([base])?.sourceTypes).toEqual([]);
    });

    it('returns null without a complete default rule so nothing is deleted on a guess', () => {
        expect(resolveRetention([{ sourceType: 'a', readDays: 5, unreadDays: 5 }])).toBeNull();
        expect(resolveRetention([{ ...base, unreadDays: null }])).toBeNull();
    });

    it('seeds a complete default and a shorter period for client-originated rows only', () => {
        const resolved = resolveRetention(SEED_RULES);
        expect(resolved).toMatchObject({ defaultReadDays: 90, defaultUnreadDays: 365 });
        expect(resolved?.sourceTypes).toEqual(['client']);
        expect(resolved?.readDays).toEqual([7]);
        expect(resolved?.unreadDays).toEqual([30]);
    });
});

describe('retentionProblems', () => {
    it('accepts whole days within bounds and null on a typed rule', () => {
        expect(retentionProblems('a', { readDays: 1, unreadDays: MAX_RETENTION_DAYS })).toEqual([]);
        expect(retentionProblems('a', { readDays: null, unreadDays: null })).toEqual([]);
    });

    it('does not require unread to be at least read', () => {
        expect(retentionProblems('a', { readDays: 30, unreadDays: 7 })).toEqual([]);
    });

    it.each([0, -1, 1.5, MAX_RETENTION_DAYS + 1, NaN])('rejects %s days', days => {
        expect(retentionProblems('a', { readDays: days, unreadDays: 5 })).toHaveLength(1);
        expect(retentionProblems('a', { readDays: 5, unreadDays: days })).toHaveLength(1);
    });

    it('requires both periods on the default rule', () => {
        expect(retentionProblems(DEFAULT_RULE_KEY, { readDays: null, unreadDays: 5 })).toHaveLength(
            1,
        );
        expect(retentionProblems(DEFAULT_RULE_KEY, { readDays: 5, unreadDays: null })).toHaveLength(
            1,
        );
        expect(retentionProblems(DEFAULT_RULE_KEY, { readDays: 5, unreadDays: 5 })).toEqual([]);
    });
});
