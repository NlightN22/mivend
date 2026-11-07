import type { AdapterFactory, MapAdapter } from '../types';

const loaders: Record<string, () => Promise<MapAdapter>> = {
    'provider-a': async () => new (await import('./provider-a.adapter')).ProviderAAdapter(),
    'provider-b': async () => new (await import('./provider-b.adapter')).ProviderBAdapter(),
    open: async () => new (await import('./open.adapter')).OpenAdapter(),
};

export const createAdapter: AdapterFactory = async key => {
    const loader = loaders[key];
    if (!loader) throw new Error(`unknown provider ${key}`);
    return loader();
};

const hostSearchProviders = new Set(['open']);

export const searchesThroughHost = (key: string): boolean => hostSearchProviders.has(key);
