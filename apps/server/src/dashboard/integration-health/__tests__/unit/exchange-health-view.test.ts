import { describe, expect, it } from 'vitest';

import {
    UNKNOWN_REASON_TEXT,
    formatAgeSeconds,
    isExchangeState,
    isExchangeUnreadable,
    stateBadgeVariant,
    unknownReasonText,
} from '../../exchange-health-view';

describe('exchange health view', () => {
    it('alerts on exactly the wanted state; UNKNOWN and OK alert on neither', () => {
        expect(isExchangeState('DOWN', 'DOWN')).toBe(true);
        expect(isExchangeState('DEGRADED', 'DOWN')).toBe(false);
        expect(isExchangeState('DEGRADED', 'DEGRADED')).toBe(true);
        for (const state of ['OK', 'UNKNOWN', null, undefined]) {
            expect(isExchangeState(state, 'DOWN')).toBe(false);
            expect(isExchangeState(state, 'DEGRADED')).toBe(false);
        }
    });

    it('alerts on an unreadable exchange except when not configured or not yet polled', () => {
        for (const reason of [
            'UNAUTHORIZED',
            'TIMEOUT',
            'UNREACHABLE',
            'SERVER_ERROR',
            'BAD_RESPONSE',
            'STALE',
        ]) {
            expect(isExchangeUnreadable('UNKNOWN', reason)).toBe(true);
        }
        expect(isExchangeUnreadable('UNKNOWN', 'NOT_CONFIGURED')).toBe(false);
        expect(isExchangeUnreadable('UNKNOWN', 'NEVER_POLLED')).toBe(false);
        expect(isExchangeUnreadable('DOWN', null)).toBe(false);
        expect(isExchangeUnreadable('OK', null)).toBe(false);
    });

    it('explains every unknown reason class and falls back for an unlisted one', () => {
        for (const reason of Object.keys(UNKNOWN_REASON_TEXT)) {
            expect(unknownReasonText(reason)).toBe(UNKNOWN_REASON_TEXT[reason]);
        }
        expect(unknownReasonText('FUTURE')).toBe('The exchange health cannot be read.');
        expect(unknownReasonText(null)).toBe('The exchange health cannot be read.');
    });

    it('never gives UNKNOWN the green badge', () => {
        expect(stateBadgeVariant('OK')).toBe('default');
        expect(stateBadgeVariant('DOWN')).toBe('destructive');
        expect(stateBadgeVariant('UNKNOWN')).toBe('secondary');
        expect(stateBadgeVariant('DEGRADED')).toBe('secondary');
    });

    it('formats ages', () => {
        expect(formatAgeSeconds(null)).toBe('—');
        expect(formatAgeSeconds(45)).toBe('45 s');
        expect(formatAgeSeconds(600)).toBe('10 min');
        expect(formatAgeSeconds(7200)).toBe('2 h');
        expect(formatAgeSeconds(172800)).toBe('2 d');
    });
});
