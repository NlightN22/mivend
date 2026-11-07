import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const api = vi.hoisted(() => ({
    fetchOrderLineAvailability: vi.fn(),
    splitOrderLinesByStock: vi.fn(),
}));
vi.mock('../../api/orderLineEdit', () => api);

import { stepperMin } from '../../composables/orderLineStepper';
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

    it('reports the change to the page after a successful edit and resolves true', async () => {
        const changed = vi.fn();
        const edit = useOrderLineEdit(ref('1'), changed);
        await expect(edit.apply(async () => undefined)).resolves.toBe(true);
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it('keeps the server reason, resolves false and does not reload on a refused edit', async () => {
        const changed = vi.fn();
        const edit = useOrderLineEdit(ref('1'), changed);
        const refused = edit.apply(async () => {
            throw new Error('Release the reservation before editing the lines');
        });
        await expect(refused).resolves.toBe(false);
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

    describe('stepper minimum', () => {
        it('lets a multi-line order step down to 0 (remove)', () => {
            expect(stepperMin(true, 5)).toBe(0);
        });

        it('keeps the last line: the minimum is one pack', () => {
            expect(stepperMin(false, 5)).toBe(5);
        });
    });
});
