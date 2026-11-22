import { GeoProvider, GeoProviderConfig } from './geo-provider';
import { OpenAdapter } from './open.adapter';
import { ProviderAAdapter } from './provider-a.adapter';
import { ProviderBAdapter } from './provider-b.adapter';

interface GeoRegistration {
    create: (config: GeoProviderConfig) => GeoProvider;
    hosts: string[];
}

const registry: Record<string, GeoRegistration> = {
    'provider-a': { create: () => new ProviderAAdapter(), hosts: ['api-maps.yandex.com'] },
    'provider-b': { create: () => new ProviderBAdapter(), hosts: ['maps.googleapis.com'] },
    open: {
        create: c => new OpenAdapter(c),
        hosts: ['nominatim.openstreetmap.org', 'tile.openstreetmap.org'],
    },
};

export function createGeoProvider(key: string, config: GeoProviderConfig): GeoProvider {
    const registration = registry[key];
    if (!registration)
        throw new Error(
            `Unknown geo provider "${key}" in GEO_PROVIDERS, expected: ${Object.keys(registry).join(', ')}`,
        );
    return registration.create(config);
}

export function geoProviderHosts(keys: string[]): string[] {
    return keys.flatMap(key => registry[key]?.hosts ?? []);
}

export function geoEnvPrefix(key: string): string {
    return `GEO_${key.toUpperCase().replace(/-/g, '_')}`;
}
