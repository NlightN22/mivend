import { describe, expect, it } from 'vitest';
import { noPriceAction } from '../../pages/catalog/noPriceAction';

describe('noPriceAction', () => {
    it('links to requests when demo pages are allowed', () => {
        expect(noPriceAction(true)).toEqual({ labelKey: 'buyPanel.requestPrice', to: '/requests' });
    });

    it('offers no action in production', () => {
        expect(noPriceAction(false)).toBeNull();
    });
});
