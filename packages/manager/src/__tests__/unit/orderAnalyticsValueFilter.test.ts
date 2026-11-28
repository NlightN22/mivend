import { describe, expect, it } from 'vitest';
import {
    NOT_SPECIFIED_TOKEN,
    buildValueFilterColumns,
    conditionsToValueFilters,
} from '../../api/orderAnalyticsValueFilter';

describe('conditionsToValueFilters', () => {
    it('sends picked values exactly, the not-specified token as an empty string, and exclusions apart', () => {
        expect(
            conditionsToValueFilters([
                {
                    columnKey: 'shipmentScheme',
                    operator: 'in',
                    value: ['scheme-a', NOT_SPECIFIED_TOKEN],
                },
                { columnKey: 'orderStatus', operator: 'notIn', value: [' status-a '] },
                { columnKey: 'orderStatus', operator: 'in', value: [] },
                { columnKey: 'customer', operator: 'in', value: ['x'] },
            ]),
        ).toEqual([
            { kind: 'SHIPMENT_SCHEME', values: ['scheme-a', ''] },
            { kind: 'ORDER_STATUS', values: [' status-a '], exclude: true },
        ]);
    });
});

describe('buildValueFilterColumns', () => {
    it('offers a multi select per kind with counts and skips kinds without values', () => {
        const columns = buildValueFilterColumns({
            shipmentScheme: [
                { value: '', orderCount: 2 },
                { value: 'scheme-a', orderCount: 5 },
            ],
            orderStatus: [],
        });
        expect(columns).toHaveLength(1);
        expect(columns[0]).toMatchObject({ key: 'shipmentScheme', operators: ['in', 'notIn'] });
        expect(columns[0]!.options).toEqual([
            { value: NOT_SPECIFIED_TOKEN, label: expect.stringContaining('(2)') },
            { value: 'scheme-a', label: 'scheme-a (5)' },
        ]);
    });
});
