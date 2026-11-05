import { describe, expect, it } from 'vitest';

import { headerDeliveryLabel } from '../../composables/headerDeliveryLabel';

describe('headerDeliveryLabel', () => {
    it('shows the counterparty full name and the trading point name, not its address', () => {
        expect(headerDeliveryLabel('Org LLC', { name: 'Point A', address: 'Street 1' })).toEqual({
            organization: 'Org LLC',
            place: 'Point A',
        });
    });

    it('falls back to the address when the trading point has no name', () => {
        expect(headerDeliveryLabel('Org LLC', { name: '  ', address: 'Street 1' }).place).toBe(
            'Street 1',
        );
        expect(headerDeliveryLabel('Org LLC', { name: null, address: 'Street 1' }).place).toBe(
            'Street 1',
        );
    });

    it('is empty without a counterparty or a trading point', () => {
        expect(headerDeliveryLabel(null, null)).toEqual({ organization: '', place: '' });
        expect(headerDeliveryLabel(undefined, { name: 'Point A' })).toEqual({
            organization: '',
            place: 'Point A',
        });
    });
});
