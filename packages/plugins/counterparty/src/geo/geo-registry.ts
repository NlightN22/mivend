import { GeoProvider, GeoProviderConfig } from './geo-provider';
import { OpenAdapter } from './open.adapter';
import { ProviderAAdapter } from './provider-a.adapter';
import { ProviderBAdapter } from './provider-b.adapter';

const factories: Record<string, (config: GeoProviderConfig) => GeoProvider> = {
    'provider-a': c => new ProviderAAdapter(c),
    'provider-b': c => new ProviderBAdapter(c),
    open: c => new OpenAdapter(c),
};

export function createGeoProvider(key: string, config: GeoProviderConfig): GeoProvider {
    const factory = factories[key];
    if (!factory)
        throw new Error(
            `Unknown geo provider "${key}" in GEO_PROVIDERS, expected: ${Object.keys(factories).join(', ')}`,
        );
    return factory(config);
}

export function geoEnvPrefix(key: string): string {
    return `GEO_${key.toUpperCase().replace(/-/g, '_')}`;
}
