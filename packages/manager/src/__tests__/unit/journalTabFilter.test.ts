import { describe, expect, it } from 'vitest';
import { toJournalFilter } from '../../components/change-journal/journalTabFilter';

describe('toJournalFilter', () => {
    it('maps a blank state to an empty filter', () => {
        expect(toJournalFilter(' ', [])).toEqual({
            search: undefined,
            action: undefined,
            actorType: undefined,
            administratorId: undefined,
            occurredAfter: undefined,
            occurredBefore: undefined,
        });
    });

    it('maps search, select conditions and the date range, never an entity type', () => {
        const filter = toJournalFilter(' phone ', [
            { columnKey: 'action', operator: 'eq', value: 'update' },
            { columnKey: 'actor', operator: 'eq', value: 'acting' },
            { columnKey: 'administrator', operator: 'eq', value: '4' },
            { columnKey: 'occurredAt', operator: 'before', value: '2026-03-10' },
            { columnKey: 'entityType', operator: 'eq', value: 'Order' },
        ]);
        expect(filter).toMatchObject({
            search: 'phone',
            action: 'update',
            actorType: 'acting',
            administratorId: '4',
            occurredBefore: new Date('2026-03-10T00:00:00').toISOString(),
        });
        expect(filter).not.toHaveProperty('entityType');
    });
});
