import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { PointOfSaleStreamHandler } from '../../handlers/point-of-sale.handler';
import { MissingDependencyError } from '../../types';

function makeHandler(
    findCounterpartyRefByErpId = vi
        .fn()
        .mockResolvedValue({ id: 'cp-local-1', branchId: 'branch-a' }),
    upsertFromStream = vi.fn().mockResolvedValue(undefined),
    deactivate = vi.fn().mockResolvedValue(undefined),
    markErpDeleted = vi.fn().mockResolvedValue(false),
): {
    handler: PointOfSaleStreamHandler;
    tradingPointService: {
        findCounterpartyRefByErpId: ReturnType<typeof vi.fn>;
        upsertFromStream: ReturnType<typeof vi.fn>;
        deactivate: ReturnType<typeof vi.fn>;
        markErpDeleted: ReturnType<typeof vi.fn>;
    };
} {
    const tradingPointService = {
        findCounterpartyRefByErpId,
        upsertFromStream,
        deactivate,
        markErpDeleted,
    };
    const handler = new PointOfSaleStreamHandler(tradingPointService as never);
    return { handler, tradingPointService };
}

describe('PointOfSaleStreamHandler', () => {
    const ctx = {} as RequestContext;

    // Address, phone and channels come from the contact-info stream: a point event must never clear them.
    it('sends no address or phone, so a stored one is kept', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', {
            name: 'Kiosk A',
            counterpartyId: 'cp-erp-1',
            isActive: true,
            address: 'Street 1',
            contactPhone: '+7 999',
        });

        const fields = tradingPointService.upsertFromStream.mock.calls[0][2];
        expect(fields).not.toHaveProperty('address');
        expect(fields).not.toHaveProperty('contactPhone');
        expect(fields.extra).not.toHaveProperty('contactInfos');
    });

    // Audit HIGH: a bare `return` here previously left a deleted-in-ERP point permanently active.
    it('deactivates an existing point on a deletion tombstone (no name), without a counterparty lookup', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', { isDeleted: true });

        expect(tradingPointService.deactivate).toHaveBeenCalledWith(ctx, 'pos-1');
        expect(tradingPointService.markErpDeleted).toHaveBeenCalledWith(ctx, 'pos-1');
        expect(tradingPointService.findCounterpartyRefByErpId).not.toHaveBeenCalled();
        expect(tradingPointService.upsertFromStream).not.toHaveBeenCalled();
    });

    it('resolves the counterparty and upserts with latitude/longitude', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', {
            name: 'Kiosk A',
            code: 'K-001',
            counterpartyId: 'cp-erp-1',
            isActive: true,
            latitude: 53.1,
            longitude: 91.4,
        });

        expect(tradingPointService.findCounterpartyRefByErpId).toHaveBeenCalledWith(
            ctx,
            'cp-erp-1',
        );
        expect(tradingPointService.upsertFromStream).toHaveBeenCalledWith(ctx, 'pos-1', {
            extra: expect.objectContaining({ code: 'K-001', isDeleted: false }),
            name: 'Kiosk A',
            counterpartyId: 'cp-local-1',
            servicingBranchId: 'branch-a',
            isActive: true,
            latitude: 53.1,
            longitude: 91.4,
        });
    });

    // code goes to the ERP mirror only (inside extra), never onto mivend's own record fields.
    it('never forwards code as a TradingPoint field', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', {
            name: 'Kiosk A',
            code: 'K-001',
            counterpartyId: 'cp-erp-1',
            isActive: true,
        });

        const call = tradingPointService.upsertFromStream.mock.calls[0][2];
        expect(call).not.toHaveProperty('code');
        expect(call.extra.code).toBe('K-001');
    });

    it('keeps the unread fields as sent: lists as untouched JSON, absent ones cleared, missing region still stored', async () => {
        const { handler, tradingPointService } = makeHandler();

        await handler.apply(ctx, 'pos-1', {
            name: 'Kiosk A',
            counterpartyId: 'cp-erp-1',
            regionId: 'region-gone',
            area: 12.5,
            hasCompetitors: true,
            pointTypeIds: ['type-1', 'type-unknown'],
        });

        expect(tradingPointService.upsertFromStream.mock.calls[0][2].extra).toMatchObject({
            regionId: 'region-gone',
            area: 12.5,
            hasCompetitors: true,
            mainManagerId: null,
            pointTypeIds: '["type-1","type-unknown"]',
            managerIds: '[]',
        });
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

    // A named event is full state for the fields it still carries: absent coordinates mean cleared (#259).
    it('sends cleared coordinates when absent', async () => {
        const { handler, tradingPointService } = makeHandler();
        const payload = {
            name: 'Kiosk A',
            counterpartyId: 'cp-erp-1',
            isActive: true,
        };

        await handler.apply(ctx, 'pos-1', payload);
        await handler.apply(ctx, 'pos-1', payload);

        for (const [, , fields] of tradingPointService.upsertFromStream.mock.calls) {
            expect(fields).toMatchObject({ latitude: null, longitude: null });
        }
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
