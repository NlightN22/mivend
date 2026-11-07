import { describe, expect, it } from 'vitest';
import { initialDraft, planLineEdit, type LineCapabilities } from '../../utils/lineEditPlan';

const original = { quantity: 2, unitPriceMinor: 10000 };
const caps: LineCapabilities = { canEditQuantity: true, canEditPrice: true, canRemove: true };

describe('line edit plan', () => {
    it('starts from the current quantity and price in major units', () => {
        expect(initialDraft(original)).toEqual({
            quantity: 2,
            unitPrice: '100.00',
            justification: '',
        });
    });

    it('plans nothing for an untouched draft', () => {
        expect(planLineEdit(original, initialDraft(original), caps)).toEqual({
            ops: [],
            error: null,
        });
    });

    it('plans a quantity change and a price request together, price in minor units', () => {
        const draft = { quantity: 3, unitPrice: '95.5', justification: ' loyal customer ' };
        expect(planLineEdit(original, draft, caps).ops).toEqual([
            { kind: 'quantity', quantity: 3 },
            { kind: 'price', requestedPrice: 9550, justification: 'loyal customer' },
        ]);
    });

    it('removes the line at zero and ignores a price change on a removed line', () => {
        const draft = { quantity: 0, unitPrice: '1.00', justification: '' };
        expect(planLineEdit(original, draft, caps).ops).toEqual([{ kind: 'remove' }]);
    });

    it('refuses to remove the last line', () => {
        const draft = { ...initialDraft(original), quantity: 0 };
        const plan = planLineEdit(original, draft, { ...caps, canRemove: false });
        expect(plan.ops).toEqual([]);
        expect(plan.error).toMatch(/last line/);
    });

    it('rejects an invalid price and honours capability gates', () => {
        expect(
            planLineEdit(original, { ...initialDraft(original), unitPrice: '' }, caps).error,
        ).toBeTruthy();
        expect(
            planLineEdit(original, { ...initialDraft(original), unitPrice: '-1' }, caps).error,
        ).toBeTruthy();
        const draft = { quantity: 5, unitPrice: '50', justification: '' };
        expect(planLineEdit(original, draft, { ...caps, canEditQuantity: false }).ops).toEqual([
            { kind: 'price', requestedPrice: 5000, justification: undefined },
        ]);
        expect(planLineEdit(original, draft, { ...caps, canEditPrice: false }).ops).toEqual([
            { kind: 'quantity', quantity: 5 },
        ]);
    });
});
