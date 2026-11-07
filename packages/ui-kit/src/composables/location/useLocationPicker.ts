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
    search: SearchFn;
    reverse: ReverseFn;
    createAdapter: AdapterFactory;
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
    }

    async function load(): Promise<void> {
        if (!element || !provider.value) return;
        const mine = ++generation;
        status.value = 'loading';
        teardown();
        try {
            const next = await input.createAdapter(provider.value);
            const publicKey =
                input.config.providers.find(p => p.key === provider.value)?.publicKey ?? null;
            await next.mount(element, {
                ...view.value,
                marker: point.value,
                cooperative: input.cooperative,
                publicKey,
            });
            if (mine !== generation) {
                next.destroy();
                return;
            }
            next.onMarkerChange(p => setPoint(p, false));
            adapter = next;
            status.value = 'ready';
        } catch {
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
        storeProvider(key);
        search.clear();
        return load();
    }

    async function pickSuggestion(s: GeoSuggestion): Promise<void> {
        search.clear();
        search.query.value = s.address;
        let p: GeoPoint | null = {
            latitude: s.latitude as number,
            longitude: s.longitude as number,
        };
        if (!isValidPoint(p) && s.resolve) p = await s.resolve().catch(() => null);
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
