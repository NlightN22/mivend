import { Permission } from '@vendure/common/lib/generated-types';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { describe, expect, it, vi } from 'vitest';
import { AdminGeoResolver } from '../../geo/admin-geo.resolver';
import { GeoService } from '../../geo/geo.service';

function build() {
    const geo = {
        search: vi.fn().mockResolvedValue([{ address: 'Street 1', lat: 1, lng: 2 }]),
        reverse: vi.fn().mockResolvedValue('Street 1'),
        publicConfig: vi.fn().mockReturnValue({
            providers: [{ key: 'open', publicKey: null }],
            defaultProvider: 'open',
            defaultLat: 1,
            defaultLng: 2,
            defaultZoom: 7.4,
        }),
    };
    return { geo, resolver: new AdminGeoResolver(geo as unknown as GeoService) };
}

describe('AdminGeoResolver', () => {
    it('uses the read gate of the trading point mutations on all three queries', () => {
        for (const name of ['searchAddress', 'reverseGeocode', 'geoConfig'] as const) {
            const meta = Reflect.getMetadata(
                PERMISSIONS_METADATA_KEY,
                AdminGeoResolver.prototype[name],
            );
            expect(meta).toEqual([
                Permission.ReadCustomer,
                CustomPermission.ReadCounterparty.Permission,
            ]);
        }
    });

    it('maps search results and drops an out-of-range bias', async () => {
        const { geo, resolver } = build();
        const found = await resolver.searchAddress({} as never, {
            query: 'Street',
            biasLatitude: 99,
            biasLongitude: 2,
        });
        expect(found).toEqual([{ address: 'Street 1', latitude: 1, longitude: 2 }]);
        expect(geo.search).toHaveBeenCalledWith('Street', undefined, undefined);
    });

    it('returns null for out-of-range reverse coordinates and rounds the config zoom', async () => {
        const { geo, resolver } = build();
        expect(
            await resolver.reverseGeocode({} as never, { latitude: 91, longitude: 0 }),
        ).toBeNull();
        expect(geo.reverse).not.toHaveBeenCalled();
        expect(resolver.geoConfig({} as never).defaultZoom).toBe(7);
    });
});
