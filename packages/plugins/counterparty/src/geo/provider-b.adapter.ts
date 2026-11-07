import { GeoProvider, GeoSuggestion } from './geo-provider';

// Registry key provider-b = Google; search and reverse run in the browser (Places + Geocoder), the server only publishes its browser key.
export class ProviderBAdapter implements GeoProvider {
    readonly key = 'provider-b';
    readonly minIntervalMs = 0;
    readonly browserOnly = true;

    async search(): Promise<GeoSuggestion[]> {
        return [];
    }

    async reverse(): Promise<string | null> {
        return null;
    }
}
