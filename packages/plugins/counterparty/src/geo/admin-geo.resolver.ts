import { Args, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { CustomPermission } from '@mivend/plugin-access-control';
import { Allow, Ctx, RequestContext } from '@vendure/core';

import { isCoordinate } from './geo.resolver';
import { GeoService } from './geo.service';

@Resolver()
export class AdminGeoResolver {
    constructor(private geo: GeoService) {}

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async searchAddress(
        @Ctx() _ctx: RequestContext,
        @Args()
        args: {
            query: string;
            biasLatitude?: number | null;
            biasLongitude?: number | null;
            provider?: string | null;
        },
    ): Promise<Array<{ address: string; latitude?: number; longitude?: number }>> {
        const { biasLatitude: lat, biasLongitude: lng } = args;
        const bias =
            typeof lat === 'number' && typeof lng === 'number' && isCoordinate(lat, lng)
                ? { lat, lng }
                : undefined;
        const found = await this.geo.search(args.query, bias, args.provider);
        return found.map(s => ({ address: s.address, latitude: s.lat, longitude: s.lng }));
    }

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async reverseGeocode(
        @Ctx() _ctx: RequestContext,
        @Args() args: { latitude: number; longitude: number; provider?: string | null },
    ): Promise<string | null> {
        if (!isCoordinate(args.latitude, args.longitude)) return null;
        return this.geo.reverse({ lat: args.latitude, lng: args.longitude }, args.provider);
    }

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    geoConfig(@Ctx() _ctx: RequestContext): Record<string, unknown> {
        const c = this.geo.publicConfig();
        return {
            providers: c.providers,
            defaultProvider: c.defaultProvider,
            defaultLatitude: c.defaultLat,
            defaultLongitude: c.defaultLng,
            defaultZoom: c.defaultZoom === null ? null : Math.round(c.defaultZoom),
        };
    }
}
