import { describe, expect, it } from 'vitest';
import { headerActions, type HeaderActionInputs } from '../../utils/orderHeaderActions';

const base: HeaderActionInputs = {
    canConfirm: true,
    confirmable: true,
    reserved: false,
    canExtend: true,
    canSeeChecks: true,
    cancelVisible: true,
};
// The order's own proforma invoices and documents are reachable from the menu in every state.
const LISTS = ['proformas', 'documents'];
const keys = (i: Partial<HeaderActionInputs>, mobile = false): string[] =>
    headerActions({ ...base, ...i }, mobile).menu.map(m => m.key);

describe('header action gating', () => {
    it('offers confirm only to a confirmer before a reservation exists', () => {
        expect(headerActions(base, false).confirm).toBe(true);
        expect(headerActions({ ...base, canConfirm: false }, false).confirm).toBe(false);
        expect(headerActions({ ...base, reserved: true }, false).confirm).toBe(false);
        expect(headerActions({ ...base, confirmable: false }, false).confirm).toBe(false);
    });

    it('offers release to a confirmer and extend only with an extension limit, after confirming', () => {
        expect(keys({})).toEqual(['recompute', ...LISTS]);
        expect(keys({ reserved: true })).toEqual(['recompute', ...LISTS, 'release', 'extend']);
        expect(keys({ reserved: true, canExtend: false })).toEqual([
            'recompute',
            ...LISTS,
            'release',
        ]);
        expect(keys({ reserved: true, canConfirm: false })).toEqual([
            'recompute',
            ...LISTS,
            'extend',
        ]);
    });

    it('offers recompute only to a caller who can read checks', () => {
        expect(keys({ canSeeChecks: false })).toEqual(LISTS);
    });

    it('shows cancel only when the caller may and the order is cancellable', () => {
        expect(headerActions({ ...base, cancelVisible: false }, false).cancel).toBe(false);
        expect(headerActions(base, false).cancel).toBe(true);
    });

    it('moves confirm and cancel into the menu on mobile, with the same gates', () => {
        const m = headerActions(base, true);
        expect([m.confirm, m.cancel]).toEqual([false, false]);
        expect(m.menu.map(i => i.key)).toEqual(['confirm', 'recompute', ...LISTS, 'cancel']);
        expect(keys({ cancelVisible: false, canConfirm: false }, true)).toEqual([
            'recompute',
            ...LISTS,
        ]);
    });
});
