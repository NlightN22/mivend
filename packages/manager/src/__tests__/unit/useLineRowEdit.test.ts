import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
    changeOrderLineQuantity: vi.fn(),
    removeOrderLine: vi.fn(),
    requestPriceAdjustment: vi.fn(),
}));
vi.mock('../../api/orderLineEdit', () => api);
vi.mock('../../api/priceAdjustment', () => ({
    requestPriceAdjustment: api.requestPriceAdjustment,
}));

import { useLineRowEdit } from '../../composables/useLineRowEdit';

function setup(applyResult = true) {
    const apply = vi.fn(async (action: () => Promise<void>) => {
        if (!applyResult) return false;
        await action();
        return true;
    });
    const edit = useLineRowEdit({
        orderId: () => 'o1',
        lineId: () => 'l1',
        original: () => ({ quantity: 2, unitPriceMinor: 10000 }),
        caps: () => ({ canEditQuantity: true, canEditPrice: true, canRemove: true }),
        apply,
    });
    return { edit, apply };
}

describe('line row edit state machine', () => {
    beforeEach(() => vi.resetAllMocks());

    it('goes idle -> editing -> idle on cancel without calling the server', () => {
        const { edit, apply } = setup();
        expect(edit.state.value).toBe('idle');
        edit.start();
        expect(edit.state.value).toBe('editing');
        edit.cancel();
        expect(edit.state.value).toBe('idle');
        expect(apply).not.toHaveBeenCalled();
    });

    it('applies a quantity change immediately through the existing mutation', async () => {
        const { edit } = setup();
        edit.start();
        edit.draft.value.quantity = 4;
        await edit.commit();
        expect(api.changeOrderLineQuantity).toHaveBeenCalledWith('o1', 'l1', 4);
        expect(api.requestPriceAdjustment).not.toHaveBeenCalled();
        expect(edit.state.value).toBe('idle');
    });

    it('requests a price adjustment and records when it needs approval', async () => {
        api.requestPriceAdjustment.mockResolvedValue({ decision: 'requires-approval' });
        const { edit } = setup();
        edit.start();
        edit.draft.value.unitPrice = '80';
        edit.draft.value.justification = 'competitor offer';
        await edit.commit();
        expect(api.requestPriceAdjustment).toHaveBeenCalledWith(
            'o1',
            'l1',
            8000,
            'competitor offer',
        );
        expect(edit.sentForApproval.value).toBe(true);
    });

    it('removes the line when the quantity is stepped to zero', async () => {
        const { edit } = setup();
        edit.start();
        edit.draft.value.quantity = 0;
        await edit.commit();
        expect(api.removeOrderLine).toHaveBeenCalledWith('o1', 'l1');
    });

    it('stays in edit mode when the server refuses, keeping the draft', async () => {
        const { edit } = setup(false);
        edit.start();
        edit.draft.value.quantity = 4;
        await edit.commit();
        expect(edit.state.value).toBe('editing');
        expect(edit.draft.value.quantity).toBe(4);
    });

    it('closes without a call when nothing changed and refuses an invalid price in place', async () => {
        const { edit, apply } = setup();
        edit.start();
        await edit.commit();
        expect(edit.state.value).toBe('idle');
        edit.start();
        edit.draft.value.unitPrice = 'abc';
        await edit.commit();
        expect(edit.state.value).toBe('editing');
        expect(edit.error.value).toBe('Enter a valid price');
        expect(apply).not.toHaveBeenCalled();
    });
});
