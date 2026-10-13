import { describe, expect, it } from 'vitest';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
import { Permission } from '@vendure/common/lib/generated-types';

import { SettlementShopResolver } from '../../settlement-shop.resolver';

describe('SettlementShopResolver', () => {
    it('requires an authenticated customer on both queries', () => {
        for (const name of ['settlementDocuments', 'settlementBalances'] as const) {
            const permissions = Reflect.getMetadata(
                PERMISSIONS_METADATA_KEY,
                SettlementShopResolver.prototype[name],
            );
            expect(permissions).toContain(Permission.Authenticated);
        }
    });

    it('returns nothing for a user without a counterparty', async () => {
        const resolver = new SettlementShopResolver(
            {} as never,
            { getCounterpartyIdForUser: async () => null } as never,
        );
        expect(await resolver.settlementDocuments({} as never, {})).toEqual({
            items: [],
            totalItems: 0,
        });
        expect(await resolver.settlementBalances({} as never, {})).toEqual([]);
    });
});
