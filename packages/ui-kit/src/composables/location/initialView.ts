import type { GeoConfig, GeoPoint, MapView } from '../../components/MvLocationPicker/types';
import { isValidPoint } from './coordinates';

export type InitialViewSource = 'suggestion' | 'sibling' | 'config' | 'world';

const POINT_ZOOM = 16;
const SIBLING_ZOOM = 14;
const FALLBACK_ZOOM = 10;
const WORLD_VIEW: MapView = { center: { latitude: 0, longitude: 0 }, zoom: 2 };

export function resolveInitialView(input: {
    suggestion?: GeoPoint | null;
    sibling?: GeoPoint | null;
    config: GeoConfig;
}): MapView & { source: InitialViewSource } {
    if (isValidPoint(input.suggestion)) {
        return { center: input.suggestion, zoom: POINT_ZOOM, source: 'suggestion' };
    }
    if (isValidPoint(input.sibling)) {
        return { center: input.sibling, zoom: SIBLING_ZOOM, source: 'sibling' };
    }
    const { defaultLatitude: lat, defaultLongitude: lng, defaultZoom: zoom } = input.config;
    if (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        isValidPoint({ latitude: lat, longitude: lng })
    ) {
        return {
            center: { latitude: lat, longitude: lng },
            zoom: zoom ?? FALLBACK_ZOOM,
            source: 'config',
        };
    }
    return { ...WORLD_VIEW, source: 'world' };
}
