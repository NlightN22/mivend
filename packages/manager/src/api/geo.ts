import type { GeoConfig, GeoPoint, GeoSuggestion } from '@mivend/ui-kit';
import { adminApi } from './client';
import {
    GeoConfigDocument,
    ReverseGeocodeDocument,
    SearchAddressDocument,
    SuggestAddressDocument,
} from './generated/graphql';

let cachedConfig: Promise<GeoConfig> | null = null;

export function loadGeoConfig(): Promise<GeoConfig> {
    cachedConfig ??= adminApi(GeoConfigDocument)
        .then(result => result.geoConfig)
        .catch(error => {
            cachedConfig = null;
            throw error;
        });
    return cachedConfig;
}

export async function searchAddress(
    query: string,
    bias: GeoPoint | null,
    provider: string,
): Promise<GeoSuggestion[]> {
    const result = await adminApi(SearchAddressDocument, {
        query,
        biasLatitude: bias?.latitude ?? null,
        biasLongitude: bias?.longitude ?? null,
        provider,
    });
    return result.searchAddress;
}

export async function reverseGeocode(point: GeoPoint, provider: string): Promise<string | null> {
    const result = await adminApi(ReverseGeocodeDocument, { ...point, provider });
    return result.reverseGeocode ?? null;
}

export async function suggestAddress(query: string): Promise<string[]> {
    const result = await adminApi(SuggestAddressDocument, { query });
    return result.suggestAddress;
}
