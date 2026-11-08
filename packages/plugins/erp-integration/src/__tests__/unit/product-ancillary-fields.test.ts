import { describe, it, expect } from 'vitest';
import { create, toJson } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { ProductChangedSchema, SourceFieldValueSchema } from '@nlightn22/event-contracts';

import {
    extractBarcodes,
    extractErpCreatedAt,
    extractManufacturerCodes,
    extractManufacturerId,
    extractSourceFieldsText,
    extractStorageUnitId,
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

    it('drops repeated codes so the unique (variant, code) index is not hit', () => {
        expect(extractBarcodes({ barcodes: ['111', '222', '111'] })).toEqual(['111', '222']);
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

describe('extractErpCreatedAt', () => {
    const field = (value: unknown) => ({ sourceFields: { ДатаСоздания: value } });

    it('reads the date value from the wire JSON of a real ProductChanged', () => {
        const message = create(ProductChangedSchema, {
            sourceFields: {
                ДатаСоздания: create(SourceFieldValueSchema, {
                    value: {
                        case: 'dateValue',
                        value: timestampFromDate(new Date('2013-09-12T02:25:10Z')),
                    },
                }),
            },
        });
        const payload = toJson(ProductChangedSchema, message) as Record<string, unknown>;

        expect(extractErpCreatedAt(payload)?.toISOString()).toBe('2013-09-12T02:25:10.000Z');
    });

    it('ignores any other value kind', () => {
        expect(extractErpCreatedAt(field({ stringValue: '2013-09-12T02:25:10Z' }))).toBeNull();
        expect(extractErpCreatedAt(field({ numberValue: 5 }))).toBeNull();
    });

    it('is null when the key, the map or a parseable date is missing', () => {
        expect(extractErpCreatedAt({})).toBeNull();
        expect(extractErpCreatedAt({ sourceFields: {} })).toBeNull();
        expect(extractErpCreatedAt(field({ dateValue: 'not a date' }))).toBeNull();
    });
});

describe('extractStorageUnitId', () => {
    it('reads the id and treats absent or empty as none', () => {
        expect(extractStorageUnitId({ storageUnitId: 'unit-1' })).toBe('unit-1');
        expect(extractStorageUnitId({})).toBeNull();
        expect(extractStorageUnitId({ storageUnitId: '' })).toBeNull();
    });
});

describe('extractSourceFieldsText', () => {
    it('stores the whole map as received and null for an absent or empty map', () => {
        const fields = { Артикул: { stringValue: 'A-1' }, Вес: { numberValue: 2 } };
        expect(JSON.parse(extractSourceFieldsText({ sourceFields: fields }) ?? 'null')).toEqual(
            fields,
        );
        expect(extractSourceFieldsText({})).toBeNull();
        expect(extractSourceFieldsText({ sourceFields: {} })).toBeNull();
    });
});
