import { ref, type Ref } from 'vue';
import { searchesThroughHost, type GeoConfig, type GeoPoint } from '@mivend/ui-kit';
import { i18n } from '../i18n';
import { loadGeoConfig, searchAddress } from '../api/geo';

export function providerNames(): Record<string, string> {
    const t = i18n.global.t;
    return {
        'provider-a': t('customers.tradingPoints.location.providers.provider-a'),
        'provider-b': t('customers.tradingPoints.location.providers.provider-b'),
        open: t('customers.tradingPoints.location.providers.open'),
    };
}

export interface LocationPick {
    open: Ref<boolean>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    config: Ref<GeoConfig | null>;
    suggestionPoint: Ref<GeoPoint | null>;
    start: () => Promise<void>;
}

export function useLocationPick(
    address: () => string,
    current: () => GeoPoint | null,
    sibling: () => GeoPoint | null,
): LocationPick {
    const open = ref(false);
    const loading = ref(false);
    const failed = ref(false);
    const config = ref<GeoConfig | null>(null);
    const suggestionPoint = ref<GeoPoint | null>(null);

    async function firstHit(loaded: GeoConfig): Promise<GeoPoint | null> {
        const text = address().trim();
        const provider = loaded.defaultProvider ?? loaded.providers[0]?.key;
        if (current() || text.length < 3 || !provider || !searchesThroughHost(provider))
            return null;
        try {
            const hit = (await searchAddress(text, sibling(), provider)).find(
                s => s.latitude != null && s.longitude != null,
            );
            return hit ? { latitude: hit.latitude!, longitude: hit.longitude! } : null;
        } catch {
            return null;
        }
    }

    async function start(): Promise<void> {
        loading.value = true;
        failed.value = false;
        try {
            config.value = await loadGeoConfig();
            suggestionPoint.value = await firstHit(config.value);
            open.value = true;
        } catch {
            failed.value = true;
        } finally {
            loading.value = false;
        }
    }

    return { open, loading, failed, config, suggestionPoint, start };
}
