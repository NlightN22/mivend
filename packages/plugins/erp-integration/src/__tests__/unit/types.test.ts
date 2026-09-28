import { describe, expect, it } from 'vitest';

import {
    INBOX_BULK_STREAMS,
    INBOX_CRITICAL_STREAMS,
    INBOX_ORDER_REGISTRATION_RESULT_STREAMS,
    INBOX_USER_STREAMS,
    isEmailOnlyWorker,
} from '../../types';

// Issue #127: regression coverage for the real incident this fixes — a 'counterparty' backlog
// (bulk lane) starved 'user' of claim slots for hours because they shared one claimBatch query.
// 'user' must now be claimed by its own dedicated lane, disjoint from both the bulk lane and the
// order-registration-result lane, so neither can ever again starve it (or be starved by it).
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

    // Not literally worker-email specifically, but any process whose activeQueues doesn't
    // include 'apply-collection-filters' has no business running the ERP Kafka consumer either —
    // same reasoning, name kept for the one real case this exists for today.
    it('is true for an empty activeQueues array (no queues owned, including not this one)', () => {
        expect(isEmailOnlyWorker([])).toBe(true);
    });
});
