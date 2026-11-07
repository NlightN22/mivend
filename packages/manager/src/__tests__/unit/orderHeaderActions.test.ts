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
        expect(keys({})).toEqual(['recompute']);
        expect(keys({ reserved: true })).toEqual(['recompute', 'release', 'extend']);
        expect(keys({ reserved: true, canExtend: false })).toEqual(['recompute', 'release']);
        expect(keys({ reserved: true, canConfirm: false })).toEqual(['recompute', 'extend']);
    });

    it('offers recompute only to a caller who can read checks', () => {
        expect(keys({ canSeeChecks: false })).toEqual([]);
    });

    it('shows cancel only when the caller may and the order is cancellable', () => {
        expect(headerActions({ ...base, cancelVisible: false }, false).cancel).toBe(false);
        expect(headerActions(base, false).cancel).toBe(true);
    });

    it('moves confirm and cancel into the menu on mobile, with the same gates', () => {
        const m = headerActions(base, true);
        expect([m.confirm, m.cancel]).toEqual([false, false]);
        expect(m.menu.map(i => i.key)).toEqual(['confirm', 'recompute', 'cancel']);
        expect(keys({ cancelVisible: false, canConfirm: false }, true)).toEqual(['recompute']);
    });
});
