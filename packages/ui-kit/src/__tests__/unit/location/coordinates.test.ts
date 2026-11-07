import { describe, expect, it } from 'vitest';
import {
    nudgePoint,
    parseCoordinate,
    validateCoordinates,
} from '../../../composables/location/coordinates';

describe('validateCoordinates', () => {
    it.each([
        [50, 30, null],
        [-90, 180, null],
        [90.1, 10, 'latitude'],
        [10, -180.5, 'longitude'],
        [NaN, 10, 'latitude'],
        [10, Infinity, 'longitude'],
        [0, 0, 'notSet'],
        [0, 5, null],
    ])('(%s, %s) -> %s', (lat, lng, expected) => {
        expect(validateCoordinates(lat, lng)).toBe(expected);
    });
});

describe('parseCoordinate', () => {
    it('accepts a decimal comma and rejects empty text', () => {
        expect(parseCoordinate(' 12,5 ')).toBe(12.5);
        expect(parseCoordinate('')).toBeNaN();
        expect(parseCoordinate('abc')).toBeNaN();
    });
});

describe('nudgePoint', () => {
    it('moves further at a lower zoom and wraps the longitude', () => {
        const p = { latitude: 10, longitude: 179.99 };
        const near = nudgePoint(p, 'right', 8);
        expect(near.longitude).toBeLessThan(0);
        const far = nudgePoint({ latitude: 10, longitude: 10 }, 'up', 5);
        const close = nudgePoint({ latitude: 10, longitude: 10 }, 'up', 15);
        expect(far.latitude - 10).toBeGreaterThan(close.latitude - 10);
    });
});
