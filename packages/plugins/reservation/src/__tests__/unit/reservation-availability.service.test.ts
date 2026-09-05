import { describe, it, expect, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { WarehouseService } from '@mivend/plugin-access-control';

import { ReservationAvailabilityService } from '../../reservation-availability.service';

interface StockLevelRow {
    stockLocationId: string;
    stockOnHand: number;
    stockAllocated: number;
    customFields?: { erpAvailableQuantity?: number | null };
}

interface ReservationRow {
    stockLocationId: string;
    quantity: number;
    erpConfirmedAt?: Date | null;
}

interface Warehouse {
    branchId: string;
    erpId: string;
    isActive: boolean;
    includedInBranchAtp: boolean;
}

interface StockLocationRow {
    id: string;
    customFields?: { warehouseErpId?: string };
}

describe('ReservationAvailabilityService', () => {
    const ctx = {} as unknown as RequestContext;

    function createService(options: {
        stockLevels?: StockLevelRow[];
        reservations?: ReservationRow[];
        warehouses?: Warehouse[];
        stockLocations?: StockLocationRow[];
        defaultLocationId?: string;
    }): ReservationAvailabilityService {
        const stockLevels = options.stockLevels ?? [];
        const reservations = options.reservations ?? [];
        const stockLocations = options.stockLocations ?? [];

        const reservationRepo = {
            find: vi.fn(async ({ where }: { where: Array<{ stockLocationId: string }> }) => {
                const ids = new Set(where.map(w => w.stockLocationId));
                return reservations.filter(r => ids.has(r.stockLocationId));
            }),
        };
        const stockLevelRepo = {
            find: vi.fn(async ({ where }: { where: Array<{ stockLocationId: string }> }) => {
                const ids = new Set(where.map(w => w.stockLocationId));
                return stockLevels.filter(s => ids.has(s.stockLocationId));
            }),
        };
        const stockLocationRepo = {
            find: vi.fn(async () => stockLocations),
            createQueryBuilder: vi.fn(() => ({
                getOne: vi.fn(async () =>
                    options.defaultLocationId
                        ? { id: options.defaultLocationId }
                        : { id: 'location-1' },
                ),
            })),
        };
        const connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) => {
                switch (entity?.name) {
                    case 'StockLevel':
                        return stockLevelRepo;
                    case 'StockLocation':
                        return stockLocationRepo;
                    default:
                        return reservationRepo;
                }
            }),
        };
        const warehouseService = {
            findAll: vi.fn(async () => options.warehouses ?? []),
        };
        return new ReservationAvailabilityService(
            connection as unknown as TransactionalConnection,
            warehouseService as unknown as WarehouseService,
        );
    }

    it('sums quantity across active reservations for a variant at the default location when no branchId is given', async () => {
        const service = createService({
            reservations: [
                { stockLocationId: 'location-1', quantity: 2 },
                { stockLocationId: 'location-1', quantity: 5 },
            ],
        });
        const total = await service.getReservedQuantity(ctx, 'variant-1');
        expect(total).toBe(7);
    });

    it('subtracts stockAllocated and active reservations from stockOnHand at the default location', async () => {
        const service = createService({
            stockLevels: [{ stockLocationId: 'location-1', stockOnHand: 15, stockAllocated: 3 }],
            reservations: [{ stockLocationId: 'location-1', quantity: 4 }],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1');
        expect(available).toBe(8);
    });

    it('aggregates stockOnHand/stockAllocated/reservations across every StockLocation of a branch with multiple warehouses', async () => {
        const service = createService({
            warehouses: [
                { branchId: 'branch-a', erpId: 'wh-1', isActive: true, includedInBranchAtp: true },
                { branchId: 'branch-a', erpId: 'wh-2', isActive: true, includedInBranchAtp: true },
            ],
            stockLocations: [
                { id: 'loc-1', customFields: { warehouseErpId: 'wh-1' } },
                { id: 'loc-2', customFields: { warehouseErpId: 'wh-2' } },
            ],
            stockLevels: [
                { stockLocationId: 'loc-1', stockOnHand: 10, stockAllocated: 2 },
                { stockLocationId: 'loc-2', stockOnHand: 5, stockAllocated: 1 },
            ],
            reservations: [
                { stockLocationId: 'loc-1', quantity: 1 },
                { stockLocationId: 'loc-2', quantity: 3 },
            ],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1', 'branch-a');
        // (10 + 5) - (2 + 1) - (1 + 3) = 8
        expect(available).toBe(8);
    });

    it('excludes StockLocations belonging to other branches from the aggregate', async () => {
        const service = createService({
            warehouses: [
                { branchId: 'branch-a', erpId: 'wh-1', isActive: true, includedInBranchAtp: true },
                { branchId: 'branch-b', erpId: 'wh-2', isActive: true, includedInBranchAtp: true },
            ],
            stockLocations: [
                { id: 'loc-1', customFields: { warehouseErpId: 'wh-1' } },
                { id: 'loc-2', customFields: { warehouseErpId: 'wh-2' } },
            ],
            stockLevels: [
                { stockLocationId: 'loc-1', stockOnHand: 10, stockAllocated: 0 },
                { stockLocationId: 'loc-2', stockOnHand: 999, stockAllocated: 0 },
            ],
            reservations: [],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1', 'branch-a');
        expect(available).toBe(10);
    });

    it('falls back to the default StockLocation when the branch has no curated-included warehouses', async () => {
        const service = createService({
            warehouses: [
                {
                    branchId: 'branch-a',
                    erpId: 'wh-1',
                    isActive: false,
                    includedInBranchAtp: false,
                },
            ],
            stockLevels: [{ stockLocationId: 'location-1', stockOnHand: 7, stockAllocated: 2 }],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1', 'branch-a');
        expect(available).toBe(5);
    });

    it('excludes a warehouse curated out of branch ATP even when 1C still flags it isActive=true', async () => {
        const service = createService({
            warehouses: [
                { branchId: 'branch-a', erpId: 'wh-1', isActive: true, includedInBranchAtp: true },
                { branchId: 'branch-a', erpId: 'wh-2', isActive: true, includedInBranchAtp: false },
            ],
            stockLocations: [
                { id: 'loc-1', customFields: { warehouseErpId: 'wh-1' } },
                { id: 'loc-2', customFields: { warehouseErpId: 'wh-2' } },
            ],
            stockLevels: [
                { stockLocationId: 'loc-1', stockOnHand: 10, stockAllocated: 0 },
                { stockLocationId: 'loc-2', stockOnHand: 999, stockAllocated: 0 },
            ],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1', 'branch-a');
        expect(available).toBe(10);
    });

    it('falls back to the default StockLocation when the branch resolves no matching StockLocation yet', async () => {
        const service = createService({
            warehouses: [
                { branchId: 'branch-a', erpId: 'wh-1', isActive: true, includedInBranchAtp: true },
            ],
            stockLocations: [],
            stockLevels: [{ stockLocationId: 'location-1', stockOnHand: 6, stockAllocated: 1 }],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1', 'branch-a');
        expect(available).toBe(5);
    });

    it('keeps subtracting a CONFIRMED reservation locally too — erpConfirmedAt no longer stops local subtraction (mivend.audit.72 HIGH fix)', async () => {
        const service = createService({
            stockLevels: [
                {
                    stockLocationId: 'location-1',
                    stockOnHand: 15,
                    stockAllocated: 3,
                    customFields: { erpAvailableQuantity: 20 },
                },
            ],
            reservations: [
                { stockLocationId: 'location-1', quantity: 4, erpConfirmedAt: new Date() },
            ],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1');
        // 15 - 3 - 4 = 8, regardless of confirm state — closes the oversell window that existed
        // when a confirmed reservation stopped being subtracted locally while waiting for 1C's
        // own StockChanged to catch up.
        expect(available).toBe(8);
    });

    it('subtracts an UNCONFIRMED reservation locally exactly the same way as a confirmed one', async () => {
        const service = createService({
            stockLevels: [
                {
                    stockLocationId: 'location-1',
                    stockOnHand: 15,
                    stockAllocated: 3,
                    customFields: { erpAvailableQuantity: 20 },
                },
            ],
            reservations: [{ stockLocationId: 'location-1', quantity: 4, erpConfirmedAt: null }],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1');
        expect(available).toBe(8);
    });

    it('caps ATP at erpAvailableQuantity when 1C reports a lower number (a reservation from another channel mivend never saw)', async () => {
        const service = createService({
            stockLevels: [
                {
                    stockLocationId: 'location-1',
                    stockOnHand: 15,
                    stockAllocated: 0,
                    customFields: { erpAvailableQuantity: 3 },
                },
            ],
            reservations: [],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1');
        // Local would be 15, but 1C only reports 3 free (another channel's hold mivend has no
        // event for) — the lower number wins.
        expect(available).toBe(3);
    });

    it('falls back to the local number when 1C has never reported a StockChanged for this location (erpAvailableQuantity null)', async () => {
        const service = createService({
            stockLevels: [{ stockLocationId: 'location-1', stockOnHand: 15, stockAllocated: 3 }],
            reservations: [],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1');
        expect(available).toBe(12);
    });

    it('floors a negative capped result at 0 instead of understating the branch total (mivend.audit.72 LOW)', async () => {
        const service = createService({
            stockLevels: [
                {
                    stockLocationId: 'location-1',
                    stockOnHand: 5,
                    stockAllocated: 0,
                    // Malformed/negative value from 1C — not expected in practice, but
                    // stock.handler.ts doesn't validate the incoming payload.
                    customFields: { erpAvailableQuantity: -3 },
                },
            ],
            reservations: [],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1');
        expect(available).toBe(0);
    });

    it('applies the erpAvailableQuantity cap per StockLocation, not after summing across locations', async () => {
        const service = createService({
            warehouses: [
                { branchId: 'branch-a', erpId: 'wh-1', isActive: true, includedInBranchAtp: true },
                { branchId: 'branch-a', erpId: 'wh-2', isActive: true, includedInBranchAtp: true },
            ],
            stockLocations: [
                { id: 'loc-1', customFields: { warehouseErpId: 'wh-1' } },
                { id: 'loc-2', customFields: { warehouseErpId: 'wh-2' } },
            ],
            stockLevels: [
                {
                    stockLocationId: 'loc-1',
                    stockOnHand: 10,
                    stockAllocated: 0,
                    customFields: { erpAvailableQuantity: 2 },
                },
                { stockLocationId: 'loc-2', stockOnHand: 10, stockAllocated: 0 },
            ],
            reservations: [],
        });
        const available = await service.getAvailableToPromise(ctx, 'variant-1', 'branch-a');
        // loc-1 capped at 2 (not 10), loc-2 uncapped at 10 -> 2 + 10 = 12. A naive
        // sum-then-cap (min(20, 2)) would have wrongly produced 2 for the whole branch.
        expect(available).toBe(12);
    });
});
