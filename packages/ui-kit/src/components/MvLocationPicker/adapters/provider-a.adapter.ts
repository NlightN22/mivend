import type { GeoPoint, MapAdapter, MapMountOptions, MapView } from '../types';
import { loadScript } from './loadScript';

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

const toPoint = (c: [number, number]): GeoPoint => ({ latitude: c[1], longitude: c[0] });

export class ProviderAAdapter implements MapAdapter {
    private map: YMapInstance | null = null;
    private lib: Ymaps3 | null = null;
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
                `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(o.publicKey)}&lang=en_US`,
            );
        const lib = w.ymaps3;
        if (!lib) throw new Error('library missing');
        await lib.ready;
        this.lib = lib;
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

    destroy(): void {
        if (this.wheelTarget && this.onWheel)
            this.wheelTarget.removeEventListener('wheel', this.onWheel);
        this.map?.destroy();
        this.map = null;
        this.marker = null;
    }
}
