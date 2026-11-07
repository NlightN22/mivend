export interface GeoPoint {
    lat: number;
    lng: number;
}

export interface GeoSuggestion {
    address: string;
    lat?: number;
    lng?: number;
}

export type GeoFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface GeoProviderConfig {
    apiKey: string;
    fetch: GeoFetch;
    baseUrl?: string;
    userAgent?: string;
}

export interface GeoProvider {
    readonly key: string;
    readonly minIntervalMs: number;
    search(text: string, bias?: GeoPoint): Promise<GeoSuggestion[]>;
    reverse(point: GeoPoint): Promise<string | null>;
}

export const GEO_MAX_RESULTS = 6;

export async function getJson(
    fetchFn: GeoFetch,
    url: string,
    init?: RequestInit,
): Promise<unknown> {
    const response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`provider answered ${response.status}`);
    return response.json();
}

export function finite(value: unknown): number | undefined {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}
