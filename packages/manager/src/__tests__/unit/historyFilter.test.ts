import { describe, expect, it } from 'vitest';
import { toHistoryOptions } from '../../components/history/historyFilter';
import { dateConditionRange } from '../../utils/dateConditionRange';

const iso = (day: string): string => new Date(`${day}T00:00:00`).toISOString();
const DAY = 24 * 60 * 60 * 1000;

describe('toHistoryOptions', () => {
    it('maps a blank state to no filters', () => {
        expect(toHistoryOptions('  ', [])).toEqual({
            search: undefined,
            action: undefined,
            entityName: undefined,
            system: undefined,
            administratorId: undefined,
            createdAfter: undefined,
            createdBefore: undefined,
        });
    });

    it('maps select conditions and the search term', () => {
        const options = toHistoryOptions(' phone ', [
            { columnKey: 'action', operator: 'eq', value: 'update' },
            { columnKey: 'entityName', operator: 'eq', value: 'TradingPoint' },
            { columnKey: 'changedBy', operator: 'eq', value: '7' },
        ]);
        expect(options).toMatchObject({
            search: 'phone',
            action: 'update',
            entityName: 'TradingPoint',
            administratorId: '7',
            system: undefined,
        });
    });

    it('turns the system changer into the system flag, never an administrator id', () => {
        const options = toHistoryOptions('', [
            { columnKey: 'changedBy', operator: 'eq', value: 'system' },
        ]);
        expect(options.system).toBe(true);
        expect(options.administratorId).toBeUndefined();
    });

    it('ignores a negated select, which the server cannot apply', () => {
        const options = toHistoryOptions('', [
            { columnKey: 'action', operator: 'notEq', value: 'update' },
        ]);
        expect(options.action).toBeUndefined();
    });
});

describe('dateConditionRange', () => {
    it('covers whole local days: after starts the next day, before ends at the day start', () => {
        const after = dateConditionRange(
            [{ columnKey: 'createdAt', operator: 'after', value: '2026-03-10' }],
            'createdAt',
        );
        expect(after).toEqual({
            from: new Date(Date.parse(iso('2026-03-10')) + DAY).toISOString(),
        });
        const before = dateConditionRange(
            [{ columnKey: 'createdAt', operator: 'before', value: '2026-03-10' }],
            'createdAt',
        );
        expect(before).toEqual({ to: iso('2026-03-10') });
    });

    it('between includes both end days', () => {
        const range = dateConditionRange(
            [{ columnKey: 'createdAt', operator: 'between', value: ['2026-03-10', '2026-03-12'] }],
            'createdAt',
        );
        expect(range).toEqual({
            from: iso('2026-03-10'),
            to: new Date(Date.parse(iso('2026-03-12')) + DAY).toISOString(),
        });
    });

    it('skips other columns', () => {
        expect(
            dateConditionRange(
                [{ columnKey: 'x', operator: 'before', value: '2026-03-10' }],
                'createdAt',
            ),
        ).toEqual({});
    });
});
