import { describe, it, expect } from 'vitest';

import {
    extractBarcodes,
    extractManufacturerCodes,
    extractManufacturerId,
} from '../../product-ancillary-fields';

describe('extractManufacturerId', () => {
    it('returns the GUID when present', () => {
        expect(extractManufacturerId({ manufacturer: 'guid-1' })).toBe('guid-1');
    });

    it('returns undefined when absent (proto3 optional-unset omission)', () => {
        expect(extractManufacturerId({ sku: 'SKU-1' })).toBeUndefined();
    });

    it('treats an empty string the same as absent', () => {
        expect(extractManufacturerId({ manufacturer: '' })).toBeUndefined();
    });
});

describe('extractBarcodes', () => {
    it('returns the array when present', () => {
        expect(extractBarcodes({ barcodes: ['111', '222'] })).toEqual(['111', '222']);
    });

    it('returns an empty array when absent (proto3 empty-repeated-field omission)', () => {
        expect(extractBarcodes({ sku: 'SKU-1' })).toEqual([]);
    });

    it('filters out empty-string entries', () => {
        expect(extractBarcodes({ barcodes: ['111', ''] })).toEqual(['111']);
    });
});

describe('extractManufacturerCodes', () => {
    it('maps the repeated ManufacturerCode entries', () => {
        const rows = extractManufacturerCodes({
            manufacturerCodes: [{ lineNumber: 2, code: 'OEM-1', manufacturer: 'guid-other' }],
        });

        expect(rows).toEqual([{ lineNumber: 2, code: 'OEM-1', manufacturer: 'guid-other' }]);
    });

    it('returns an empty array when absent', () => {
        expect(extractManufacturerCodes({ sku: 'SKU-1' })).toEqual([]);
    });

    it('drops entries with no code', () => {
        const rows = extractManufacturerCodes({
            manufacturerCodes: [{ lineNumber: 1, code: '', manufacturer: 'guid-other' }],
        });

        expect(rows).toEqual([]);
    });
});
