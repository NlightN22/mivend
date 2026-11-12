import { describe, it, expect } from 'vitest';
import { tradingPointCustomerUsable, tradingPointDefects } from '../../trading-point-usability';

const ok = { address: 'Addr 1', latitude: 10, longitude: 20, isActive: true };

describe('tradingPointDefects', () => {
    it('is empty for a complete active point', () => {
        expect(tradingPointDefects(ok)).toEqual([]);
    });

    it('names a missing or blank address', () => {
        expect(tradingPointDefects({ ...ok, address: '' })).toEqual(['NO_ADDRESS']);
        expect(tradingPointDefects({ ...ok, address: '  ' })).toEqual(['NO_ADDRESS']);
    });

    it.each([
        [null, null],
        [0, 0],
        [95, 10],
    ])('names unusable coordinates (%s, %s)', (latitude, longitude) => {
        expect(tradingPointDefects({ ...ok, latitude, longitude })).toEqual(['NO_LOCATION']);
    });

    it('names an inactive point and combines defects', () => {
        expect(
            tradingPointDefects({ address: '', latitude: null, longitude: null, isActive: false }),
        ).toEqual(['NO_ADDRESS', 'NO_LOCATION', 'INACTIVE']);
    });
});

describe('tradingPointCustomerUsable', () => {
    it('is true for a complete point and for one that only lacks coordinates', () => {
        expect(tradingPointCustomerUsable(ok)).toBe(true);
        expect(tradingPointCustomerUsable({ ...ok, latitude: null, longitude: null })).toBe(true);
    });

    it('is false without an address or when inactive', () => {
        expect(tradingPointCustomerUsable({ ...ok, address: '' })).toBe(false);
        expect(tradingPointCustomerUsable({ ...ok, isActive: false })).toBe(false);
    });
});
