import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { ContractHandler } from '../../handlers/contract.handler';

const ctx = {} as RequestContext;
const record = {
    erpId: 'ctr-1',
    counterpartyErpId: 'cnt-1',
    priceTypeId: 'price-type-wholesale',
    creditLimit: '100000',
    debtDaysLimit: 14,
    isActive: true,
};

function build(counterparty: { id: number } | null) {
    const contractService = { upsertActiveState: vi.fn(async () => {}) };
    const counterpartyService = { findByErpId: vi.fn(async () => counterparty) };
    const handler = new ContractHandler(contractService as never, counterpartyService as never);
    return { handler, contractService };
}

describe('ContractHandler', () => {
    it('resolves the counterparty erpId to its local id and upserts by contract erpId', async () => {
        const { handler, contractService } = build({ id: 7 });
        await handler.upsert(ctx, record);
        expect(contractService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'ctr-1',
            expect.objectContaining({
                counterpartyId: '7',
                organizationId: '',
                name: 'ctr-1',
                creditLimit: '100000',
                debtDaysLimit: 14,
                isActive: true,
                controlledIndividually: false,
            }),
        );
    });

    it('passes the controlledIndividually flag and no limit through', async () => {
        const { handler, contractService } = build({ id: 7 });
        await handler.upsert(ctx, {
            ...record,
            creditLimit: undefined,
            debtDaysLimit: undefined,
            controlledIndividually: true,
        });
        expect(contractService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'ctr-1',
            expect.objectContaining({
                creditLimit: null,
                debtDaysLimit: null,
                controlledIndividually: true,
            }),
        );
    });

    it('fails the record when the counterparty is not imported yet', async () => {
        const { handler, contractService } = build(null);
        await expect(handler.upsert(ctx, record)).rejects.toThrow(/cnt-1/);
        expect(contractService.upsertActiveState).not.toHaveBeenCalled();
    });
});
