import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserInputError } from '@vendure/core';

import { TradingPointAdminResolver } from '../../trading-point.resolver';

describe('upsertTradingPoint location', () => {
    const upsert = vi.fn();
    const resolver = new TradingPointAdminResolver({ upsert } as never, {} as never, {} as never);
    const args = {
        erpId: 'tp-1',
        counterpartyErpId: 'cp-1',
        name: 'Point',
        address: 'Addr',
        isActive: true,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('refuses a point without a location', async () => {
        await expect(resolver.upsertTradingPoint({} as never, args)).rejects.toThrow(
            UserInputError,
        );
        expect(upsert).not.toHaveBeenCalled();
    });

    it('refuses (0, 0)', async () => {
        await expect(
            resolver.upsertTradingPoint({} as never, { ...args, latitude: 0, longitude: 0 }),
        ).rejects.toThrow(UserInputError);
    });

    it('passes a valid location to the service', async () => {
        await resolver.upsertTradingPoint({} as never, { ...args, latitude: 1, longitude: 2 });
        expect(upsert).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ latitude: 1, longitude: 2 }),
        );
    });
});
