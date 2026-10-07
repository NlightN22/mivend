import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { CounterpartyHandler } from '../../handlers/counterparty.handler';

const base = {
    erpId: 'cnt-1',
    legalName: 'Buyer LLC',
    shortName: 'Buyer',
    creditLimit: 0,
    creditBalance: 0,
    paymentDelayDays: 0,
    priceType: 'WHOLESALE',
    isActive: true,
};

describe('CounterpartyHandler', () => {
    it.each([
        ['ctr-1', 'ctr-1'],
        [undefined, null],
    ])('maps mainContractErpId %s to mainContractId %s', async (input, expected) => {
        const service = { upsert: vi.fn(async () => ({})) };
        const handler = new CounterpartyHandler(service as never);
        await handler.upsert({} as RequestContext, { ...base, mainContractErpId: input });
        expect(service.upsert).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ mainContractId: expected }),
        );
    });
});
