import {
    finite,
    GEO_MAX_RESULTS,
    getJson,
    GeoPoint,
    GeoProvider,
    GeoProviderConfig,
    GeoSuggestion,
} from './geo-provider';

// Registry key provider-a = Yandex Geocoder HTTP API; "pos" is "lon lat". Terms require showing results on its map.
const BASE_URL = 'https://geocode-maps.yandex.ru/1.x/';

interface FeatureMember {
    GeoObject?: {
        metaDataProperty?: { GeocoderMetaData?: { text?: string } };
        Point?: { pos?: string };
    };
}
interface Body {
    response?: { GeoObjectCollection?: { featureMember?: FeatureMember[] } };
}

export class ProviderAAdapter implements GeoProvider {
    readonly key = 'provider-a';
    readonly minIntervalMs = 0;

    constructor(private readonly config: GeoProviderConfig) {}

    async search(text: string, bias?: GeoPoint): Promise<GeoSuggestion[]> {
        const params: Record<string, string> = { geocode: text, results: String(GEO_MAX_RESULTS) };
        if (bias) params.ll = `${bias.lng},${bias.lat}`;
        return this.query(params);
    }

    async reverse(point: GeoPoint): Promise<string | null> {
        const [first] = await this.query({
            geocode: `${point.lng},${point.lat}`,
            sco: 'longlat',
            results: '1',
        });
        return first?.address ?? null;
    }

    private async query(extra: Record<string, string>): Promise<GeoSuggestion[]> {
        const params = new URLSearchParams({
            apikey: this.config.apiKey,
            format: 'json',
            ...extra,
        });
        const body = (await getJson(
            this.config.fetch,
            `${this.config.baseUrl ?? BASE_URL}?${params}`,
        )) as Body;
        const members = body.response?.GeoObjectCollection?.featureMember ?? [];
        return members.flatMap(m => {
            const address = m.GeoObject?.metaDataProperty?.GeocoderMetaData?.text;
            if (!address) return [];
            const [lng, lat] = (m.GeoObject?.Point?.pos ?? '').split(' ').map(finite);
            return [lat !== undefined && lng !== undefined ? { address, lat, lng } : { address }];
        });
    }
}
