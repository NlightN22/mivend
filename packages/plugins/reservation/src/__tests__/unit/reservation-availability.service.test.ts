import { describe, it, expect, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationAvailabilityService } from '../../reservation-availability.service';

describe('ReservationAvailabilityService', () => {
    const ctx = {} as unknown as RequestContext;

    function createService(
        reservationRows: unknown[],
        stockLevel: { stockOnHand: number; stockAllocated: number } | null,
    ): ReservationAvailabilityService {
        const reservationRepo = { find: vi.fn(async () => reservationRows) };
        const stockLevelRepo = { findOne: vi.fn(async () => stockLevel) };
        const stockLocationRepo = {
            createQueryBuilder: vi.fn(() => ({
                getOne: vi.fn(async () => ({ id: 'location-1' })),
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
        return new ReservationAvailabilityService(connection as unknown as TransactionalConnection);
    }

    it('sums quantity across active reservations for a variant at the default location', async () => {
        const service = createService([{ quantity: 2 }, { quantity: 5 }], null);
        const total = await service.getReservedQuantity(ctx, 'variant-1');
        expect(total).toBe(7);
    });

    it('subtracts stockAllocated and active reservations from stockOnHand', async () => {
        const service = createService([{ quantity: 4 }], { stockOnHand: 15, stockAllocated: 3 });
        const available = await service.getAvailableToPromise(ctx, 'variant-1');
        expect(available).toBe(8);
    });
});
