import { describe, expect, it } from 'vitest';

import { mapProducts } from '../../mappers/product.mapper';
import type { OnecProduct } from '../../types';

describe('mapProducts', () => {
    it('maps 1C product to product.updated event', () => {
        const product: OnecProduct = {
            Ref_Key: 'abc-123',
            Description: 'Фильтр масляный',
            Артикул: 'OIL-001',
            ПометкаУдаления: false,
        };
        const events = mapProducts([product]);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            type: 'product.updated',
            payload: { productId: 'abc-123', name: 'Фильтр масляный', enabled: true },
        });
    });

    it('maps deleted product as disabled', () => {
        const product: OnecProduct = {
            Ref_Key: 'xyz-999',
            Description: 'Удалённый товар',
            Артикул: 'DEL-001',
            ПометкаУдаления: true,
        };
        const events = mapProducts([product]);
        expect(events[0].payload).toMatchObject({ enabled: false });
    });

    it('returns empty array for empty input', () => {
        expect(mapProducts([])).toHaveLength(0);
    });
});
