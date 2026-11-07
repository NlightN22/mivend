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

interface Ymaps3 {
    ready: Promise<void>;
    YMap: new (
        el: HTMLElement,
        props: Record<string, unknown>,
        children?: unknown[],
    ) => YMapInstance;
    YMapDefaultSchemeLayer: new (props: Record<string, unknown>) => unknown;
    YMapDefaultFeaturesLayer: new (props: Record<string, unknown>) => unknown;
    YMapListener: new (props: Record<string, unknown>) => unknown;
    YMapMarker: new (props: Record<string, unknown>, el: HTMLElement) => YMapMarkerInstance;
    getDefaultConfig(): { setApikeys(keys: { suggest?: string; search?: string }): void };
    suggest(o: Record<string, unknown>): Promise<SuggestItem[]>;
    search(o: Record<string, unknown>): Promise<SearchItem[]>;
}
interface SuggestItem {
    title: { text: string };
    subtitle?: { text: string };
    uri?: string;
}
interface SearchItem {
    properties: { name: string; description?: string };
    geometry?: { coordinates: [number, number] };
}
interface YMapInstance {
    location: { center: [number, number]; zoom: number };
    setLocation(l: { center: [number, number]; zoom: number }): void;
    addChild(c: unknown): void;
    removeChild(c: unknown): void;
    destroy(): void;
}
interface YMapMarkerInstance {
    update(props: Record<string, unknown>): void;
}

const DEFAULT_HOST = 'yandex.com';
const MAX_SUGGESTIONS = 6;
const BIAS_SPAN: [number, number] = [0.5, 0.5];
const toLang = (locale?: string): string =>
    (locale ?? navigator.language).toLowerCase().startsWith('ru') ? 'ru_RU' : 'en_US';
const toPoint = (c: [number, number]): GeoPoint => ({ latitude: c[1], longitude: c[0] });

export class ProviderAAdapter implements MapAdapter {
    get searchMode(): SearchMode {
        return this.hasSuggest ? 'native' : 'none';
    }

    private map: YMapInstance | null = null;
    private lib: Ymaps3 | null = null;
    private hasSuggest = false;
    private hasSearch = false;
    private marker: YMapMarkerInstance | null = null;
    private markerEl: HTMLElement | null = null;
    private listener: (p: GeoPoint) => void = () => undefined;
    private wheelTarget: HTMLElement | null = null;
    private onWheel: ((e: WheelEvent) => void) | null = null;

    async mount(element: HTMLElement, o: MapMountOptions): Promise<void> {
        if (!o.publicKey) throw new Error('missing key');
        const w = window as unknown as { ymaps3?: Ymaps3 };
        if (!w.ymaps3)
            await loadScript(
                `https://api-maps.${o.params?.host || DEFAULT_HOST}/v3/?apikey=${encodeURIComponent(o.publicKey)}&lang=${toLang(o.locale)}`,
            );
        const lib = w.ymaps3;
        if (!lib) throw new Error('library missing');
        await withTimeout(lib.ready, 'ymaps3.ready');
        this.lib = lib;
        lib.getDefaultConfig().setApikeys({
            suggest: o.params?.suggest_key,
            search: o.params?.search_key,
        });
        this.hasSuggest = !!o.params?.suggest_key;
        this.hasSearch = !!o.params?.search_key;
        const behaviors = o.cooperative
            ? ['drag', 'pinchZoom', 'dblClick']
            : ['drag', 'pinchZoom', 'scrollZoom', 'dblClick'];
        this.map = new lib.YMap(element, {
            location: { center: [o.center.longitude, o.center.latitude], zoom: o.zoom },
            behaviors,
        });
        this.map.addChild(new lib.YMapDefaultSchemeLayer({}));
        this.map.addChild(new lib.YMapDefaultFeaturesLayer({}));
        this.map.addChild(
            new lib.YMapListener({
                layer: 'any',
                onClick: (_: unknown, e: { coordinates: [number, number] }) =>
                    this.listener(toPoint(e.coordinates)),
            }),
        );
        if (o.cooperative) this.bindCooperativeWheel(element);
        this.setMarker(o.marker);
    }

    private bindCooperativeWheel(element: HTMLElement): void {
        this.wheelTarget = element;
        this.onWheel = e => {
            if (!(e.ctrlKey || e.metaKey) || !this.map) return;
            e.preventDefault();
            const { center, zoom } = this.map.location;
            this.map.setLocation({ center, zoom: zoom + (e.deltaY < 0 ? 1 : -1) });
        };
        element.addEventListener('wheel', this.onWheel, { passive: false });
    }

    setView(v: MapView): void {
        this.map?.setLocation({ center: [v.center.longitude, v.center.latitude], zoom: v.zoom });
    }

    getView(): MapView {
        const l = this.map?.location;
        return l
            ? { center: toPoint(l.center), zoom: l.zoom }
            : { center: { latitude: 0, longitude: 0 }, zoom: 2 };
    }

    setMarker(p: GeoPoint | null): void {
        if (!this.map || !this.lib) return;
        if (this.marker) {
            this.map.removeChild(this.marker);
            this.marker = null;
        }
        if (!p) return;
        this.markerEl ??= Object.assign(document.createElement('div'), {
            className: 'mv-location-pin',
        });
        this.marker = new this.lib.YMapMarker(
            {
                coordinates: [p.longitude, p.latitude],
                draggable: true,
                onDragEnd: (c: [number, number]) => this.listener(toPoint(c)),
            },
            this.markerEl,
        );
        this.map.addChild(this.marker);
    }

    onMarkerChange(listener: (p: GeoPoint) => void): void {
        this.listener = listener;
    }

    async search(query: string, bias: GeoPoint | null): Promise<GeoSuggestion[]> {
        const lib = this.lib;
        if (!lib || !this.hasSuggest) throw new Error('suggest key missing');
        const items = await lib.suggest({
            text: query,
            limit: MAX_SUGGESTIONS,
            ...(bias && { center: [bias.longitude, bias.latitude], span: BIAS_SPAN }),
        });
        return items.slice(0, MAX_SUGGESTIONS).map(item => {
            const address = [item.title.text, item.subtitle?.text].filter(Boolean).join(', ');
            const resolve = async (): Promise<GeoPoint | null> => {
                if (!this.hasSearch) return null;
                const [hit] = await lib.search(
                    item.uri ? { uri: item.uri, limit: 1 } : { text: address, limit: 1 },
                );
                return hit?.geometry ? toPoint(hit.geometry.coordinates) : null;
            };
            return { address, resolve };
        });
    }

    async reverse(p: GeoPoint): Promise<string | null> {
        if (!this.lib || !this.hasSearch) return null;
        const [hit] = await this.lib.search({
            text: `${p.longitude},${p.latitude}`,
            type: ['toponyms'],
            limit: 1,
        });
        if (!hit) return null;
        return [hit.properties.name, hit.properties.description].filter(Boolean).join(', ');
    }

    destroy(): void {
        if (this.wheelTarget && this.onWheel)
            this.wheelTarget.removeEventListener('wheel', this.onWheel);
        this.map?.destroy();
        this.map = null;
        this.marker = null;
    }
}
