import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { powerOfAttorneyItems } from '../../handlers/contract-power-of-attorney';
import { ContractStreamHandler } from '../../handlers/contract.handler';

const ctx = {} as RequestContext;

function makeHandler() {
    const powersOfAttorney = { replaceForContract: vi.fn(), markContractDeleted: vi.fn() };
    const handler = new ContractStreamHandler(
        {
            upsertActiveState: vi.fn(),
            deactivateTombstone: vi.fn().mockResolvedValue(false),
            findByErpId: vi.fn().mockResolvedValue({ id: 1 }),
        } as never,
        { findByErpId: vi.fn().mockResolvedValue({ id: 5 }) } as never,
        { attachContract: vi.fn() } as never,
        { requestForContract: vi.fn(), drainSoon: vi.fn() } as never,
        powersOfAttorney as never,
    );
    return { handler, powersOfAttorney };
}

describe('powers of attorney carried by contract events', () => {
    it('maps every field the contract carries and tolerates absent optionals', () => {
        const items = powerOfAttorneyItems({
            powersOfAttorney: [
                {
                    number: '5',
                    externalId: 'row-1',
                    holderName: 'Holder',
                    issueDate: '2026-01-01T00:00:00Z',
                    validUntil: '2026-12-31T00:00:00Z',
                    scanId: 'scan-1',
                },
                { number: '6' },
            ],
        });
        expect(items[0]).toMatchObject({
            externalId: 'row-1',
            scanId: 'scan-1',
            holderName: 'Holder',
        });
        expect(items[0].validUntil).toEqual(new Date('2026-12-31T00:00:00Z'));
        expect(items[1]).toEqual({
            externalId: null,
            number: '6',
            holderName: '',
            issueDate: null,
            validUntil: null,
            scanId: null,
        });
    });

    it('replaces the stored list on a named event, an empty list included', async () => {
        const { handler, powersOfAttorney } = makeHandler();
        await handler.apply(ctx, 'contract-1', {
            name: 'C',
            counterpartyId: 'cp-1',
            organizationId: 'org-1',
        });
        expect(powersOfAttorney.replaceForContract).toHaveBeenCalledWith(ctx, {
            contractId: 'contract-1',
            counterpartyId: 'cp-1',
            organizationId: 'org-1',
            isDeleted: false,
            items: [],
        });
    });

    it('only flags the rows on a contract tombstone', async () => {
        const { handler, powersOfAttorney } = makeHandler();
        await handler.apply(ctx, 'contract-1', { isDeleted: true });
        expect(powersOfAttorney.markContractDeleted).toHaveBeenCalledWith(ctx, 'contract-1');
        expect(powersOfAttorney.replaceForContract).not.toHaveBeenCalled();
    });
});
