import { UserInputError } from '@vendure/core';
import type { ObjectLiteral, Repository } from 'typeorm';

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

export function isUsableLocation(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
): boolean {
    return (
        typeof latitude === 'number' &&
        typeof longitude === 'number' &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180 &&
        !(latitude === 0 && longitude === 0)
    );
}

export const noLocationSql = (alias: string): string =>
    `(${alias}latitude IS NULL OR ${alias}longitude IS NULL OR (${alias}latitude = 0 AND ${alias}longitude = 0)
      OR ${alias}latitude NOT BETWEEN -90 AND 90 OR ${alias}longitude NOT BETWEEN -180 AND 180)`;

// One conditional UPDATE: it matches only a point still without a usable location, so a concurrent edit wins.
export async function fillMissingLocation<T extends ObjectLiteral>(
    repo: Repository<T>,
    id: number | string,
    location: ResolvedLocation,
): Promise<void> {
    await repo
        .createQueryBuilder()
        .update()
        .set({ latitude: location.latitude, longitude: location.longitude } as never)
        .where(`id = :id AND ${noLocationSql('')}`, { id })
        .execute();
}
