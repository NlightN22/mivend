import { Args, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';

import { GeoPublicConfig, GeoService } from './geo.service';

const EMPTY_CONFIG: GeoPublicConfig = {
    providers: [],
    defaultProvider: null,
    defaultLat: null,
    defaultLng: null,
    defaultZoom: null,
};

@Resolver()
export class GeoResolver {
    constructor(private geo: GeoService) {}

    @Query()
    async searchAddress(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            query: string;
            biasLatitude?: number | null;
            biasLongitude?: number | null;
            provider?: string | null;
        },
    ): Promise<Array<{ address: string; latitude?: number; longitude?: number }>> {
        if (!ctx.activeUserId) return [];
        const { biasLatitude: lat, biasLongitude: lng } = args;
        const bias =
            typeof lat === 'number' && typeof lng === 'number' && isCoordinate(lat, lng)
                ? { lat, lng }
                : undefined;
        const found = await this.geo.search(args.query, bias, args.provider);
        return found.map(s => ({ address: s.address, latitude: s.lat, longitude: s.lng }));
    }

    @Query()
    async reverseGeocode(
        @Ctx() ctx: RequestContext,
        @Args() args: { latitude: number; longitude: number; provider?: string | null },
    ): Promise<string | null> {
        if (!ctx.activeUserId || !isCoordinate(args.latitude, args.longitude)) return null;
        return this.geo.reverse({ lat: args.latitude, lng: args.longitude }, args.provider);
    }

    @Query()
    geoConfig(@Ctx() ctx: RequestContext): Record<string, unknown> {
        const c = ctx.activeUserId ? this.geo.publicConfig() : EMPTY_CONFIG;
        return {
            providers: c.providers,
            defaultProvider: c.defaultProvider,
            defaultLatitude: c.defaultLat,
            defaultLongitude: c.defaultLng,
            defaultZoom: c.defaultZoom === null ? null : Math.round(c.defaultZoom),
        };
    }
}

function isCoordinate(lat: number, lng: number): boolean {
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
