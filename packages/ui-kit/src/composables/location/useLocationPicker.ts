import { computed, ref, shallowRef } from 'vue';
import type {
    AdapterFactory,
    GeoConfig,
    GeoPoint,
    GeoSuggestion,
    MapAdapter,
    MapView,
    ReverseFn,
    SearchFn,
    SearchMode,
} from '../../components/MvLocationPicker/types';
import { isValidPoint, nudgePoint, parseCoordinate, validateCoordinates } from './coordinates';
import { resolveInitialView } from './initialView';
import { chooseProvider, readStoredProvider, storeProvider } from './providerPreference';
import { useLocationSearch } from './useLocationSearch';
import { useLatestRequest } from '../useLatestRequest';

export interface LocationPickerInput {
    config: GeoConfig;
    current: GeoPoint | null;
    suggestionPoint?: GeoPoint | null;
    siblingPoint?: GeoPoint | null;
    cooperative: boolean;
    locale?: string;
    search: SearchFn;
    reverse: ReverseFn;
    createAdapter: AdapterFactory;
}

function parseParams(raw?: string | null): Record<string, string> {
    try {
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
        return {};
    }
}

export function useLocationPicker(input: LocationPickerInput) {
    const start = resolveInitialView({
        suggestion: isValidPoint(input.current) ? input.current : input.suggestionPoint,
        sibling: input.siblingPoint,
        config: input.config,
    });
    const provider = ref(chooseProvider(input.config, readStoredProvider()) ?? '');
    const point = ref<GeoPoint | null>(isValidPoint(input.current) ? input.current : null);
    const view = shallowRef<MapView>({ center: start.center, zoom: start.zoom });
    const status = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle');
    const address = ref<string | null>(null);
    const manualError = ref<'latitude' | 'longitude' | 'notSet' | null>(null);
    let adapter: MapAdapter | null = null;
    let element: HTMLElement | null = null;
    let generation = 0;
    let pickSeq = 0;
    const searchMode = ref<SearchMode>('host');

    const reverse = useLatestRequest(
        async (p: GeoPoint, key: string) => {
            try {
                return await (adapter?.reverse ? adapter.reverse(p) : input.reverse(p, key));
            } catch {
                return null;
            }
        },
        result => (address.value = result),
    );
    const search = useLocationSearch({
        search: (text, bias, key) =>
            adapter?.search ? adapter.search(text, bias) : input.search(text, bias, key),
        getBias: () => point.value ?? view.value.center,
        getProvider: () => provider.value,
        getMode: () => searchMode.value,
    });
    const canSave = computed(() => isValidPoint(point.value));

    function setPoint(next: GeoPoint, moveMap: boolean): void {
        point.value = next;
        manualError.value = null;
        address.value = null;
        if (moveMap) {
            view.value = { center: next, zoom: Math.max(view.value.zoom, 15) };
            adapter?.setView(view.value);
        }
        adapter?.setMarker(next);
        if (provider.value) void reverse.run(next, provider.value);
    }

    function teardown(): void {
        if (adapter) view.value = adapter.getView();
        adapter?.destroy();
        adapter = null;
        element?.replaceChildren();
    }

    async function load(): Promise<void> {
        if (!element || !provider.value) return;
        const mine = ++generation;
        status.value = 'loading';
        teardown();
        let next: MapAdapter | null = null;
        try {
            next = await input.createAdapter(provider.value);
            if (mine !== generation) {
                next.destroy();
                return;
            }
            const host = document.createElement('div');
            host.style.cssText = 'width:100%;height:100%';
            element.replaceChildren(host);
            const info = input.config.providers.find(p => p.key === provider.value);
            const publicKey = info?.publicKey ?? null;
            await next.mount(host, {
                ...view.value,
                marker: point.value,
                cooperative: input.cooperative,
                publicKey,
                params: parseParams(info?.params),
                locale: input.locale,
            });
            if (mine !== generation) {
                next.destroy();
                host.remove();
                return;
            }
            next.onMarkerChange(p => setPoint(p, false));
            adapter = next;
            searchMode.value = next.searchMode ?? 'host';
            status.value = 'ready';
        } catch (error) {
            next?.destroy();
            console.warn('MvLocationPicker: map failed to load', error);
            if (mine === generation) status.value = 'failed';
        }
    }

    function attach(el: HTMLElement): Promise<void> {
        element = el;
        return load();
    }

    function switchProvider(key: string): Promise<void> {
        if (key === provider.value && status.value !== 'failed') return Promise.resolve();
        provider.value = key;
        pickSeq++;
        storeProvider(key);
        search.clear();
        return load();
    }

    async function pickSuggestion(s: GeoSuggestion): Promise<void> {
        const mine = ++pickSeq;
        search.clear();
        search.query.value = s.address;
        let p: GeoPoint | null = {
            latitude: s.latitude as number,
            longitude: s.longitude as number,
        };
        if (!isValidPoint(p) && s.resolve) p = await s.resolve().catch(() => null);
        if (mine !== pickSeq) return;
        if (isValidPoint(p)) setPoint(p, true);
    }

    function setManual(latitude: string, longitude: string): void {
        const lat = parseCoordinate(latitude);
        const lng = parseCoordinate(longitude);
        const error = validateCoordinates(lat, lng);
        manualError.value = error;
        if (!error) setPoint({ latitude: lat, longitude: lng }, true);
    }

    function nudge(direction: 'up' | 'down' | 'left' | 'right'): void {
        const base = point.value ?? view.value.center;
        const zoom = adapter?.getView().zoom ?? view.value.zoom;
        setPoint(nudgePoint(base, direction, zoom), false);
    }

    function destroy(): void {
        generation++;
        pickSeq++;
        search.dispose();
        reverse.cancel();
        teardown();
        status.value = 'idle';
    }

    return {
        provider,
        point,
        status,
        address,
        manualError,
        canSave,
        search,
        searchMode,
        attach,
        switchProvider,
        retry: load,
        pickSuggestion,
        setManual,
        nudge,
        setPoint,
        destroy,
    };
}
