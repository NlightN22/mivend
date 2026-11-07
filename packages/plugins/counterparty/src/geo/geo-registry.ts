import { GeoProvider, GeoProviderConfig } from './geo-provider';
import { OpenAdapter } from './open.adapter';
import { ProviderAAdapter } from './provider-a.adapter';
import { ProviderBAdapter } from './provider-b.adapter';

const factories: Record<string, (config: GeoProviderConfig) => GeoProvider> = {
    'provider-a': c => new ProviderAAdapter(c),
    'provider-b': c => new ProviderBAdapter(c),
    open: c => new OpenAdapter(c),
};

export function createGeoProvider(
    key: string | undefined,
    config: GeoProviderConfig,
): GeoProvider | null {
    if (!key) return null;
    const factory = factories[key];
    if (!factory)
        throw new Error(
            `Unknown GEO_PROVIDER "${key}", expected one of: ${Object.keys(factories).join(', ')}`,
        );
    if (key !== 'open' && !config.apiKey) return null;
    return factory(config);
}
