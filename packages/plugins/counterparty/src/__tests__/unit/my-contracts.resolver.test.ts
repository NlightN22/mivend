import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { MyContractsResolver } from '../../my-contracts.resolver';
import { toShopContract } from '../../my-contracts';
import type { ContractService } from '../../contract.service';
import type { TradingPointService } from '../../trading-point.service';
import type { Contract } from '../../entities/contract.entity';

const ctx = {} as RequestContext;

function contract(patch: Partial<Contract>): Contract {
    return {
        id: 7,
        name: 'Main',
        currency: 'RUB',
        creditLimit: '1000',
        effectiveCreditLimit: null,
        paymentDelayDays: 14,
        debtDaysLimit: 30,
        ...patch,
    } as Contract;
}

function resolverFor(
    counterpartyId: string | null,
    contracts: Contract[],
): { resolver: MyContractsResolver; find: ReturnType<typeof vi.fn> } {
    const find = vi.fn().mockResolvedValue(contracts);
    const resolver = new MyContractsResolver(
        {
            getCounterpartyIdForUser: vi.fn().mockResolvedValue(counterpartyId),
        } as unknown as TradingPointService,
        { findActiveCustomerContracts: find } as unknown as ContractService,
    );
    return { resolver, find };
}

describe('myContracts', () => {
    it('queries only the caller own counterparty', async () => {
        const { resolver, find } = resolverFor('42', [contract({})]);
        const result = await resolver.myContracts(ctx);
        expect(find).toHaveBeenCalledWith(ctx, '42');
        expect(result).toEqual([
            {
                id: '7',
                name: 'Main',
                currency: 'RUB',
                creditLimit: 1000,
                paymentDelayDays: 14,
                debtDaysLimit: 30,
            },
        ]);
    });

    it('returns nothing and never queries without a linked counterparty', async () => {
        const { resolver, find } = resolverFor(null, [contract({})]);
        expect(await resolver.myContracts(ctx)).toEqual([]);
        expect(find).not.toHaveBeenCalled();
    });
});

describe('toShopContract', () => {
    it('prefers the effective limit over the ERP limit', () => {
        expect(toShopContract(contract({ effectiveCreditLimit: '400.50' })).creditLimit).toBe(
            400.5,
        );
    });

    it('treats a missing or non-numeric limit as no limit', () => {
        expect(toShopContract(contract({ creditLimit: null })).creditLimit).toBeNull();
        expect(toShopContract(contract({ creditLimit: 'n/a' })).creditLimit).toBeNull();
    });
});
