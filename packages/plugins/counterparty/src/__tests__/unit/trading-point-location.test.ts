import { describe, expect, it } from 'vitest';
import { UserInputError } from '@vendure/core';

import { resolveTradingPointLocation } from '../../trading-point-location';

describe('resolveTradingPointLocation', () => {
    it('accepts a valid pair on create', () => {
        expect(resolveTradingPointLocation({ latitude: 10.5, longitude: -20.25 })).toEqual({
            latitude: 10.5,
            longitude: -20.25,
        });
    });

    it('accepts the range boundaries', () => {
        expect(() => resolveTradingPointLocation({ latitude: -90, longitude: 180 })).not.toThrow();
    });

    it.each([
        ['missing on create', {}],
        ['null latitude', { latitude: null, longitude: 1 }],
        ['only longitude', { longitude: 1 }],
        ['NaN', { latitude: NaN, longitude: 1 }],
        ['Infinity', { latitude: 1, longitude: Infinity }],
        ['latitude too high', { latitude: 90.1, longitude: 1 }],
        ['latitude too low', { latitude: -91, longitude: 1 }],
        ['longitude too high', { latitude: 1, longitude: 181 }],
        ['longitude too low', { latitude: 1, longitude: -180.5 }],
        ['(0, 0)', { latitude: 0, longitude: 0 }],
    ])('rejects %s', (_name, input) => {
        expect(() => resolveTradingPointLocation(input)).toThrow(UserInputError);
    });

    it('keeps the stored location when an edit leaves it out', () => {
        const current = { latitude: 5, longitude: 6 };
        expect(resolveTradingPointLocation({}, current)).toEqual(current);
    });

    it('refuses an edit that clears the location', () => {
        const current = { latitude: 5, longitude: 6 };
        expect(() =>
            resolveTradingPointLocation({ latitude: null, longitude: null }, current),
        ).toThrow(UserInputError);
    });

    it('refuses an edit of a legacy point unless it supplies a location', () => {
        const legacy = { latitude: null, longitude: null };
        expect(() => resolveTradingPointLocation({}, legacy)).toThrow(UserInputError);
        expect(resolveTradingPointLocation({ latitude: 1, longitude: 2 }, legacy)).toEqual({
            latitude: 1,
            longitude: 2,
        });
    });
});
