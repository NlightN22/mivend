import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { DiscountRuleStreamHandler } from '../../handlers/discount-rule.handler';
import { RetroBonusRuleStreamHandler } from '../../handlers/retro-bonus-rule.handler';
import { NonRetryableInboundError } from '../../non-retryable-inbound-error';

const ctx = {} as RequestContext;
const discount = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
    recipientType: 'counterparty',
    recipientId: 'cp-1',
    condition: 'byQuantity',
    percent: 5,
    version: '1',
    effectiveFrom: '2026-01-01T00:00:00Z',
    isActive: true,
    ...o,
});

describe('DiscountRuleStreamHandler.applyBatch', () => {
    it('maps invalid, inactive, tombstone and upsert items positionally', async () => {
        const applyBatch = vi.fn().mockResolvedValue([false, true]);
        const handler = new DiscountRuleStreamHandler({ applyBatch } as never);

        const results = await handler.applyBatch(ctx, [
            { entityId: 'bad', payload: discount({ recipientId: '' }) },
            { entityId: 'off', payload: discount({ isActive: false }) },
            { entityId: 'ghost', payload: { isDeleted: true, version: '3' } },
            { entityId: 'ok', payload: discount() },
        ]);

        expect(results[0]).toMatchObject({ kind: 'invalid' });
        expect((results[0] as { error: unknown }).error).toBeInstanceOf(NonRetryableInboundError);
        expect(results[1]).toMatchObject({ kind: 'noop' });
        expect(results[2]).toMatchObject({ kind: 'noop' });
        expect(results[3]).toEqual({ kind: 'applied' });
        expect(applyBatch.mock.calls[0][1]).toHaveLength(2);
    });
});

describe('RetroBonusRuleStreamHandler.applyBatch', () => {
    it('sends only valid items to the service and flags the invalid one', async () => {
        const upsertBatch = vi.fn().mockResolvedValue(undefined);
        const handler = new RetroBonusRuleStreamHandler({ upsertBatch } as never);
        const ok = { counterpartyId: 'cp', version: '1', effectiveFrom: '2026-01-01T00:00:00Z' };

        const results = await handler.applyBatch(ctx, [
            { entityId: 'r1', payload: ok },
            { entityId: 'r2', payload: { ...ok, counterpartyId: '' } },
        ]);

        expect(results.map(r => r.kind)).toEqual(['applied', 'invalid']);
        expect(upsertBatch.mock.calls[0][1]).toHaveLength(1);
    });
});
