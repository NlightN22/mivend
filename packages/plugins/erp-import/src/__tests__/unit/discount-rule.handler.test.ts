import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { DiscountRuleHandler } from '../../handlers/discount-rule.handler';

describe('DiscountRuleHandler.upsertCounterparty', () => {
    it('maps a counterparty record to a one-recipient setup, open-ended and negative percent kept', async () => {
        const apply = vi.fn(async () => 'applied');
        const handler = new DiscountRuleHandler({} as never, { apply } as never);
        await handler.upsertCounterparty({} as RequestContext, {
            erpId: 'rule-1',
            counterpartyErpId: 'cnt-1',
            condition: 'quantity-kind',
            conditionValue: 0,
            percent: -5,
            validFrom: '2026-01-01T00:00:00.000Z',
        });
        expect(apply).toHaveBeenCalledWith(expect.anything(), {
            setup: expect.objectContaining({
                erpId: 'rule-1',
                percent: -5,
                conditionName: 'quantity-kind',
                allProducts: true,
                validTo: null,
                active: true,
            }),
            recipients: [{ counterpartyErpId: 'cnt-1', contractErpId: '' }],
            productErpIds: [],
            operationKind: '',
        });
    });

    it('limits the setup to the given product', async () => {
        const apply = vi.fn(async () => 'applied');
        const handler = new DiscountRuleHandler({} as never, { apply } as never);
        await handler.upsertCounterparty({} as RequestContext, {
            erpId: 'rule-2',
            counterpartyErpId: 'cnt-1',
            productErpId: 'prod-1',
            condition: '',
            conditionValue: 0,
            percent: 5,
            validFrom: '2026-01-01T00:00:00.000Z',
        });
        const input = apply.mock.calls[0] as unknown as [
            unknown,
            { setup: { allProducts: boolean }; productErpIds: string[] },
        ];
        expect(input[1].setup.allProducts).toBe(false);
        expect(input[1].productErpIds).toEqual(['prod-1']);
    });
});
