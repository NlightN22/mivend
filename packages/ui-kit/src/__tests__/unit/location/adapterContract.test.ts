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

const setApikeysA = vi.fn();
const suggestA = vi.fn(async () => [
    { title: { text: 'Street 1' }, subtitle: { text: 'City' }, uri: 'ymapsbm1://x' },
]);
const searchA = vi.fn(async (o: { uri?: string; text?: string }) =>
    o.uri
        ? [
              {
                  properties: { name: 'Street 1' },
                  geometry: { coordinates: [8, 7] as [number, number] },
              },
          ]
        : [{ properties: { name: 'Street 1', description: 'City' } }],
);

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
        getDefaultConfig: () => ({ setApikeys: setApikeysA }),
        suggest: suggestA,
        search: searchA,
    });
    return { click: c => onClick({}, { coordinates: c }) };
}

let lastAutocomplete = vi.fn();

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
    const fetchAutocompleteSuggestions = vi.fn(async () => ({
        suggestions: [
            {
                placePrediction: {
                    text: { toString: () => 'Place one' },
                    toPlace: () => ({
                        location: { lat: () => 7, lng: () => 8 },
                        fetchFields: async () => undefined,
                    }),
                },
            },
        ],
    }));
    class Geocoder {
        async geocode() {
            return { results: [{ formatted_address: 'Some street 1' }] };
        }
    }
    const libs: Record<string, unknown> = {
        places: {
            AutocompleteSuggestion: { fetchAutocompleteSuggestions },
            AutocompleteSessionToken: class {},
        },
        geocoding: { Geocoder },
    };
    vi.stubGlobal('google', {
        maps: { Map, Marker, importLibrary: async (n: string) => libs[n] ?? {} },
    });
    lastAutocomplete = fetchAutocompleteSuggestions;
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

describe('provider-b browser search and reverse', () => {
    it('type-ahead suggestions resolve to coordinates lazily and the marker reverses to an address', async () => {
        stubB();
        const adapter = new ProviderBAdapter();
        await adapter.mount(document.createElement('div'), options);
        const found = await adapter.search('pla', { latitude: 1, longitude: 2 });
        expect(found).toHaveLength(1);
        expect(found[0].address).toBe('Place one');
        expect(found[0].latitude).toBeUndefined();
        expect(await found[0].resolve?.()).toEqual({ latitude: 7, longitude: 8 });
        expect(lastAutocomplete).toHaveBeenCalledWith(
            expect.objectContaining({ input: 'pla', origin: { lat: 1, lng: 2 } }),
        );
        expect(await adapter.reverse({ latitude: 1, longitude: 2 })).toBe('Some street 1');
    });
});

describe('provider-a browser search and reverse', () => {
    const params = { suggest_key: 'sk', search_key: 'ck', host: 'yandex.ru' };

    it('suggests with the bias, resolves a pick to coordinates and reverses the marker', async () => {
        stubA();
        const adapter = new ProviderAAdapter();
        await adapter.mount(document.createElement('div'), { ...options, params });
        expect(setApikeysA).toHaveBeenCalledWith({ suggest: 'sk', search: 'ck' });
        const found = await adapter.search('str', { latitude: 1, longitude: 2 });
        expect(suggestA).toHaveBeenCalledWith(
            expect.objectContaining({ text: 'str', center: [2, 1] }),
        );
        expect(found[0].address).toBe('Street 1, City');
        expect(await found[0].resolve?.()).toEqual({ latitude: 7, longitude: 8 });
        expect(await adapter.reverse({ latitude: 7, longitude: 8 })).toBe('Street 1, City');
        expect(searchA).toHaveBeenLastCalledWith(expect.objectContaining({ text: '8,7' }));
    });

    it('rejects search without a suggest key and skips reverse without a search key', async () => {
        stubA();
        const adapter = new ProviderAAdapter();
        await adapter.mount(document.createElement('div'), options);
        await expect(adapter.search('str', null)).rejects.toThrow();
        expect(await adapter.reverse({ latitude: 1, longitude: 2 })).toBeNull();
    });

    it('loads the script from the configured host with the host language', async () => {
        const added: string[] = [];
        const orig = document.head.appendChild.bind(document.head);
        vi.spyOn(document.head, 'appendChild').mockImplementation(n => {
            added.push((n as HTMLScriptElement).src);
            stubA();
            queueMicrotask(() => (n as HTMLScriptElement).onload?.(new Event('load')));
            return orig(n);
        });
        await new ProviderAAdapter().mount(document.createElement('div'), {
            ...options,
            params,
            locale: 'ru',
        });
        expect(added[0]).toBe('https://api-maps.yandex.ru/v3/?apikey=key&lang=ru_RU');
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
