import type { GeoPoint } from '../../components/MvLocationPicker/types';

export type CoordinateError = 'latitude' | 'longitude' | 'notSet';

export function parseCoordinate(raw: string): number {
    const text = raw.trim().replace(',', '.');
    return text === '' ? NaN : Number(text);
}

export function validateCoordinates(latitude: number, longitude: number): CoordinateError | null {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return 'latitude';
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return 'longitude';
    if (latitude === 0 && longitude === 0) return 'notSet';
    return null;
}

export function isValidPoint(point: GeoPoint | null | undefined): point is GeoPoint {
    return !!point && validateCoordinates(point.latitude, point.longitude) === null;
}

export function normalizeLongitude(longitude: number): number {
    return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

export function nudgePoint(
    point: GeoPoint,
    direction: 'up' | 'down' | 'left' | 'right',
    zoom: number,
): GeoPoint {
    const step = (360 / 2 ** zoom / 256) * 20;
    const dLat = direction === 'up' ? step : direction === 'down' ? -step : 0;
    const dLng = direction === 'right' ? step : direction === 'left' ? -step : 0;
    return {
        latitude: Math.max(-90, Math.min(90, point.latitude + dLat)),
        longitude: normalizeLongitude(point.longitude + dLng),
    };
}
