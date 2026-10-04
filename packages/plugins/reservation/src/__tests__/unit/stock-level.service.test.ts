import { describe, it, expect, vi } from 'vitest';
import type { CustomerService, GlobalSettingsService, RequestContext } from '@vendure/core';
import type { BranchSettingsService, WarehouseService } from '@mivend/plugin-access-control';
import type { CounterpartyService } from '@mivend/plugin-counterparty';

import type { ReservationAvailabilityService } from '../../reservation-availability.service';
import { StockLevelService } from '../../stock-level.service';

function build(options: {
    activeUserId?: string;
    counterpartyBranchId?: string | null;
    defaultBranchId?: string | null;
    atp?: Record<string, number>;
    customFields?: Record<string, number | null>;
    warehouses?: Array<{ branchId: string | null; erpId: string; includedInBranchAtp: boolean }>;
}) {
    const batch = vi.fn(
        async () => new Map(Object.entries(options.atp ?? {})) as Map<string, number>,
    );
    const service = new StockLevelService(
        { getAvailableToPromiseBatch: batch } as unknown as ReservationAvailabilityService,
        {
            getGlobalDefaultBranchId: async () => options.defaultBranchId ?? null,
        } as unknown as BranchSettingsService,
        { findAll: async () => options.warehouses ?? [] } as unknown as WarehouseService,
        {
            getSettings: async () => ({ customFields: options.customFields ?? {} }),
        } as unknown as GlobalSettingsService,
        { findOneByUserId: async () => ({ id: 'customer-1' }) } as unknown as CustomerService,
        {
            getForCustomer: async () =>
                options.counterpartyBranchId === undefined
                    ? null
                    : { branchId: options.counterpartyBranchId },
        } as unknown as CounterpartyService,
    );
    const ctx = { activeUserId: options.activeUserId } as unknown as RequestContext;
    return { service, batch, ctx };
}

describe('StockLevelService', () => {
    it("guest: uses the default branch's warehouses and the default thresholds", async () => {
        const { service, batch, ctx } = build({
            defaultBranchId: 'branch-a',
            atp: { v1: 0, v2: 3, v3: 12, v4: 40 },
        });
        const tiers = await service.getTiers(ctx, ['v1', 'v2', 'v3', 'v4']);
        expect(batch).toHaveBeenCalledWith(ctx, ['v1', 'v2', 'v3', 'v4'], 'branch-a');
        expect([...tiers.values()]).toEqual([
            'OUT_OF_STOCK',
            'LOW_STOCK',
            'MEDIUM_STOCK',
            'HIGH_STOCK',
        ]);
    });

    it("logged-in customer: uses their counterparty's branch, not the default one", async () => {
        const { service, batch, ctx } = build({
            activeUserId: 'user-1',
            counterpartyBranchId: 'branch-b',
            defaultBranchId: 'branch-a',
            atp: { v1: 1 },
        });
        await service.getTiers(ctx, ['v1']);
        expect(batch).toHaveBeenCalledWith(ctx, ['v1'], 'branch-b');
    });

    it('logged-in customer without a counterparty branch falls back to the default branch', async () => {
        const { service, batch, ctx } = build({
            activeUserId: 'user-1',
            counterpartyBranchId: null,
            defaultBranchId: 'branch-a',
        });
        await service.getTiers(ctx, ['v1']);
        expect(batch).toHaveBeenCalledWith(ctx, ['v1'], 'branch-a');
    });

    it('reads thresholds from GlobalSettings custom fields when set', async () => {
        const { service, ctx } = build({
            defaultBranchId: 'branch-a',
            atp: { v1: 10 },
            customFields: { stockTierLowMax: 9, stockTierMediumMax: 50 },
        });
        expect((await service.getTiers(ctx, ['v1'])).get('v1')).toBe('MEDIUM_STOCK');
    });

    it("warehouse ids: only the viewer's branch warehouses flagged includedInBranchAtp", async () => {
        const warehouses = [
            { branchId: 'branch-a', erpId: 'wh-1', includedInBranchAtp: true },
            { branchId: 'branch-a', erpId: 'wh-2', includedInBranchAtp: false },
            { branchId: 'branch-b', erpId: 'wh-3', includedInBranchAtp: true },
            { branchId: null, erpId: 'wh-4', includedInBranchAtp: true },
        ];
        const guest = build({ defaultBranchId: 'branch-a', warehouses });
        expect(await guest.service.getViewerWarehouseErpIds(guest.ctx)).toEqual(['wh-1']);
        const other = build({
            activeUserId: 'user-1',
            counterpartyBranchId: 'branch-b',
            defaultBranchId: 'branch-a',
            warehouses,
        });
        expect(await other.service.getViewerWarehouseErpIds(other.ctx)).toEqual(['wh-3']);
    });

    it('warehouse ids: empty when no default branch exists (nothing to scope to)', async () => {
        const { service, ctx } = build({ defaultBranchId: null });
        expect(await service.getViewerWarehouseErpIds(ctx)).toEqual([]);
    });
});
