import { UserInputError } from '@vendure/core';

export interface LocationInput {
    latitude?: number | null;
    longitude?: number | null;
}

export interface ResolvedLocation {
    latitude: number;
    longitude: number;
}

// undefined keeps the stored value, null is an attempt to clear it; either way a valid pair must result.
export function resolveTradingPointLocation(
    input: LocationInput,
    current?: LocationInput | null,
): ResolvedLocation {
    const latitude = input.latitude === undefined ? current?.latitude : input.latitude;
    const longitude = input.longitude === undefined ? current?.longitude : input.longitude;
    if (latitude == null || longitude == null) {
        throw new UserInputError('Trading point location (latitude and longitude) is required');
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new UserInputError('Trading point location must be a valid number');
    }
    if (latitude < -90 || latitude > 90) {
        throw new UserInputError('Latitude must be between -90 and 90');
    }
    if (longitude < -180 || longitude > 180) {
        throw new UserInputError('Longitude must be between -180 and 180');
    }
    if (latitude === 0 && longitude === 0) {
        throw new UserInputError('Location (0, 0) means "not set"; pick the real place');
    }
    return { latitude, longitude };
}
