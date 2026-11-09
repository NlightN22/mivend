import { describe, expect, it } from 'vitest';
import {
    changeRows,
    criteriaChanged,
    emptySelection,
    selectAllMatching,
    selectionCount,
    selectionPayload,
    tickedIds,
} from '../../components/bulk-operations/bulkSelection';

const page1 = ['1', '2', '3'];
const criteria = { search: 'a', readiness: 'ready' };

describe('bulk selection state machine', () => {
    it('page ticks keep accumulating across pages in ids mode', () => {
        let s = changeRows(emptySelection(), new Set(page1), page1);
        s = changeRows(s, new Set([...s.ids, '4', '5']), ['4', '5', '6']);
        expect([...s.ids]).toEqual(['1', '2', '3', '4', '5']);
        expect(selectionCount(s)).toBe(5);
        expect(selectionPayload(s)).toEqual({ ids: ['1', '2', '3', '4', '5'] });
    });

    it('select all matching counts the server total and sends the criteria, not ids', () => {
        const s = selectAllMatching(
            changeRows(emptySelection(), new Set(page1), page1),
            47,
            criteria,
        );
        expect(selectionCount(s)).toBe(47);
        expect(selectionPayload(s)).toEqual({ matching: criteria });
        expect(tickedIds(s, ['7', '8'])).toEqual(new Set(['7', '8']));
    });

    it('unticking a row resets the mode with a message and keeps the remaining page ticks', () => {
        const all = selectAllMatching(emptySelection(), 47, criteria);
        const s = changeRows(all, new Set(['1', '3']), page1);
        expect(s.matching).toBeNull();
        expect([...s.ids]).toEqual(['1', '3']);
        expect(s.notice).toMatch(/unticked/);
    });

    it('clearing everything in all-matching mode is a plain clear without a warning', () => {
        const s = changeRows(selectAllMatching(emptySelection(), 47, criteria), new Set(), page1);
        expect(s).toEqual(emptySelection());
    });

    it('re-emitting the unchanged page keeps all-matching mode', () => {
        const all = selectAllMatching(emptySelection(), 47, criteria);
        expect(changeRows(all, new Set(page1), page1)).toBe(all);
    });

    it('a changed filter or search resets all-matching mode; the same criteria do not', () => {
        const all = selectAllMatching(emptySelection(), 47, criteria);
        expect(criteriaChanged(all, { ...criteria })).toBe(all);
        const reset = criteriaChanged(all, { ...criteria, search: 'b' });
        expect(reset.matching).toBeNull();
        expect(reset.ids.size).toBe(0);
        expect(reset.notice).toMatch(/filter changed/);
    });

    it('a changed filter leaves a plain ids selection alone', () => {
        const s = changeRows(emptySelection(), new Set(page1), page1);
        expect(criteriaChanged(s, { search: 'zzz' })).toBe(s);
    });
});
