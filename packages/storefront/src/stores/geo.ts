import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { GeoConfig, GeoPoint, GeoSuggestion } from '@mivend/ui-kit';
import { shopApi } from '../api/client';
import {
    GeoConfigDocument,
    ReverseGeocodeDocument,
    SearchAddressDocument,
} from '../api/generated/graphql';

export const useGeoStore = defineStore('geo', () => {
    const config = ref<GeoConfig | null>(null);
    let inFlight: Promise<GeoConfig> | null = null;

    function loadConfig(): Promise<GeoConfig> {
        if (config.value) return Promise.resolve(config.value);
        inFlight ??= shopApi(GeoConfigDocument)
            .then(result => {
                config.value = result.geoConfig;
                return result.geoConfig;
            })
            .finally(() => {
                inFlight = null;
            });
        return inFlight;
    }

    async function search(
        query: string,
        bias: GeoPoint | null,
        provider: string,
    ): Promise<GeoSuggestion[]> {
        const result = await shopApi(SearchAddressDocument, {
            query,
            biasLatitude: bias?.latitude ?? null,
            biasLongitude: bias?.longitude ?? null,
            provider,
        });
        return result.searchAddress;
    }

    async function reverse(point: GeoPoint, provider: string): Promise<string | null> {
        const result = await shopApi(ReverseGeocodeDocument, { ...point, provider });
        return result.reverseGeocode ?? null;
    }

    return { config, loadConfig, search, reverse };
});
