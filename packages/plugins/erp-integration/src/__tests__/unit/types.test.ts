import { describe, expect, it } from 'vitest';

import {
    INBOX_BULK_STREAMS,
    INBOX_CRITICAL_STREAMS,
    INBOX_ORDER_REGISTRATION_RESULT_STREAMS,
    INBOX_USER_STREAMS,
    isEmailOnlyWorker,
} from '../../types';

// 'user' has a dedicated claim lane disjoint from the bulk and order-result lanes;
// otherwise a backlog in either lane can starve 'user' of claim slots.
describe('inbox lane stream membership', () => {
    it('keeps user out of the bulk lane', () => {
        expect(INBOX_BULK_STREAMS).not.toContain('user');
    });

    it('gives user its own dedicated lane, disjoint from order-registration-result', () => {
        expect(INBOX_USER_STREAMS).toEqual(['user']);
        expect(INBOX_ORDER_REGISTRATION_RESULT_STREAMS).toEqual(['order-registration-result']);
        expect(INBOX_USER_STREAMS).not.toEqual(
            expect.arrayContaining([...INBOX_ORDER_REGISTRATION_RESULT_STREAMS]),
        );
    });

    it('keeps the union of both priority lanes out of the bulk lane', () => {
        for (const stream of INBOX_CRITICAL_STREAMS) {
            expect(INBOX_BULK_STREAMS).not.toContain(stream);
        }
    });

    it('still leaves other bulk-lane streams (e.g. counterparty, the stream that starved user) in the bulk lane', () => {
        expect(INBOX_BULK_STREAMS).toContain('counterparty');
    });
});

// #149: worker-email.ts and worker.ts are both ProcessContext.isWorker=true — this is the only
// per-process signal that tells them apart, reused from each process's own activeQueues.
describe('isEmailOnlyWorker', () => {
    it("is true for worker-email.ts's own activeQueues", () => {
        expect(isEmailOnlyWorker(['send-email'])).toBe(true);
    });

    it("is false for worker.ts's own activeQueues (includes apply-collection-filters)", () => {
        expect(
            isEmailOnlyWorker([
                'apply-collection-filters',
                'clean-sessions',
                'update-search-index',
                'generate-document',
            ]),
        ).toBe(false);
    });

    it('is false when activeQueues is unset (main.ts, not a worker at all)', () => {
        expect(isEmailOnlyWorker(undefined)).toBe(false);
    });

    it('is false for an empty activeQueues array (not a positive match on send-email)', () => {
        expect(isEmailOnlyWorker([])).toBe(false);
    });

    // Only an exact match on ['send-email'] counts as email-only; a worker that merely
    // omits 'apply-collection-filters' must not be inferred as email-only.
    it('is false for a hypothetical future dedicated worker with its own unrelated queue', () => {
        expect(isEmailOnlyWorker(['generate-document'])).toBe(false);
    });

    it('is false when send-email is combined with any other queue', () => {
        expect(isEmailOnlyWorker(['send-email', 'clean-sessions'])).toBe(false);
    });
});
