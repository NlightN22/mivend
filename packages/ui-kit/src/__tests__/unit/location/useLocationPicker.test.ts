// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocationPicker } from '../../../composables/location/useLocationPicker';
import type { GeoConfig, ReverseFn, SearchFn } from '../../../components/MvLocationPicker/types';
import { makeStubAdapter, type StubAdapter } from './stubAdapter';

const config: GeoConfig = {
    providers: [{ key: 'provider-a', publicKey: 'ka' }, { key: 'open' }],
    defaultProvider: 'provider-a',
    defaultLatitude: 10,
    defaultLongitude: 20,
    defaultZoom: 6,
};
const el = document.createElement('div');
const store: Record<string, string> = {};

beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal('window', {
        localStorage: {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => void (store[k] = v),
        },
    });
});

function setup(
    over: { failFirst?: boolean; current?: { latitude: number; longitude: number } | null } = {},
) {
    const adapters: StubAdapter[] = [];
    let first = over.failFirst ?? false;
    const picker = useLocationPicker({
        config,
        current: over.current ?? null,
        cooperative: false,
        search: async () => [],
        reverse: async p => `addr ${p.latitude}`,
        createAdapter: async () => {
            const a = makeStubAdapter({ failMount: first });
            first = false;
            adapters.push(a);
            return a;
        },
    });
    return { picker, adapters };
}

describe('useLocationPicker adapter-own search and reverse', () => {
    function withOwn(host: { search: SearchFn; reverse: ReverseFn }) {
        const own = makeStubAdapter();
        own.search = vi.fn(async () => [
            { address: 'own', resolve: async () => ({ latitude: 3, longitude: 4 }) },
        ]);
        own.reverse = vi.fn(async () => 'own address');
        const plain = makeStubAdapter();
        const picker = useLocationPicker({
            config,
            current: null,
            cooperative: false,
            search: host.search,
            reverse: host.reverse,
            createAdapter: async key => (key === 'open' ? plain : own),
        });
        return { picker, own, plain };
    }

    it('uses the adapter search, resolves coordinates on pick and reverses via the adapter', async () => {
        const host = {
            search: vi.fn<SearchFn>(async () => []),
            reverse: vi.fn<ReverseFn>(async () => 'host'),
        };
        const { picker, own } = withOwn(host);
        await picker.attach(el);
        picker.search.query.value = 'abc';
        picker.search.submit();
        await vi.waitFor(() => expect(picker.search.suggestions.value).toHaveLength(1));
        await picker.pickSuggestion(picker.search.suggestions.value[0]);
        expect(picker.point.value).toEqual({ latitude: 3, longitude: 4 });
        await vi.waitFor(() => expect(picker.address.value).toBe('own address'));
        expect(own.search).toHaveBeenCalled();
        expect(host.search).not.toHaveBeenCalled();
        expect(host.reverse).not.toHaveBeenCalled();
    });

    it('falls back to the host callbacks after switching to an adapter without its own', async () => {
        const host = {
            search: vi.fn<SearchFn>(async () => []),
            reverse: vi.fn<ReverseFn>(async () => 'host'),
        };
        const { picker } = withOwn(host);
        await picker.attach(el);
        await picker.switchProvider('open');
        picker.search.query.value = 'abc';
        picker.search.submit();
        picker.setPoint({ latitude: 1, longitude: 2 }, false);
        await vi.waitFor(() => expect(picker.address.value).toBe('host'));
        expect(host.search).toHaveBeenCalledWith('abc', expect.anything(), 'open');
    });
});

describe('useLocationPicker', () => {
    it('starts from the config view and keeps Save disabled until a point is set', async () => {
        const { picker, adapters } = setup();
        await picker.attach(el);
        expect(adapters[0].view).toEqual({ center: { latitude: 10, longitude: 20 }, zoom: 6 });
        expect(picker.canSave.value).toBe(false);
        adapters[0].emit({ latitude: 11, longitude: 21 });
        await vi.waitFor(() => expect(picker.address.value).toBe('addr 11'));
        expect(picker.canSave.value).toBe(true);
    });

    it('carries marker, centre and zoom over a provider switch and remembers the choice', async () => {
        const { picker, adapters } = setup();
        await picker.attach(el);
        adapters[0].emit({ latitude: 11, longitude: 21 });
        adapters[0].view = { center: { latitude: 12, longitude: 22 }, zoom: 13 };
        await picker.switchProvider('open');
        expect(adapters[0].destroy).toHaveBeenCalled();
        expect(adapters[1].view).toEqual({ center: { latitude: 12, longitude: 22 }, zoom: 13 });
        expect(adapters[1].marker).toEqual({ latitude: 11, longitude: 21 });
        expect(store['mv-geo-provider']).toBe('open');
    });

    it('falls back on script failure, offers retry and accepts manual coordinates', async () => {
        const { picker, adapters } = setup({ failFirst: true });
        await picker.attach(el);
        expect(picker.status.value).toBe('failed');
        picker.setManual('95', '10');
        expect(picker.manualError.value).toBe('latitude');
        expect(picker.canSave.value).toBe(false);
        picker.setManual('0', '0');
        expect(picker.manualError.value).toBe('notSet');
        picker.setManual('48,5', '2.3');
        expect(picker.canSave.value).toBe(true);
        expect(picker.point.value).toEqual({ latitude: 48.5, longitude: 2.3 });
        await picker.retry();
        expect(picker.status.value).toBe('ready');
        expect(adapters[1].marker).toEqual({ latitude: 48.5, longitude: 2.3 });
    });

    it('moves to a picked suggestion and ignores one without coordinates', async () => {
        const { picker, adapters } = setup();
        await picker.attach(el);
        picker.pickSuggestion({ address: 'x' });
        expect(picker.point.value).toBeNull();
        picker.pickSuggestion({ address: 'y', latitude: 5, longitude: 6 });
        expect(adapters[0].view.center).toEqual({ latitude: 5, longitude: 6 });
        expect(picker.search.query.value).toBe('y');
    });

    it('moves the marker with arrow nudges', async () => {
        const { picker } = setup({ current: { latitude: 10, longitude: 10 } });
        await picker.attach(el);
        picker.nudge('up');
        expect(picker.point.value?.latitude).toBeGreaterThan(10);
    });

    it('never attaches a stale mount when the provider is switched mid-load', async () => {
        const adapters: StubAdapter[] = [];
        const gates: Array<() => void> = [];
        const picker = useLocationPicker({
            config,
            current: null,
            cooperative: false,
            search: async () => [],
            reverse: async () => null,
            createAdapter: async () => {
                const a = makeStubAdapter();
                const mount = a.mount;
                a.mount = vi.fn(async (host, o) => {
                    await new Promise<void>(release => gates.push(release));
                    await mount(host, o);
                });
                adapters.push(a);
                return a;
            },
        });
        const first = picker.attach(el);
        await vi.waitFor(() => expect(gates).toHaveLength(1));
        const second = picker.switchProvider('open');
        await vi.waitFor(() => expect(gates).toHaveLength(2));
        gates.forEach(release => release());
        await Promise.all([first, second]);
        expect(adapters[0].destroy).toHaveBeenCalled();
        expect(adapters[1].destroy).not.toHaveBeenCalled();
        expect(picker.status.value).toBe('ready');
        expect(el.children).toHaveLength(1);
        picker.destroy();
        expect(el.children).toHaveLength(0);
    });

    it('lets the latest picked suggestion win when resolves finish out of order', async () => {
        const { picker } = setup();
        await picker.attach(el);
        const release: Record<string, (p: { latitude: number; longitude: number }) => void> = {};
        const lazy = (name: string) => ({
            address: name,
            resolve: () =>
                new Promise<{ latitude: number; longitude: number }>(r => (release[name] = r)),
        });
        const a = picker.pickSuggestion(lazy('a'));
        const b = picker.pickSuggestion(lazy('b'));
        release.b({ latitude: 2, longitude: 2 });
        await b;
        release.a({ latitude: 1, longitude: 1 });
        await a;
        expect(picker.point.value).toEqual({ latitude: 2, longitude: 2 });
    });

    it('exposes the mounted adapter search mode', async () => {
        const { picker } = setup();
        expect(picker.searchMode.value).toBe('host');
        await picker.attach(el);
        expect(picker.searchMode.value).toBe('host');
    });
});
