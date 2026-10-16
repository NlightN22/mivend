import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const api = vi.hoisted(() => ({
    changeOrderLineQuantity: vi.fn(),
    fetchOrderLineAvailability: vi.fn(),
    removeOrderLine: vi.fn(),
    splitOrderLinesByStock: vi.fn(),
}));
vi.mock('../../api/orderLineEdit', () => api);

import { stepperMin, stepperOutcome } from '../../composables/orderLineStepper';
import { useOrderLineEdit } from '../../composables/useOrderLineEdit';

describe('useOrderLineEdit', () => {
    beforeEach(() => vi.resetAllMocks());

    it('indexes availability by order line', async () => {
        api.fetchOrderLineAvailability.mockResolvedValue([
            { orderLineId: '7', needed: 5, fitting: 2, step: 5 },
        ]);
        const edit = useOrderLineEdit(ref('1'), vi.fn());
        await edit.load();
        expect(edit.availability.value.get('7')?.fitting).toBe(2);
        expect(edit.availability.value.get('7')?.step).toBe(5);
    });

    it('reports the change to the page after a successful edit', async () => {
        const changed = vi.fn();
        const edit = useOrderLineEdit(ref('1'), changed);
        await edit.setQuantity('7', 3);
        expect(api.changeOrderLineQuantity).toHaveBeenCalledWith('1', '7', 3);
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it('keeps the server reason and does not reload on a refused edit', async () => {
        api.removeOrderLine.mockRejectedValue(
            new Error('Release the reservation before editing the lines'),
        );
        const changed = vi.fn();
        const edit = useOrderLineEdit(ref('1'), changed);
        await edit.remove('7');
        expect(edit.error.value).toMatch(/Release the reservation/);
        expect(changed).not.toHaveBeenCalled();
        expect(edit.busy.value).toBe(false);
    });

    it('stores the outcome of cutting to stock', async () => {
        api.splitOrderLinesByStock.mockResolvedValue([
            { orderLineId: '7', requested: 10, kept: 4, shortfall: 6 },
        ]);
        const edit = useOrderLineEdit(ref('1'), vi.fn());
        await edit.cutToStock();
        expect(edit.lastSplit.value).toHaveLength(1);
    });

    it('reports a repeated cut as already within stock, not as an error', async () => {
        api.splitOrderLinesByStock.mockResolvedValue([]);
        const edit = useOrderLineEdit(ref('1'), vi.fn());
        await edit.cutToStock();
        expect(edit.alreadyWithinStock.value).toBe(true);
        expect(edit.error.value).toBe('');
    });

    describe('stepper remove flow', () => {
        it('stepping to 0 on a multi-line order asks to confirm, and confirming removes the line', async () => {
            expect(stepperMin(true, 5)).toBe(0);
            expect(stepperOutcome(0, 10, true)).toEqual({ kind: 'confirm-remove' });
            const edit = useOrderLineEdit(ref('1'), vi.fn());
            await edit.remove('7');
            expect(api.removeOrderLine).toHaveBeenCalledWith('1', '7');
        });

        it('keeps the last line: the minimum is one pack and zero is ignored', () => {
            expect(stepperMin(false, 5)).toBe(5);
            expect(stepperOutcome(0, 10, false)).toBeNull();
        });

        it('saves any other changed quantity and ignores an unchanged one', () => {
            expect(stepperOutcome(15, 10, true)).toEqual({ kind: 'save', quantity: 15 });
            expect(stepperOutcome(10, 10, true)).toBeNull();
        });
    });
});
