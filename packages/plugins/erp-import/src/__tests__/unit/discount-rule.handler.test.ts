import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { DiscountRuleHandler } from '../../handlers/discount-rule.handler';

describe('DiscountRuleHandler.upsertCounterparty', () => {
    it('maps a counterparty record to a counterparty-scoped rule, open-ended and negative percent kept', async () => {
        const upsertCounterpartyRule = vi.fn(async () => ({}));
        const handler = new DiscountRuleHandler({} as never, { upsertCounterpartyRule } as never);
        await handler.upsertCounterparty({} as RequestContext, {
            erpId: 'rule-1',
            counterpartyErpId: 'cnt-1',
            condition: 'byQuantity',
            conditionValue: 0,
            percent: -5,
            validFrom: '2026-01-01T00:00:00.000Z',
        });
        expect(upsertCounterpartyRule).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                erpId: 'rule-1',
                recipientType: 'counterparty',
                recipientErpId: 'cnt-1',
                productErpId: null,
                percent: -5,
                validTo: null,
                limitAmount: null,
            }),
        );
    });
});
