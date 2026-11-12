import { Permission } from '@vendure/common/lib/generated-types';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { describe, expect, it, vi } from 'vitest';
import { AdminGeoResolver } from '../../geo/admin-geo.resolver';
import { AddressSuggestService } from '../../address-suggest.service';
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
    const suggestions = { suggest: vi.fn().mockResolvedValue(['Street 1, 10']) };
    return {
        geo,
        suggestions,
        resolver: new AdminGeoResolver(
            geo as unknown as GeoService,
            suggestions as unknown as AddressSuggestService,
        ),
    };
}

describe('AdminGeoResolver', () => {
    it('uses the read gate of the trading point mutations on all four queries', () => {
        for (const name of [
            'searchAddress',
            'suggestAddress',
            'reverseGeocode',
            'geoConfig',
        ] as const) {
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

    it('returns the address suggestions for a staff query', async () => {
        const { suggestions, resolver } = build();
        expect(await resolver.suggestAddress({} as never, { query: 'Street' })).toEqual([
            'Street 1, 10',
        ]);
        expect(suggestions.suggest).toHaveBeenCalledWith('Street');
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
