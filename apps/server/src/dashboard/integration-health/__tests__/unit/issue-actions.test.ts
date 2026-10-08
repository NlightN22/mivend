import { describe, expect, it } from 'vitest';

import { summarizeRebuild, summarizeReplay, summarizeRequeue } from '../../issue-actions';

describe('summarizeReplay', () => {
    it('is ok only when every row was replayed', () => {
        expect(summarizeReplay([{ outcome: 'REPLAYED' }]).ok).toBe(true);
        expect(summarizeReplay([{ outcome: 'REPLAYED' }, { outcome: 'NOT_FOUND' }]).ok).toBe(false);
    });

    it('explains the first non-replayed row and handles an empty answer', () => {
        expect(
            summarizeReplay([{ outcome: 'FAILED', message: 'IS unreachable' }]).message,
        ).toContain('FAILED: IS unreachable');
        expect(summarizeReplay([]).ok).toBe(false);
    });
});

describe('summarizeRequeue / summarizeRebuild', () => {
    it('flags a requeue that moved nothing', () => {
        expect(summarizeRequeue(2).ok).toBe(true);
        expect(summarizeRequeue(0).ok).toBe(false);
    });

    it('maps every rebuild outcome and surfaces unknown ones', () => {
        expect(summarizeRebuild('QUEUED').ok).toBe(true);
        expect(summarizeRebuild('STILL_SKIPPED').ok).toBe(false);
        expect(summarizeRebuild('ALREADY_SENT').ok).toBe(false);
        expect(summarizeRebuild('WHATEVER').message).toContain('WHATEVER');
    });
});
