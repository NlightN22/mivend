import {
    finite,
    GEO_MAX_RESULTS,
    getJson,
    GeoPoint,
    GeoProvider,
    GeoProviderConfig,
    GeoSuggestion,
} from './geo-provider';

// Registry key open = OSM Nominatim; public instance policy: 1 req/s, identifying User-Agent, no autocomplete.
const BASE_URL = 'https://nominatim.openstreetmap.org';
const BIAS_BOX_DEGREES = 0.5;

interface Place {
    display_name?: string;
    lat?: string;
    lon?: string;
}

export class OpenAdapter implements GeoProvider {
    readonly key = 'open';
    readonly minIntervalMs = 1100;

    constructor(private readonly config: GeoProviderConfig) {}

    async search(text: string, bias?: GeoPoint): Promise<GeoSuggestion[]> {
        const params: Record<string, string> = {
            q: text,
            format: 'jsonv2',
            limit: String(GEO_MAX_RESULTS),
        };
        if (bias) {
            const d = BIAS_BOX_DEGREES;
            params.viewbox = `${bias.lng - d},${bias.lat + d},${bias.lng + d},${bias.lat - d}`;
        }
        const places = (await this.get('search', params)) as Place[];
        return places.flatMap(p => {
            if (!p.display_name) return [];
            const lat = finite(p.lat);
            const lng = finite(p.lon);
            return [
                lat !== undefined && lng !== undefined
                    ? { address: p.display_name, lat, lng }
                    : { address: p.display_name },
            ];
        });
    }

    async reverse(point: GeoPoint): Promise<string | null> {
        const place = (await this.get('reverse', {
            lat: String(point.lat),
            lon: String(point.lng),
            format: 'jsonv2',
        })) as Place;
        return place.display_name ?? null;
    }

    private get(path: string, params: Record<string, string>): Promise<unknown> {
        const base = this.config.baseUrl ?? BASE_URL;
        return getJson(this.config.fetch, `${base}/${path}?${new URLSearchParams(params)}`, {
            headers: { 'User-Agent': this.config.userAgent ?? 'mivend-geo' },
        });
    }
}
