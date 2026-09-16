import { describe, it, expect } from 'vitest';

import {
    findManufacturerNameFromAttributes,
    mapProductCharacteristics,
} from '../../product-characteristics-mapper';

describe('mapProductCharacteristics', () => {
    it('maps the attributes map into rows with group "attribute"', () => {
        const rows = mapProductCharacteristics({
            attributes: {
                Диаметр: { raw: '15', normalized: ['15'] },
                Бренд: { raw: 'Acme', normalized: ['acme'] },
            },
        });

        expect(rows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ group: 'attribute', key: 'Диаметр', rawValue: '15' }),
                expect.objectContaining({ group: 'attribute', key: 'Бренд', rawValue: 'Acme' }),
            ]),
        );
        expect(rows).toHaveLength(2);
    });

    it('maps specifications/technicalRequirements too, if the payload ever carries them', () => {
        const rows = mapProductCharacteristics({
            specifications: { Weight: { raw: '1kg', normalized: ['1kg'] } },
            technicalRequirements: { Voltage: { raw: '220v', normalized: ['220v'] } },
        });

        expect(rows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ group: 'specification', key: 'Weight' }),
                expect.objectContaining({ group: 'technicalRequirement', key: 'Voltage' }),
            ]),
        );
    });

    // proto3's canonical JSON mapping omits an empty map field entirely — an absent key means
    // "no rows for that group," never an explicit empty object.
    it('returns an empty array when the payload carries no characteristic maps at all', () => {
        const rows = mapProductCharacteristics({ sku: 'SKU-1', name: 'Widget' });

        expect(rows).toEqual([]);
    });

    it('JSON-encodes normalized, and treats an empty normalized array as null', () => {
        const rows = mapProductCharacteristics({
            attributes: {
                A: { raw: 'x', normalized: ['x', 'x-alt'] },
                B: { raw: 'y', normalized: [] },
            },
        });

        const rowA = rows.find(r => r.key === 'A');
        const rowB = rows.find(r => r.key === 'B');
        expect(rowA?.normalizedValue).toBe(JSON.stringify(['x', 'x-alt']));
        expect(rowB?.normalizedValue).toBeNull();
    });

    it('treats structuredJson as null when absent (confirmed always the case today)', () => {
        const rows = mapProductCharacteristics({
            attributes: { A: { raw: 'x', normalized: ['x'] } },
        });

        expect(rows[0].structuredJson).toBeNull();
    });
});

describe('findManufacturerNameFromAttributes', () => {
    it('returns the raw value of the Производитель attribute when present', () => {
        const name = findManufacturerNameFromAttributes({
            attributes: { Производитель: { raw: 'Yokohama', normalized: ['yokohama'] } },
        });

        expect(name).toBe('Yokohama');
    });

    it('returns undefined when attributes has no Производитель key', () => {
        const name = findManufacturerNameFromAttributes({
            attributes: { Диаметр: { raw: '15', normalized: ['15'] } },
        });

        expect(name).toBeUndefined();
    });

    it('returns undefined when attributes is absent entirely', () => {
        const name = findManufacturerNameFromAttributes({ sku: 'SKU-1' });

        expect(name).toBeUndefined();
    });
});
