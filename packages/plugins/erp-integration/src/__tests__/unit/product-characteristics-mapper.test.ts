import { describe, it, expect } from 'vitest';

import { mapProductCharacteristics } from '../../product-characteristics-mapper';

describe('mapProductCharacteristics', () => {
    it('reads no attribute rows: the attributes map is not part of the event any more', () => {
        const rows = mapProductCharacteristics({
            attributes: { Диаметр: { raw: '15', normalized: ['15'] } },
        });

        expect(rows).toEqual([]);
    });

    it('maps specifications and technical requirements', () => {
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
            specifications: {
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
            specifications: { A: { raw: 'x', normalized: ['x'] } },
        });

        expect(rows[0].structuredJson).toBeNull();
    });
});
