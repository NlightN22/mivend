import { vi } from 'vitest';
import type { GeoPoint, MapAdapter, MapView } from '../../../components/MvLocationPicker/types';

export interface StubAdapter extends MapAdapter {
    emit(point: GeoPoint): void;
    mounted: number;
    marker: GeoPoint | null;
    view: MapView;
}

export function makeStubAdapter(opts: { failMount?: boolean } = {}): StubAdapter {
    let listener: (p: GeoPoint) => void = () => undefined;
    const a: StubAdapter = {
        mounted: 0,
        marker: null,
        view: { center: { latitude: 0, longitude: 0 }, zoom: 2 },
        mount: vi.fn(async (_el, o) => {
            if (opts.failMount) throw new Error('script failed');
            a.mounted++;
            a.view = { center: o.center, zoom: o.zoom };
            a.marker = o.marker;
        }),
        setView: vi.fn(v => void (a.view = v)),
        getView: () => a.view,
        setMarker: vi.fn(p => void (a.marker = p)),
        onMarkerChange: l => void (listener = l),
        destroy: vi.fn(),
        emit: p => listener(p),
    };
    return a;
}
