import {
    finite,
    GEO_MAX_RESULTS,
    getJson,
    GeoPoint,
    GeoProvider,
    GeoProviderConfig,
    GeoSuggestion,
} from './geo-provider';

// Registry key provider-b = Google Geocoding API; errors arrive as HTTP 200 with a "status" field.
const BASE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const BIAS_BOX_DEGREES = 0.5;

interface Body {
    status?: string;
    error_message?: string;
    results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
    }>;
}

export class ProviderBAdapter implements GeoProvider {
    readonly key = 'provider-b';
    readonly minIntervalMs = 0;

    constructor(private readonly config: GeoProviderConfig) {}

    async search(text: string, bias?: GeoPoint): Promise<GeoSuggestion[]> {
        const params: Record<string, string> = { address: text };
        if (bias) {
            const d = BIAS_BOX_DEGREES;
            params.bounds = `${bias.lat - d},${bias.lng - d}|${bias.lat + d},${bias.lng + d}`;
        }
        const results = await this.query(params);
        return results.slice(0, GEO_MAX_RESULTS).flatMap(r => {
            if (!r.formatted_address) return [];
            const lat = finite(r.geometry?.location?.lat);
            const lng = finite(r.geometry?.location?.lng);
            return [
                lat !== undefined && lng !== undefined
                    ? { address: r.formatted_address, lat, lng }
                    : { address: r.formatted_address },
            ];
        });
    }

    async reverse(point: GeoPoint): Promise<string | null> {
        const results = await this.query({ latlng: `${point.lat},${point.lng}` });
        return results[0]?.formatted_address ?? null;
    }

    private async query(extra: Record<string, string>): Promise<NonNullable<Body['results']>> {
        const params = new URLSearchParams({ key: this.config.apiKey, ...extra });
        const body = (await getJson(
            this.config.fetch,
            `${this.config.baseUrl ?? BASE_URL}?${params}`,
        )) as Body;
        if (body.status === 'ZERO_RESULTS') return [];
        if (body.status !== 'OK') throw new Error(`provider status ${body.status ?? 'missing'}`);
        return body.results ?? [];
    }
}
