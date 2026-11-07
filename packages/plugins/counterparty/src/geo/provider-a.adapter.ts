import { GeoProvider, GeoSuggestion } from './geo-provider';

// Registry key provider-a = Yandex; suggest, search and reverse run in the browser (JS API 3.0), the server only publishes its browser settings.
export class ProviderAAdapter implements GeoProvider {
    readonly key = 'provider-a';
    readonly minIntervalMs = 0;
    readonly browserOnly = true;

    async search(): Promise<GeoSuggestion[]> {
        return [];
    }

    async reverse(): Promise<string | null> {
        return null;
    }
}
