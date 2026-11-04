import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client', () => ({ adminApi: vi.fn() }));
vi.mock('../../api/discounts', () => ({ fetchPriceTypeCodes: vi.fn() }));
vi.mock('../../api/catalog', () => ({
    fetchPriceEntriesForVariants: vi.fn(),
    fetchFloorPricesForVariants: vi.fn(),
}));

import { fetchFloorPricesForVariants, fetchPriceEntriesForVariants } from '../../api/catalog';
import { fetchPriceTypeCodes } from '../../api/discounts';
import { fetchPricesForVariant } from '../../api/productDetail';

describe('fetchPricesForVariant', () => {
    beforeEach(() => {
        vi.mocked(fetchPriceTypeCodes).mockResolvedValue(['WHOLESALE', 'RETAIL', 'HIDDEN']);
        vi.mocked(fetchPriceEntriesForVariants).mockImplementation(async (_ids, code) =>
            code === 'HIDDEN' ? null : new Map([['v1', code === 'RETAIL' ? 120 : 100]]),
        );
        vi.mocked(fetchFloorPricesForVariants).mockResolvedValue(new Map([['v1', 80]]));
    });

    it('keeps the price type order, null for a type the caller cannot read, and adds floor', async () => {
        const rows = await fetchPricesForVariant('v1');
        expect(rows).toEqual([
            { priceTypeCode: 'WHOLESALE', label: 'Wholesale', price: 100 },
            { priceTypeCode: 'RETAIL', label: 'Retail', price: 120 },
            { priceTypeCode: 'HIDDEN', label: 'Hidden', price: null },
            { priceTypeCode: 'floor', label: 'Floor price', price: 80 },
        ]);
    });

    it('requests all price types without waiting for the previous one', async () => {
        let inFlight = 0;
        let peak = 0;
        vi.mocked(fetchPriceEntriesForVariants).mockImplementation(async () => {
            peak = Math.max(peak, ++inFlight);
            await Promise.resolve();
            inFlight--;
            return new Map();
        });
        await fetchPricesForVariant('v1');
        expect(peak).toBe(3);
    });

    it('omits the floor row when the caller may not read it', async () => {
        vi.mocked(fetchFloorPricesForVariants).mockResolvedValue(null);
        expect((await fetchPricesForVariant('v1')).map(r => r.priceTypeCode)).not.toContain(
            'floor',
        );
    });
});
