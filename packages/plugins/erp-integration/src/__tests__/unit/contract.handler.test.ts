import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ContractStreamHandler } from '../../handlers/contract.handler';
import { MissingDependencyError } from '../../types';

function makeHandler(
    upsertActiveState = vi.fn().mockResolvedValue(undefined),
    findByErpId = vi.fn().mockResolvedValue({ id: 'local-cp-1' }),
    deactivateTombstone = vi.fn().mockResolvedValue(undefined),
): {
    handler: ContractStreamHandler;
    contractService: {
        upsertActiveState: ReturnType<typeof vi.fn>;
        deactivateTombstone: ReturnType<typeof vi.fn>;
    };
    counterpartyService: { findByErpId: ReturnType<typeof vi.fn> };
} {
    const contractService = { upsertActiveState, deactivateTombstone };
    const counterpartyService = { findByErpId };
    const handler = new ContractStreamHandler(
        contractService as never,
        counterpartyService as never,
    );
    return { handler, contractService, counterpartyService };
}

describe('ContractStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('resolves counterpartyId to the local Counterparty.id before upserting', async () => {
        const { handler, contractService, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'contract-1', {
            name: 'General contract',
            isActive: true,
            counterpartyId: 'erp-cp-1',
            organizationId: 'org-1',
            priceTypeId: 'pt-1',
            contractKind: 'СПокупателем',
            contractType: 'ТоварыИУслуги',
        });

        expect(counterpartyService.findByErpId).toHaveBeenCalledWith(ctx, 'erp-cp-1');
        expect(contractService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'contract-1',
            expect.objectContaining({ counterpartyId: 'local-cp-1', name: 'General contract' }),
        );
    });

    // Ordinary eventual-consistency race (Kafka gives no cross-topic ordering guarantee) —
    // retryable, same as every sibling handler's cross-entity dependency.
    it('throws MissingDependencyError when the counterparty erpId is not synced yet', async () => {
        const { handler, contractService } = makeHandler(
            undefined,
            vi.fn().mockResolvedValue(null),
        );

        await expect(
            handler.apply(ctx, 'contract-1', {
                name: 'General contract',
                isActive: true,
                counterpartyId: 'erp-cp-unknown',
                organizationId: 'org-1',
                priceTypeId: 'pt-1',
                contractKind: 'СПокупателем',
                contractType: 'ТоварыИУслуги',
            }),
        ).rejects.toThrow(MissingDependencyError);
        expect(contractService.upsertActiveState).not.toHaveBeenCalled();
    });

    // A tombstone never carries a name — must deactivate-only by erpId, never look up the
    // counterparty or touch upsertActiveState (mivend.audit.common finding, same class of bug
    // as the point-of-sale #100 tombstone fix).
    it('deactivates by erpId only on a tombstone, without any counterparty lookup or field write', async () => {
        const { handler, contractService, counterpartyService } = makeHandler();

        await handler.apply(ctx, 'contract-1', {
            isDeleted: true,
            counterpartyId: 'erp-cp-1',
            organizationId: 'org-1',
            priceTypeId: 'pt-1',
            contractKind: 'СПокупателем',
            contractType: 'ТоварыИУслуги',
        });

        expect(contractService.deactivateTombstone).toHaveBeenCalledWith(ctx, 'contract-1');
        expect(counterpartyService.findByErpId).not.toHaveBeenCalled();
        expect(contractService.upsertActiveState).not.toHaveBeenCalled();
    });

    it('reads controlledIndividually as false, not undefined, when absent (proto3 zero-value omission)', async () => {
        const { handler, contractService } = makeHandler();

        await handler.apply(ctx, 'contract-1', {
            name: 'General contract',
            isActive: true,
            counterpartyId: 'erp-cp-1',
            organizationId: 'org-1',
            priceTypeId: 'pt-1',
            contractKind: 'СПокупателем',
            contractType: 'ТоварыИУслуги',
            controlledIndividually: true,
            creditLimit: '10000',
        });

        expect(contractService.upsertActiveState).toHaveBeenCalledWith(
            ctx,
            'contract-1',
            expect.objectContaining({ controlledIndividually: true, creditLimit: '10000' }),
        );

        contractService.upsertActiveState.mockClear();
        await handler.apply(ctx, 'contract-2', {
            name: 'Other contract',
            isActive: true,
            counterpartyId: 'erp-cp-1',
            organizationId: 'org-1',
            priceTypeId: 'pt-1',
            contractKind: 'СПокупателем',
            contractType: 'ТоварыИУслуги',
        });
        const call = contractService.upsertActiveState.mock.calls[0][2];
        // Absent must read as false (a real true→false transition from ERP never re-sends the
        // key), never left undefined/"unchanged" — that would freeze a stale `true` forever.
        expect(call.controlledIndividually).toBe(false);
        expect(call.debtDaysLimit).toBeNull();
        expect(call.paymentDelayDays).toBeNull();
        expect(call.creditLimit).toBeUndefined();
    });
});
