import { describe, expect, it } from 'vitest';

import {
    INBOX_BULK_STREAMS,
    INBOX_CRITICAL_STREAMS,
    INBOX_ORDER_REGISTRATION_RESULT_STREAMS,
    INBOX_USER_STREAMS,
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
