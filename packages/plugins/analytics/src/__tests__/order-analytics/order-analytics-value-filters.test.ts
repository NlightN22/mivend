import { UserInputError } from '@vendure/core';
import { describe, expect, it } from 'vitest';

import { splitValueFilters } from '../../order-analytics/order-analytics-value-filters';

describe('splitValueFilters', () => {
    it('keeps exact values, the empty one included, and leaves entity filters for name resolution', () => {
        const { named, values } = splitValueFilters([
            { kind: 'CUSTOMER', values: ['a'] },
            { kind: 'SHIPMENT_SCHEME', values: ['scheme-a', ''] },
            { kind: 'SHIPMENT_SCHEME', values: ['scheme-b'], exclude: true },
            { kind: 'ORDER_STATUS', values: [' status-a '] },
            { kind: 'ORDER_STATUS', values: [''], exclude: true },
        ]);
        expect(named).toEqual([{ kind: 'CUSTOMER', values: ['a'] }]);
        expect(values).toEqual({
            shipmentSchemes: ['scheme-a', ''],
            excludeShipmentSchemes: ['scheme-b'],
            orderStatuses: [' status-a '],
            excludeOrderStatuses: [''],
        });
    });

    it('rejects more than 1000 values with a user input error', () => {
        const many = Array.from({ length: 1001 }, (_, i) => `v${i}`);
        expect(() => splitValueFilters([{ kind: 'ORDER_STATUS', values: many }])).toThrow(
            UserInputError,
        );
    });
});
