import type { GeoConfig } from '../../components/MvLocationPicker/types';

const STORAGE_KEY = 'mv-geo-provider';

export function readStoredProvider(): string | null {
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

export function storeProvider(key: string): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
        // storage is a per-browser convenience only
    }
}

export function chooseProvider(config: GeoConfig, stored: string | null): string | null {
    const keys = config.providers.map(p => p.key);
    if (stored && keys.includes(stored)) return stored;
    if (config.defaultProvider && keys.includes(config.defaultProvider))
        return config.defaultProvider;
    return keys[0] ?? null;
}
