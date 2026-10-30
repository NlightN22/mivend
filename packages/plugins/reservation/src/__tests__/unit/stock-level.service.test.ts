import { describe, it, expect, vi } from 'vitest';
import type {
    CustomerService,
    GlobalSettingsService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
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
    ratios?: Record<string, number>;
    packagesOnly?: boolean;
    warehouses?: Array<{ branchId: string | null; erpId: string; includedInBranchAtp: boolean }>;
}) {
    const batch = vi.fn(
        async () => new Map(Object.entries(options.atp ?? {})) as Map<string, number>,
    );
    const resolveEffective = vi.fn(async () => ({ packagesOnly: options.packagesOnly ?? false }));
    const query = vi.fn(async () =>
        Object.entries(options.ratios ?? {}).map(([id, ratio]) => ({ id, ratio })),
    );
    const service = new StockLevelService(
        { getAvailableToPromiseBatch: batch } as unknown as ReservationAvailabilityService,
        {
            getGlobalDefaultBranchId: async () => options.defaultBranchId ?? null,
            resolveEffective,
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
        { getRepository: () => ({ query }) } as unknown as TransactionalConnection,
    );
    const ctx = { activeUserId: options.activeUserId } as unknown as RequestContext;
    return { service, batch, ctx, query, resolveEffective };
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

    it('getTier batches the lookups of one request into a single ATP query', async () => {
        const { service, batch, ctx } = build({
            defaultBranchId: 'branch-a',
            atp: { v1: 0, v2: 7 },
        });
        const tiers = await Promise.all([
            service.getTier(ctx, 'v1'),
            service.getTier(ctx, 'v2'),
            service.getTier(ctx, 'v1'),
        ]);
        expect(tiers).toEqual(['OUT_OF_STOCK', 'MEDIUM_STOCK', 'OUT_OF_STOCK']);
        expect(batch).toHaveBeenCalledTimes(1);
        expect(batch).toHaveBeenCalledWith(ctx, ['v1', 'v2'], 'branch-a');
    });

    it('counts whole packs for a packs-only branch and leaves base-unit variants alone', async () => {
        const { service, ctx, query } = build({
            defaultBranchId: 'branch-a',
            atp: { '1': 20, '2': 100, '3': 20 },
            ratios: { '1': 50, '2': 50 },
            packagesOnly: true,
        });
        const tiers = await service.getTiers(ctx, ['1', '2', '3']);
        expect([...tiers.values()]).toEqual(['OUT_OF_STOCK', 'LOW_STOCK', 'HIGH_STOCK']);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('keeps base units when the branch sells by the piece', async () => {
        const { service, ctx } = build({
            defaultBranchId: 'branch-a',
            atp: { '1': 20 },
            ratios: { '1': 50 },
            packagesOnly: false,
        });
        expect((await service.getTiers(ctx, ['1'])).get('1')).toBe('HIGH_STOCK');
    });

    it('does not read branch settings when no variant has a pack ratio', async () => {
        const { service, ctx, resolveEffective } = build({
            defaultBranchId: 'branch-a',
            atp: { '1': 20 },
        });
        await service.getTiers(ctx, ['1']);
        expect(resolveEffective).not.toHaveBeenCalled();
    });
});
