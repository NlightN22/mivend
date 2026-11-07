import type {
    GeoPoint,
    GeoSuggestion,
    MapAdapter,
    MapMountOptions,
    MapView,
    SearchMode,
} from '../types';
import { loadScript } from './loadScript';
import { withTimeout } from './withTimeout';

interface LatLng {
    lat(): number;
    lng(): number;
}
interface GMap {
    setCenter(c: { lat: number; lng: number }): void;
    setZoom(z: number): void;
    getCenter(): LatLng | undefined;
    getZoom(): number | undefined;
    addListener(name: string, fn: (e: { latLng?: LatLng }) => void): void;
}
interface GMarker {
    setPosition(c: { lat: number; lng: number }): void;
    setMap(m: GMap | null): void;
    addListener(name: string, fn: (e: { latLng?: LatLng }) => void): void;
}
interface PlaceObj {
    location?: LatLng;
    formattedAddress?: string;
    fetchFields(r: { fields: string[] }): Promise<unknown>;
}
interface Prediction {
    text: { toString(): string };
    toPlace(): PlaceObj;
}
interface PlacesLib {
    AutocompleteSuggestion: {
        fetchAutocompleteSuggestions(r: Record<string, unknown>): Promise<{
            suggestions: Array<{ placePrediction?: Prediction }>;
        }>;
    };
    AutocompleteSessionToken: new () => object;
}
interface GeocoderResult {
    formatted_address?: string;
}
interface GoogleMaps {
    importLibrary?: (name: string) => Promise<unknown>;
    Geocoder?: new () => {
        geocode(r: {
            location: { lat: number; lng: number };
        }): Promise<{ results: GeocoderResult[] }>;
    };
    Map: new (el: HTMLElement, o: Record<string, unknown>) => GMap;
    Marker: new (o: Record<string, unknown>) => GMarker;
}

const READY_CALLBACK = '__mvProviderBReady';
const BIAS_RADIUS_METERS = 50_000;
const MAX_SUGGESTIONS = 6;
const toLiteral = (p: GeoPoint) => ({ lat: p.latitude, lng: p.longitude });
const fromLatLng = (l: LatLng): GeoPoint => ({ latitude: l.lat(), longitude: l.lng() });

export class ProviderBAdapter implements MapAdapter {
    readonly searchMode: SearchMode = 'native';

    private map: GMap | null = null;
    private maps: GoogleMaps | null = null;
    private marker: GMarker | null = null;
    private token: object | null = null;
    private listener: (p: GeoPoint) => void = () => undefined;

    async mount(element: HTMLElement, o: MapMountOptions): Promise<void> {
        if (!o.publicKey) throw new Error('missing key');
        const w = window as unknown as { google?: { maps?: GoogleMaps } };
        if (!w.google?.maps?.Map) {
            const ready = new Promise<void>(resolve => {
                (window as unknown as Record<string, () => void>)[READY_CALLBACK] = resolve;
            });
            await loadScript(
                `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(o.publicKey)}&loading=async&v=weekly&callback=${READY_CALLBACK}`,
            );
            await withTimeout(ready, 'maps ready callback');
        }
        const maps = w.google?.maps;
        if (maps?.importLibrary) {
            await withTimeout(
                Promise.all([maps.importLibrary('maps'), maps.importLibrary('marker')]),
                'importLibrary',
            );
        }
        if (!maps?.Map) throw new Error('library missing');
        this.maps = maps;
        this.map = new maps.Map(element, {
            center: toLiteral(o.center),
            zoom: o.zoom,
            gestureHandling: o.cooperative ? 'cooperative' : 'greedy',
            clickableIcons: false,
            streetViewControl: false,
            fullscreenControl: false,
        });
        this.map.addListener('click', e => e.latLng && this.listener(fromLatLng(e.latLng)));
        this.setMarker(o.marker);
    }

    setView(v: MapView): void {
        this.map?.setCenter(toLiteral(v.center));
        this.map?.setZoom(v.zoom);
    }

    getView(): MapView {
        const c = this.map?.getCenter();
        return {
            center: c ? fromLatLng(c) : { latitude: 0, longitude: 0 },
            zoom: this.map?.getZoom() ?? 2,
        };
    }

    setMarker(p: GeoPoint | null): void {
        if (!this.map || !this.maps) return;
        if (!p) {
            this.marker?.setMap(null);
            this.marker = null;
            return;
        }
        if (this.marker) {
            this.marker.setPosition(toLiteral(p));
            return;
        }
        this.marker = new this.maps.Marker({
            map: this.map,
            position: toLiteral(p),
            draggable: true,
        });
        this.marker.addListener('dragend', e => e.latLng && this.listener(fromLatLng(e.latLng)));
    }

    onMarkerChange(listener: (p: GeoPoint) => void): void {
        this.listener = listener;
    }

    async search(query: string, bias: GeoPoint | null): Promise<GeoSuggestion[]> {
        const maps = this.maps;
        if (!maps?.importLibrary) throw new Error('library missing');
        const lib = (await withTimeout(maps.importLibrary('places'), 'importLibrary')) as PlacesLib;
        this.token ??= new lib.AutocompleteSessionToken();
        const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            sessionToken: this.token,
            ...(bias && {
                locationBias: { center: toLiteral(bias), radius: BIAS_RADIUS_METERS },
                origin: toLiteral(bias),
            }),
        });
        return suggestions.slice(0, MAX_SUGGESTIONS).flatMap(s => {
            const prediction = s.placePrediction;
            if (!prediction) return [];
            const resolve = async (): Promise<GeoPoint | null> => {
                const place = prediction.toPlace();
                await place.fetchFields({ fields: ['location'] });
                this.token = null;
                return place.location ? fromLatLng(place.location) : null;
            };
            return [{ address: prediction.text.toString(), resolve }];
        });
    }

    async reverse(p: GeoPoint): Promise<string | null> {
        const maps = this.maps;
        if (!maps?.importLibrary) return null;
        const { Geocoder } = (await maps.importLibrary('geocoding')) as Pick<
            GoogleMaps,
            'Geocoder'
        >;
        if (!Geocoder) return null;
        const { results } = await new Geocoder().geocode({ location: toLiteral(p) });
        return results[0]?.formatted_address ?? null;
    }

    destroy(): void {
        this.token = null;
        this.marker?.setMap(null);
        this.marker = null;
        this.map = null;
    }
}
