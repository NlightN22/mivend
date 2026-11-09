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
    contactPoints: { replaceErpPointsByErpId: ReturnType<typeof vi.fn> };
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
    const contactPoints = { replaceErpPointsByErpId: vi.fn().mockResolvedValue(true) };
    const handler = new PointOfSaleStreamHandler(
        tradingPointService as never,
        contactPoints as never,
    );
    return { handler, tradingPointService, contactPoints };
}

describe('PointOfSaleStreamHandler', () => {
    const ctx = {} as RequestContext;

    describe('contactInfos', () => {
        const named = { name: 'Point', counterpartyId: 'cp-1', address: 'Street 1, 10' };

        it('replaces the ERP channels of the point from a present list, routing the ERP type names', async () => {
            const { handler, contactPoints } = makeHandler();
            await handler.apply(ctx, 'pos-1', {
                ...named,
                contactInfos: [
                    {
                        type: 'Телефон',
                        kindName: 'Work',
                        isPrimary: true,
                        presentation: '+7 912 345-67-89',
                    },
                ],
            });
            expect(contactPoints.replaceErpPointsByErpId).toHaveBeenCalledWith(
                ctx,
                'tradingPoint',
                'pos-1',
                [
                    {
                        type: 'phone',
                        value: '+7 912 345-67-89',
                        label: 'Work',
                        isPrimary: true,
                        comment: null,
                    },
                ],
            );
        });

        it('treats an explicitly empty list as a replace with nothing, and an absent list as no change', async () => {
            const { handler, contactPoints } = makeHandler();
            await handler.apply(ctx, 'pos-1', { ...named, contactInfos: [] });
            expect(contactPoints.replaceErpPointsByErpId).toHaveBeenCalledWith(
                ctx,
                'tradingPoint',
                'pos-1',
                [],
            );
            contactPoints.replaceErpPointsByErpId.mockClear();
            await handler.apply(ctx, 'pos-1', named);
            expect(contactPoints.replaceErpPointsByErpId).not.toHaveBeenCalled();
        });
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
            extra: expect.objectContaining({ code: 'K-001', isDeleted: false }),
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
        const contactInfos = [{ type: 'phone', kindName: 'Main', presentation: 'a@example.com' }];

        await handler.apply(ctx, 'pos-1', {
            name: 'Kiosk A',
            counterpartyId: 'cp-erp-1',
            regionId: 'region-gone',
            area: 12.5,
            hasCompetitors: true,
            pointTypeIds: ['type-1', 'type-unknown'],
            contactInfos,
        });

        expect(tradingPointService.upsertFromStream.mock.calls[0][2].extra).toMatchObject({
            regionId: 'region-gone',
            area: 12.5,
            hasCompetitors: true,
            mainManagerId: null,
            pointTypeIds: '["type-1","type-unknown"]',
            managerIds: '[]',
            contactInfos: JSON.stringify(contactInfos),
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

    // A named event is full state: absent/empty address, coordinates and phone mean cleared (#259).
    it('sends cleared values for address/latitude/longitude/contactPhone when absent or empty', async () => {
        const { handler, tradingPointService } = makeHandler();
        const payload = {
            name: 'Kiosk A',
            counterpartyId: 'cp-erp-1',
            isActive: true,
            contactPhone: '',
        };

        await handler.apply(ctx, 'pos-1', payload);
        await handler.apply(ctx, 'pos-1', payload);

        for (const [, , fields] of tradingPointService.upsertFromStream.mock.calls) {
            expect(fields).toMatchObject({
                address: '',
                latitude: null,
                longitude: null,
                contactPhone: null,
            });
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
