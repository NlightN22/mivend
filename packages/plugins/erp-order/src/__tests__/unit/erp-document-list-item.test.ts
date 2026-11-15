import { describe, expect, it } from 'vitest';

import { toItem } from '../../erp-document-list/erp-document-list.service';

const raw = (currency: unknown): Record<string, unknown> => ({
    id: 1,
    number: '5',
    amountMinor: 100,
    currency,
});

describe('ERP document list item', () => {
    it('turns the ERP numeric currency into the alphabetic code', () => {
        expect(toItem(raw('643'), undefined).currency).toBe('RUB');
        expect(toItem(raw('USD'), undefined).currency).toBe('USD');
        expect(toItem(raw('999'), undefined).currency).toBe('999');
        expect(toItem(raw(null), undefined).currency).toBeNull();
    });
});
