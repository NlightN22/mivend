import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PointOfSaleStreamHandler } from '../../handlers/point-of-sale.handler';
import { MissingDependencyError } from '../../types';

function makeHandler(
    findCounterpartyRefByErpId = vi
        .fn()
        .mockResolvedValue({ id: 'cp-local-1', branchId: 'branch-a' }),
    upsertFromStream = vi.fn().mockResolvedValue(undefined),
): {
    handler: PointOfSaleStreamHandler;
    tradingPointService: {
        findCounterpartyRefByErpId: ReturnType<typeof vi.fn>;
        upsertFromStream: ReturnType<typeof vi.fn>;
    };
} {
    const tradingPointService = { findCounterpartyRefByErpId, upsertFromStream };
    const handler = new PointOfSaleStreamHandler(tradingPointService as never);
    return { handler, tradingPointService };
}

describe('PointOfSaleStreamHandler', () => {
    const ctx = {} as RequestContext;

    // A deletion tombstone never carries a name — same convention as organization/counterparty.
    it('skips entirely when the payload has no name (deletion tombstone)', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', { isDeleted: true, counterpartyId: 'cp-erp-1' });

        expect(tradingPointService.findCounterpartyRefByErpId).not.toHaveBeenCalled();
        expect(tradingPointService.upsertFromStream).not.toHaveBeenCalled();
    });

    it('resolves the counterparty and upserts with address/latitude/longitude/contactPhone', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', {
            name: 'Kiosk A',
            code: 'K-001',
            counterpartyId: 'cp-erp-1',
            isActive: true,
            address: '655000, Хакасия Респ',
            latitude: 53.1,
            longitude: 91.4,
            contactPhone: '+7 (999) 123-45-66',
        });

        expect(tradingPointService.findCounterpartyRefByErpId).toHaveBeenCalledWith(
            ctx,
            'cp-erp-1',
        );
        expect(tradingPointService.upsertFromStream).toHaveBeenCalledWith(ctx, 'pos-1', {
            name: 'Kiosk A',
            counterpartyId: 'cp-local-1',
            servicingBranchId: 'branch-a',
            isActive: true,
            address: '655000, Хакасия Респ',
            latitude: 53.1,
            longitude: 91.4,
            contactPhone: '+7 (999) 123-45-66',
        });
    });

    // `code` has no matching TradingPoint field — must never leak into upsertFromStream.
    it('never forwards code even when present in the payload', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', {
            name: 'Kiosk A',
            code: 'K-001',
            counterpartyId: 'cp-erp-1',
            isActive: true,
        });

        const call = tradingPointService.upsertFromStream.mock.calls[0][2];
        expect(call).not.toHaveProperty('code');
    });

    // proto3 JSON encoding omits a scalar field equal to its zero-value — confirmed for this
    // contract's optional bool fields too (same as counterparty.handler.ts).
    it('defaults isActive to false when absent', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', { name: 'Kiosk A', counterpartyId: 'cp-erp-1' });

        expect(tradingPointService.upsertFromStream).toHaveBeenCalledWith(
            ctx,
            'pos-1',
            expect.objectContaining({ isActive: false }),
        );
    });

    it('treats isDeleted:true as inactive even when isActive is true', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', {
            name: 'Kiosk A',
            counterpartyId: 'cp-erp-1',
            isActive: true,
            isDeleted: true,
        });

        expect(tradingPointService.upsertFromStream).toHaveBeenCalledWith(
            ctx,
            'pos-1',
            expect.objectContaining({ isActive: false }),
        );
    });

    // Real optional-scalar fields — absence must read as undefined ("leave unchanged" on update,
    // "not yet available" on create), never coerced to a fabricated value.
    it('passes undefined for address/latitude/longitude/contactPhone when absent', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', {
            name: 'Kiosk A',
            counterpartyId: 'cp-erp-1',
            isActive: true,
        });

        const call = tradingPointService.upsertFromStream.mock.calls[0][2];
        expect(call.address).toBeUndefined();
        expect(call.latitude).toBeUndefined();
        expect(call.longitude).toBeUndefined();
        expect(call.contactPhone).toBeUndefined();
    });

    // Ordinary eventual-consistency race (the counterparty's own event hasn't arrived yet) —
    // retryable, never a silent skip that would permanently drop this trading point.
    it('throws MissingDependencyError when the counterparty erpId has never been seen', async () => {
        const findCounterpartyRefByErpId = vi.fn().mockResolvedValue(null);
        const { handler, tradingPointService } = makeHandler(findCounterpartyRefByErpId);

        await expect(
            handler.apply(ctx, 'pos-1', {
                name: 'Kiosk A',
                counterpartyId: 'cp-erp-unknown',
                isActive: true,
            }),
        ).rejects.toThrow(MissingDependencyError);
        expect(tradingPointService.upsertFromStream).not.toHaveBeenCalled();
    });
});
