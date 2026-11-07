// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderAAdapter } from '../../../components/MvLocationPicker/adapters/provider-a.adapter';
import { ProviderBAdapter } from '../../../components/MvLocationPicker/adapters/provider-b.adapter';
import { OpenAdapter } from '../../../components/MvLocationPicker/adapters/open.adapter';
import type { MapAdapter } from '../../../components/MvLocationPicker/types';

const options = {
    center: { latitude: 10, longitude: 20 },
    zoom: 8,
    marker: null,
    cooperative: false,
    publicKey: 'key',
};

function stubA(): { click: (c: [number, number]) => void } {
    let onClick: (_: unknown, e: { coordinates: [number, number] }) => void = () => undefined;
    class YMap {
        location = { center: [20, 10] as [number, number], zoom: 8 };
        constructor(
            _el: HTMLElement,
            props: { location: { center: [number, number]; zoom: number } },
        ) {
            this.location = props.location;
        }
        setLocation(l: { center: [number, number]; zoom: number }) {
            this.location = l;
        }
        addChild() {}
        removeChild() {}
        destroy() {}
    }
    class Any {
        constructor(props: { onClick?: typeof onClick } = {}) {
            if (props.onClick) onClick = props.onClick;
        }
        update() {}
    }
    vi.stubGlobal('ymaps3', {
        ready: Promise.resolve(),
        YMap,
        YMapDefaultSchemeLayer: Any,
        YMapDefaultFeaturesLayer: Any,
        YMapListener: Any,
        YMapMarker: Any,
    });
    return { click: c => onClick({}, { coordinates: c }) };
}

function stubB(): { click: (lat: number, lng: number) => void } {
    const handlers: Record<string, (e: { latLng: { lat(): number; lng(): number } }) => void> = {};
    class Map {
        c = { lat: 10, lng: 20 };
        z = 8;
        constructor(_el: HTMLElement, o: { center: { lat: number; lng: number }; zoom: number }) {
            this.c = o.center;
            this.z = o.zoom;
        }
        setCenter(c: { lat: number; lng: number }) {
            this.c = c;
        }
        setZoom(z: number) {
            this.z = z;
        }
        getCenter() {
            return { lat: () => this.c.lat, lng: () => this.c.lng };
        }
        getZoom() {
            return this.z;
        }
        addListener(n: string, f: (typeof handlers)[string]) {
            handlers[n] = f;
        }
    }
    class Marker {
        setPosition() {}
        setMap() {}
        addListener() {}
    }
    vi.stubGlobal('google', { maps: { Map, Marker } });
    return { click: (lat, lng) => handlers.click({ latLng: { lat: () => lat, lng: () => lng } }) };
}

const cases: [string, () => MapAdapter, () => (lat: number, lng: number) => void][] = [
    [
        'provider-a',
        () => new ProviderAAdapter(),
        () => {
            const s = stubA();
            return (la, ln) => s.click([ln, la]);
        },
    ],
    [
        'provider-b',
        () => new ProviderBAdapter(),
        () => {
            const s = stubB();
            return s.click;
        },
    ],
];

afterEach(() => vi.unstubAllGlobals());

describe.each(cases)('adapter contract: %s', (_name, make, stub) => {
    it('mounts, sets the view, places a marker and reports clicks', async () => {
        const click = stub();
        const adapter = make();
        const el = document.createElement('div');
        await adapter.mount(el, options);
        adapter.setView({ center: { latitude: 30, longitude: 40 }, zoom: 12 });
        expect(adapter.getView()).toEqual({ center: { latitude: 30, longitude: 40 }, zoom: 12 });
        const seen = vi.fn();
        adapter.onMarkerChange(seen);
        adapter.setMarker({ latitude: 1, longitude: 2 });
        click(5, 6);
        expect(seen).toHaveBeenCalledWith({ latitude: 5, longitude: 6 });
        adapter.destroy();
    });

    it('rejects mount when the key is missing', async () => {
        stub();
        await expect(
            make().mount(document.createElement('div'), { ...options, publicKey: null }),
        ).rejects.toThrow();
    });
});

describe('adapter contract: open', () => {
    it('mounts, sets the view, places a marker and shows attribution', async () => {
        const adapter = new OpenAdapter();
        const el = document.createElement('div');
        document.body.appendChild(el);
        await adapter.mount(el, { ...options, publicKey: null });
        adapter.setView({ center: { latitude: 30, longitude: 40 }, zoom: 12 });
        const view = adapter.getView();
        expect(view.zoom).toBe(12);
        expect(view.center.latitude).toBeCloseTo(30, 3);
        const seen = vi.fn();
        adapter.onMarkerChange(seen);
        adapter.setMarker({ latitude: 1, longitude: 2 });
        expect(el.querySelector('.mv-location-pin')).not.toBeNull();
        expect(el.textContent).toContain('OpenStreetMap');
        adapter.destroy();
    });
});
