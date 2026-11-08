import { describe, expect, it, vi } from 'vitest';
import type { OrderDetailLine } from '../../api/orderDetail';
import { useOrderLineEditing } from '../../composables/useOrderLineEditing';

vi.mock('../../api/orderLineEdit', () => ({
    changeOrderLineQuantity: vi.fn(),
    removeOrderLine: vi.fn(),
}));
vi.mock('../../api/priceAdjustment', () => ({ requestPriceAdjustment: vi.fn() }));

const line = {
    id: '1',
    quantity: 1,
    unitPriceWithTax: 17000,
    discountedUnitPriceWithTax: 15300,
} as OrderDetailLine;

function build(max: number | null) {
    const editing = useOrderLineEditing({
        orderId: () => '5',
        lines: () => [line],
        caps: () => ({ canEditQuantity: true, canEditPrice: true, canRemove: true }),
        apply: async action => {
            await action();
            return true;
        },
        reference: () => 17000,
        limit: () => max,
    });
    editing.start('1');
    return editing;
}

describe('useOrderLineEditing price and discount', () => {
    it('starts with the percent measured from the reference price', () => {
        expect(build(10).discountText.value).toBe('10');
    });

    it('editing the percent recomputes the unit price and the other way round', () => {
        const e = build(10);
        e.setPercent('30');
        expect(e.edit.draft.value.unitPrice).toBe('119.00');
        e.setPrice('85');
        expect(e.discountText.value).toBe('50');
    });

    it('asks for approval only when deepening past the limit', () => {
        const e = build(10);
        e.setPercent('30');
        expect(e.hint.value.kind).toBe('approval');
        e.setPercent('5');
        expect(e.hint.value.kind).toBe('limit');
    });

    it('shows no hint when the ceiling is unknown', () => {
        const e = build(null);
        e.setPercent('30');
        expect(e.hint.value.kind).toBe('none');
    });
});
